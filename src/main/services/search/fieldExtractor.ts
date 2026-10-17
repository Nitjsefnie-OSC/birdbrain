import * as cheerio from 'cheerio'
import type { CaptureLinks } from '@shared/types'
import { HEADER_FIELDS } from '@shared/searchFields'
import {
  EXTRACTION_RULES,
  type ExtractedDatum,
  type ExtractionRule
} from '@main/services/dataExtractor'
import { extractIocs } from '@main/services/extraction/iocAdapter'
import { isValidEmail } from '@main/services/extraction/validators'
import {
  CAPTURE_LINK_BUDGETS,
  documentBase,
  readHtmlParts,
  resolveUrl,
  type CaptureLinkBudgets,
  type HtmlPartInput,
  type HtmlPartsRead
} from '@main/services/htmlParts'

// The Case search fields Extracted Text leaves out. `fields/1` (docs/plans/2026-10-09-
// case-retrieval-first-slice.md, D3 and D4) records link targets and image link alt text
// from the stored page, and identity-bearing mail headers from the Extracted Text file.
// `fields/2` (docs/plans/2026-10-10-case-investigation-engine.md, E11) adds four headers,
// image addresses, tracking codes and cryptocurrency addresses from the stored page, and
// email and web addresses from the Extracted Text. Pure: the caller reads the files, and
// nothing here touches the database.
//
// Every field keeps the span it came from, so a hit can be opened and checked against
// the stored bytes. `value` is that span exactly as stored; `norm` is the search form.
// Offsets are UTF-16 code units: into the decoded part for an `html-part` field, and
// into the `.txt` file read as UTF-8 for a `text` field, the coordinate a Note text
// anchor uses.

/** Stored on each build row. A change to what is extracted, or how, takes a new version. */
export const FIELD_EXTRACTOR_VERSION = 'fields/2'

// A run of header lines is a header block only when one of these names is in it, so
// a few `Label: value` lines in ordinary page text are not read as mail headers.
const BLOCK_MARKERS = new Set(['from', 'reply-to', 'sender', 'message-id', 'path', 'received'])
const ADDRESS_HEADERS = new Set(['from', 'reply-to', 'sender', 'return-path', 'to', 'cc'])
const RECORDED_HEADERS = new Set(HEADER_FIELDS.map((name) => name.toLowerCase()))

// The rules extractData() runs for tracking codes, imported so both find the same codes;
// dataExtractor.ts itself is left as it is (E11).
const TRACKING_RULES = EXTRACTION_RULES.filter((rule) => rule.category === 'Tracking Code')

export interface ExtractedField {
  field: string
  value: string
  norm: string
  source: 'html-part' | 'text'
  /** The text/html part in file order; 0 for a legacy `.html` Capture's file; null for text. */
  part: number | null
  startOffset: number
  endOffset: number
}

export interface FieldSources {
  captureUrl: string
  /** The stored MHTML, or null when the Capture has none. */
  mhtml: Buffer | null
  /** A legacy `.html` Capture's one document, read only when there is no MHTML. */
  html: Buffer | null
  /** The Extracted Text file, read as UTF-8. */
  text: string | null
}

export interface FieldExtraction {
  fields: ExtractedField[]
  skippedParts: CaptureLinks['skippedParts']
  mainDocumentSkipped: boolean
  /** The row ceiling was reached, and fields past it were not extracted. */
  truncated: boolean
}

export function extractFields(
  sources: FieldSources,
  budgets: CaptureLinkBudgets = CAPTURE_LINK_BUDGETS
): FieldExtraction {
  const { parts, skippedParts, mainDocumentSkipped } = htmlInputs(sources, budgets)
  const fields: ExtractedField[] = []
  let truncated = false
  // False at the first field past the ceiling, which stops reading, as the Links tab does.
  const add = (field: ExtractedField): boolean => {
    if (fields.length >= budgets.maxRows) {
      truncated = true
      return false
    }
    fields.push(field)
    return true
  }
  const addAll = (found: Iterable<ExtractedField>): void => {
    for (const field of found) if (!add(field)) return
  }
  // The kinds `fields/1` records come first, except To, Cc, Path and References, which
  // come in their header block's order beside the `fields/1` headers.
  if (sources.text !== null) addAll(headerFields(sources.text))
  const images: Iterable<ExtractedField>[] = []
  for (const part of parts) {
    if (truncated) break
    images.push(addLinkFields(part, add))
  }
  for (const [index, part] of parts.entries()) {
    if (truncated) break
    addAll(images[index] ?? [])
    if (!truncated) addAll(partIdentifiers(part))
  }
  // The text gets the budget one page part has. Over it, the text gives header records only.
  const { text } = sources
  if (!truncated && text !== null && Buffer.byteLength(text, 'utf8') <= budgets.maxPartBytes) {
    addAll(textIdentifiers(text))
  }
  return { fields, skippedParts, mainDocumentSkipped, truncated }
}

function htmlInputs(
  { captureUrl, mhtml, html }: FieldSources,
  budgets: CaptureLinkBudgets
): HtmlPartsRead {
  if (mhtml) return readHtmlParts(mhtml, captureUrl, budgets)
  const skippedParts = { tooLarge: 0, overPartCount: 0, overTotalSize: 0 }
  if (html === null) return { parts: [], skippedParts, mainDocumentSkipped: false }
  // Checked before decoding, as an MHTML part's encoded size is.
  const size = html.byteLength
  if (budgets.maxParts < 1 || size > budgets.maxPartBytes || size > budgets.maxTotalBytes) {
    return { parts: [], skippedParts, mainDocumentSkipped: true }
  }
  return {
    parts: [{ html: html.toString('utf8'), documentUrl: captureUrl, frame: 'main', part: 0 }],
    skippedParts,
    mainDocumentSkipped: false
  }
}

interface Span {
  start: number
  end: number
}

// parse5 records each attribute's span from its name to the end of its value;
// domhandler's types leave the `attrs` map out.
interface ParsedLocation {
  attrs?: Record<string, { startOffset: number; endOffset: number }>
}

// The span of an attribute's value inside the attribute, quotes excluded. An
// attribute written with no value has an empty span at its end. With no location
// the field could not be checked, so that is an error, not a field left out.
function attributeValueSpan(html: string, element: unknown, name: string): Span {
  const location = (element as { sourceCodeLocation?: ParsedLocation | null }).sourceCodeLocation
  const attr = location?.attrs?.[name]
  if (!attr) throw new Error(`The HTML parser gave no location for a ${name} attribute`)
  const raw = html.slice(attr.startOffset, attr.endOffset)
  const equals = raw.indexOf('=', name.length)
  if (equals === -1) return { start: attr.endOffset, end: attr.endOffset }
  let at = equals + 1
  while (at < raw.length && /[\t\n\f\r ]/.test(raw[at])) at += 1
  const quote = raw[at]
  if ((quote === '"' || quote === "'") && raw.length - 1 > at && raw.endsWith(quote)) {
    return { start: attr.startOffset + at + 1, end: attr.endOffset - 1 }
  }
  return { start: attr.startOffset + at, end: attr.endOffset }
}

// One field per occurrence, since each has its own span. Anchor text is not
// recorded: Extracted Text already holds it. Returns the part's image addresses, read
// lazily from the same parse and recorded after every part's links; none once the
// ceiling stopped the links.
function addLinkFields(
  { html, documentUrl, part }: HtmlPartInput,
  add: (field: ExtractedField) => boolean
): Iterable<ExtractedField> {
  const $ = cheerio.load(html, { sourceCodeLocationInfo: true })
  const base = documentBase($, documentUrl)
  const at = (field: string, element: unknown, attr: string, norm: string): ExtractedField => {
    const span = attributeValueSpan(html, element, attr)
    return {
      field,
      value: html.slice(span.start, span.end),
      norm,
      source: 'html-part',
      part,
      startOffset: span.start,
      endOffset: span.end
    }
  }
  let stopped = false
  $('a[href], area[href]').each((_, element) => {
    const node = $(element)
    const href = (node.attr('href') ?? '').trim()
    if (!add(at('link.href', element, 'href', resolveUrl(href, base) ?? href))) {
      stopped = true
      return false
    }
    const images = node.is('area') ? [element] : node.find('img[alt]').toArray()
    for (const image of images) {
      const alt = ($(image).attr('alt') ?? '').replace(/\s+/g, ' ').trim()
      if (alt && !add(at('link.alt', image, 'alt', alt))) {
        stopped = true
        return false
      }
    }
  })
  if (stopped) return []
  const images = $('img[src]').toArray()
  return (function* () {
    for (const image of images) {
      const src = ($(image).attr('src') ?? '').trim()
      // A `data:` source carries the image itself, with no host or target to record.
      if (src && !/^data:/i.test(src)) {
        yield at('image.src', image, 'src', resolveUrl(src, base) ?? src)
      }
    }
  })()
}

// A character that would carry a found value on: a value with one beside it is part of
// a longer token, not that value.
const WORD = /[A-Za-z0-9_]/

// extractIocs() returns values without places, so each is found again here, in one pass
// over the text however many values there are. A value it rewrote while refanging is not
// in the text as returned and has no place.
//
// Tracking codes and cryptocurrency addresses are letters, digits and hyphens. One standing
// alone, with no letter, digit or underscore beside it, starts where a run of word
// characters and hyphens starts or after a hyphen in it, and ends where the run ends or
// before a hyphen. So each candidate is a few whole hyphen-separated pieces of a run: at
// most one more than the hyphens in the value that has the most.
const IDENTIFIER_RUN = /[A-Za-z0-9_-]+/g

function valueSpans(text: string, values: Set<string>): Span[] {
  const spans: Span[] = []
  if (values.size === 0) return spans
  let hyphens = 0
  let longest = 0
  for (const value of values) {
    hyphens = Math.max(hyphens, value.split('-').length - 1)
    longest = Math.max(longest, value.length)
  }
  for (const { 0: run, index } of text.matchAll(IDENTIFIER_RUN)) {
    const starts = [index]
    const ends: number[] = []
    for (let at = run.indexOf('-'); at !== -1; at = run.indexOf('-', at + 1)) {
      ends.push(index + at)
      starts.push(index + at + 1)
    }
    ends.push(index + run.length)
    for (const [i, start] of starts.entries()) {
      for (let j = i; j < Math.min(ends.length, i + hyphens + 1); j += 1) {
        const end = ends[j]
        if (end - start > longest) break
        if (end > start && values.has(text.slice(start, end))) spans.push({ start, end })
      }
    }
  }
  return spans
}

// An email address standing alone is a whole run of local-part characters, an `@`, and a
// whole domain: dot-separated labels, trailing hyphens left off, with no word character
// after it. An address that begins a longer one, as `a@host.example.net` begins
// `a@host.example.net.au`, is not standing alone there.
const LOCAL_RUN = /[A-Za-z0-9_.%+-]+/g
const DOMAIN = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/y

function emailSpans(text: string, values: Set<string>): Span[] {
  const spans: Span[] = []
  if (values.size === 0) return spans
  for (const { 0: local, index } of text.matchAll(LOCAL_RUN)) {
    const at = index + local.length
    if (text[at] !== '@') continue
    DOMAIN.lastIndex = at + 1
    const domain = DOMAIN.exec(text)
    if (!domain) continue
    const end = at + 1 + domain[0].replace(/-+$/, '').length
    if (WORD.test(text[end] ?? '')) continue
    if (values.has(text.slice(index, end))) spans.push({ start: index, end })
  }
  return spans
}

function distinctSpans(spans: Span[]): Span[] {
  const seen = new Set<string>()
  return [...spans]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter(({ start, end }) => {
      const key = `${start}:${end}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// Where a rule's normalized value sits in its match. A value cut from a quoted string,
// as the Facebook Pixel rule's digits are, is taken from inside its quotes.
function valueOffset(match: string, value: string): number {
  for (const quote of ['"', "'"]) {
    const at = match.indexOf(`${quote}${value}${quote}`)
    if (at !== -1) return at + 1
  }
  return match.indexOf(value)
}

// The patterns are shared with extractData() and global, so each one's `lastIndex` is
// reset before use, as runRules() in dataExtractor.ts does. A run to the end leaves it
// at 0 again.
function ruleSpans(text: string, rules: ExtractionRule[]): Span[] {
  const spans: Span[] = []
  for (const { patterns, normalize } of rules) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const [raw] = match
        const value = (normalize ? normalize(raw) : raw)?.trim()
        const offset = value ? valueOffset(raw, value) : -1
        if (value && offset !== -1) {
          spans.push({ start: match.index + offset, end: match.index + offset + value.length })
        }
      }
    }
  }
  return spans
}

function iocSpans(text: string, iocs: ExtractedDatum[], category: string): Span[] {
  const values = iocs.filter((datum) => datum.category === category).map(({ value }) => value)
  return valueSpans(text, new Set(values))
}

// Tracking codes and cryptocurrency addresses anywhere in the decoded part, scripts
// included.
function* partIdentifiers({ html, part }: HtmlPartInput): Generator<ExtractedField> {
  const iocs = extractIocs(html)
  const record =
    (field: string) =>
    ({ start, end }: Span): ExtractedField => {
      const value = html.slice(start, end)
      return {
        field,
        value,
        norm: value,
        source: 'html-part',
        part,
        startOffset: start,
        endOffset: end
      }
    }
  const tracking = [...ruleSpans(html, TRACKING_RULES), ...iocSpans(html, iocs, 'Tracking Code')]
  yield* distinctSpans(tracking).map(record('id.tracking'))
  yield* distinctSpans(iocSpans(html, iocs, 'Cryptocurrency')).map(record('id.crypto'))
}

// A web address in page text runs to the next space, quote or angle bracket. The
// punctuation that ends a sentence is left off, and a closing bracket the address
// did not open.
const WEB_ADDRESS = /\bhttps?:\/\/[^\s<>"'`]+/gi
const SENTENCE_END = new Set(['.', ',', ';', ':', '!', '?'])
const CLOSES = new Map([
  [')', '('],
  [']', '['],
  ['}', '{']
])
const BRACKETS = new Set('()[]{}')

// Counts each bracket once, then takes a closer off the count as it is left off, so a
// long run of closers costs one pass.
function webAddressLength(found: string): number {
  const counts = new Map<string, number>()
  for (const char of found) {
    if (BRACKETS.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }
  let end = found.length
  while (end > 0) {
    const last = found[end - 1]
    const opener = CLOSES.get(last)
    const closers = counts.get(last) ?? 0
    if (opener && (counts.get(opener) ?? 0) < closers) counts.set(last, closers - 1)
    else if (!SENTENCE_END.has(last)) break
    end -= 1
  }
  return end
}

function webAddressSpans(text: string): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(WEB_ADDRESS)) {
    const length = webAddressLength(match[0])
    // Something past the scheme, or there is no address.
    if (length > match[0].indexOf('//') + 2) {
      spans.push({ start: match.index, end: match.index + length })
    }
  }
  return spans
}

function* textIdentifiers(text: string): Generator<ExtractedField> {
  const record =
    (field: string, norm: (value: string) => string) =>
    ({ start, end }: Span): ExtractedField => {
      const value = text.slice(start, end)
      return {
        field,
        value,
        norm: norm(value),
        source: 'text',
        part: null,
        startOffset: start,
        endOffset: end
      }
    }
  // The addresses extractData() keeps: those extractIocs() finds that isValidEmail() accepts.
  const addresses = extractIocs(text)
    .filter(({ subcategory, value }) => subcategory === 'Email Address' && isValidEmail(value))
    .map(({ value }) => value)
  yield* emailSpans(text, new Set(addresses)).map(
    record('text.address', (value) => value.toLowerCase())
  )
  // An absolute address resolved against itself is the parser's form of it: scheme and
  // host in lower case, a default port dropped, the fragment kept.
  yield* webAddressSpans(text).map(record('text.url', (value) => resolveUrl(value, value) ?? value))
}

interface Line {
  text: string
  start: number
}

function* linesOf(text: string): Generator<Line> {
  const breaks = /\r\n|\n|\r/g
  let start = 0
  for (let match = breaks.exec(text); match; match = breaks.exec(text)) {
    yield { text: text.slice(start, match.index), start }
    start = match.index + match[0].length
  }
  yield { text: text.slice(start), start }
}

// A header name is any printable ASCII character but a space or a colon, so a name such
// as `X-Spam_score` does not end its block.
const HEADER_LINE = /^([!-9;-~]+):(?=[ \t]|$)/
const CONTINUATION_LINE = /^[ \t]+\S/

interface HeaderField {
  name: string
  /** The value's span in the text, from the colon to the last non-blank, folds included. */
  start: number
  end: number
}

// Header blocks: two or more consecutive header lines, each with its folded
// continuation lines, holding at least one of BLOCK_MARKERS. Lazy, so the row ceiling
// stops the scan rather than trimming a list built from the whole text.
function* headerBlocks(text: string): Generator<HeaderField[]> {
  let block: HeaderField[] = []
  const isBlock = (): boolean =>
    block.length >= 2 && block.some((field) => BLOCK_MARKERS.has(field.name))
  for (const line of linesOf(text)) {
    const header = HEADER_LINE.exec(line.text)
    if (header) {
      const [label, name] = header
      block.push({
        name: name.toLowerCase(),
        start: line.start + label.length,
        end: line.start + line.text.trimEnd().length
      })
    } else if (block.length > 0 && CONTINUATION_LINE.test(line.text)) {
      block[block.length - 1].end = line.start + line.text.trimEnd().length
    } else {
      if (isBlock()) yield block
      block = []
    }
  }
  if (isBlock()) yield block
}

// The span with its leading and trailing whitespace, line breaks included, left out.
function trimmed(text: string, start: number, end: number): Span {
  const piece = text.slice(start, end)
  return {
    start: start + (piece.length - piece.trimStart().length),
    end: start + piece.trimEnd().length
  }
}

// Splits an address list at the commas outside quotes, angle brackets and comments,
// and returns each mailbox's span, trimmed. With `groups`, a group (RFC 5322, section
// 3.4), written `Name: a@host, b@host;`, gives its mailboxes without the group's name or
// its closing semicolon, and an empty group gives none. Only To and Cc read groups, so
// the headers `fields/1` records keep the records it gave.
function mailboxSpans(value: string, groups = false): Span[] {
  const spans: Span[] = []
  let quoted = false
  let angle = 0
  let comment = 0
  let from = 0
  let inGroup = false
  // A colon after an `@` in the same mailbox is part of an address, not a group's name.
  let sawAt = false
  const push = (to: number): void => {
    const span = trimmed(value, from, to)
    if (span.end > span.start) spans.push(span)
  }
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === '\\') i += 1
    else if (char === '"' && comment === 0) quoted = !quoted
    else if (quoted) continue
    else if (char === '(') comment += 1
    else if (char === ')' && comment > 0) comment -= 1
    else if (comment > 0) continue
    else if (char === '<') angle += 1
    else if (char === '>' && angle > 0) angle -= 1
    else if (char === '@') sawAt = true
    else if (char === ',' && angle === 0) {
      push(i)
      from = i + 1
      sawAt = false
    } else if (groups && angle === 0 && char === ':' && !inGroup && !sawAt) {
      from = i + 1
      inGroup = true
    } else if (groups && angle === 0 && char === ';' && inGroup) {
      push(i)
      from = i + 1
      inGroup = false
      sawAt = false
    }
  }
  push(value.length)
  return spans
}

// The address in a mailbox, in lower case, without its display name, angle brackets,
// comments or folding whitespace. A quoted local part keeps its spaces and loses only
// its line breaks. A mailbox with no address keeps its text, in lower case with its
// whitespace collapsed.
function addressNorm(mailbox: string): string {
  const bracketed = /<([^<>]*)>[^<>]*$/.exec(mailbox)
  const address = bracketed ? bracketed[1] : mailbox.replace(/\([^()]*\)/g, '')
  if (!bracketed && !address.includes('@')) return mailbox.replace(/\s+/g, ' ').toLowerCase()
  return address
    .replace(/("(?:[^"\\]|\\.)*")|\s+/g, (_, quoted?: string) =>
      quoted ? quoted.replace(/\r\n|\n|\r/g, '') : ''
    )
    .toLowerCase()
}

// Each message identifier in a References value, so each compares with a Message-ID
// on its own.
function identifierSpans(value: string): Span[] {
  return [...value.matchAll(/<[^<>]*>/g)]
    .filter(([identifier]) => identifier.length > 2)
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
}

// A Usenet Path lists the sites an article passed through, then a tail entry that names
// none, by convention `not-for-mail` (RFC 5536, section 3.1.5). Each site is a record.
// An empty entry, as `!!` leaves, gives none, and a diagnostic entry such as
// `.POSTED.host` gives the site after its keyword, if it names one.
function pathSpans(value: string): Span[] {
  const entries: Span[] = []
  let from = 0
  for (let at = value.indexOf('!'); at !== -1; at = value.indexOf('!', from)) {
    entries.push({ start: from, end: at })
    from = at + 1
  }
  const spans: Span[] = []
  for (const entry of entries) {
    const { start, end } = trimmed(value, entry.start, entry.end)
    const diagnostic = /^\.[A-Za-z]+\.?/.exec(value.slice(start, end))
    const site = start + (diagnostic ? diagnostic[0].length : 0)
    if (end > site) spans.push({ start: site, end })
  }
  return spans
}

export function headerFieldsFromText(text: string): ExtractedField[] {
  return [...headerFields(text)]
}

function* headerFields(text: string): Generator<ExtractedField> {
  const fieldAt = (name: string, start: number, end: number, norm: string): ExtractedField => ({
    field: `header.${name}`,
    value: text.slice(start, end),
    norm,
    source: 'text',
    part: null,
    startOffset: start,
    endOffset: end
  })
  for (const block of headerBlocks(text)) {
    for (const field of block) {
      if (!RECORDED_HEADERS.has(field.name)) continue
      const { start, end } = trimmed(text, field.start, field.end)
      if (end <= start) continue
      const value = text.slice(start, end)
      if (ADDRESS_HEADERS.has(field.name)) {
        const groups = field.name === 'to' || field.name === 'cc'
        for (const span of mailboxSpans(value, groups)) {
          const norm = addressNorm(value.slice(span.start, span.end))
          if (norm) yield fieldAt(field.name, start + span.start, start + span.end, norm)
        }
      } else if (field.name === 'references' || field.name === 'path') {
        const spans = field.name === 'path' ? pathSpans(value) : identifierSpans(value)
        for (const span of spans) {
          const item = value.slice(span.start, span.end)
          const norm = field.name === 'path' ? item.toLowerCase() : item.replace(/\s+/g, ' ')
          yield fieldAt(field.name, start + span.start, start + span.end, norm)
        }
      } else {
        yield fieldAt(field.name, start, end, value.replace(/\s+/g, ' '))
      }
    }
  }
}
