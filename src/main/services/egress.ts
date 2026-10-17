import { session as electronSession, type ProxyConfig, type Session } from 'electron'
import { getSettings } from '@main/services/settings'
import type { EgressKind, EgressSetting } from '@shared/types'

// The Egress (ADR-0032): while it is not Direct, nothing Birdbrain sends leaves
// directly. Background renders and the Wayback replay pane get the proxy on their
// own sessions, update checks get it on electron-updater's session, and the
// main-process requests (TSA, Wayback lookup, consent filter lists) go through
// `egressFetch`. Shared Case sync is the one exception (rule 1) and does not read it.

export function currentEgress(): EgressSetting {
  return getSettings().egress
}

/**
 * What a signed capture entry records about the Egress a page was sent through:
 * the kind and the Operator's label (rule 5). Never the proxy's host or port,
 * which could expose the Operator's own infrastructure in an export. Undefined for
 * Direct, which records nothing.
 */
export interface CaptureEgress {
  kind: EgressKind
  label?: string
}

export function captureEgressOf(egress: EgressSetting): CaptureEgress | undefined {
  if (egress.kind === 'direct') return undefined
  return egress.label ? { kind: egress.kind, label: egress.label } : { kind: egress.kind }
}

/**
 * Chromium's proxy configuration for an Egress. The rules name the proxy alone,
 * with no `direct://` fallback, so an unreachable proxy fails the request instead
 * of exposing the Operator (rule 2). `<-loopback>` removes Chromium's implicit
 * bypass for localhost and loopback addresses, so those go through the proxy too.
 */
export function proxyConfigFor(egress: EgressSetting): ProxyConfig {
  if (egress.kind === 'direct') return { mode: 'direct' }
  return { mode: 'fixed_servers', proxyRules: egress.proxyUrl, proxyBypassRules: '<-loopback>' }
}

export async function applyEgressToSession(
  ses: Session,
  egress: EgressSetting = currentEgress()
): Promise<void> {
  await ses.setProxy(proxyConfigFor(egress))
}

// The session main-process requests use while the Egress is not Direct. In memory
// and uncached, like the render partitions. `routedProxy` is the proxy last applied
// to it, so a change of setting re-applies before the next request.
const ROUTED_PARTITION = 'egress-requests'
let routedProxy: string | null = null

/**
 * `fetch` for main-process requests. While the Egress is Direct it is the global
 * fetch, unchanged. Otherwise the request goes through Chromium's network stack on
 * a session carrying the proxy, so it fails when the proxy is unreachable.
 */
export const egressFetch: typeof fetch = async (input, init) => {
  const egress = currentEgress()
  if (egress.kind === 'direct') return fetch(input, init)
  const routed = electronSession.fromPartition(ROUTED_PARTITION, { cache: false })
  if (routedProxy !== egress.proxyUrl) {
    await applyEgressToSession(routed, egress)
    routedProxy = egress.proxyUrl
  }
  return routed.fetch(input instanceof URL ? input.href : input, init)
}
