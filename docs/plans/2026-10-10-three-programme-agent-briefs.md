# Agent briefs for Shared Cases, the capture engine and the Case investigation view

**Status:** active

Prepared 2026-10-10 against `origin/main` at `bfe36dab`. Schema version 37,
`MANIFEST_SCHEMA_VERSION` 5, `CASE_ARCHIVE_SCHEMA_VERSION` 8.

This plan orders the remaining work on three programmes into briefs that agents can run
unattended, grouped into waves so that as many agents as possible work at once without
colliding. Each brief names the issue it works (or "to file"), what it depends on, the files it
starts in, what proves it done, and whether it is evidence-affecting. Most briefs here have no
issue yet. Dispatch only works a `ready-for-agent` and `queued` issue, so each brief becomes an
issue that meets the ready-for-agent bar in `docs/agents/triage-labels.md` before an agent takes
it.

Sources: the [collaborative cases design](../specs/2026-09-19-collaborative-cases-design.md)
and tracking issue #1508; [ADR-0034](../adr/0034-the-app-acquires-and-the-extension-is-a-companion.md),
[ADR-0035](../adr/0035-one-transaction-record-per-capture.md) and the
[capture engine first slice](../specs/2026-09-30-capture-engine-design.md); the
[Case investigation engine](../specs/2026-10-02-case-investigation-engine-design.md), the
[Case retrieval pipeline](../specs/2026-10-02-case-retrieval-pipeline-design.md),
[ADR-0042](../adr/0042-investigation-records-are-case-data-outside-the-manifest.md), the
[view feasibility assessment](../specs/2026-10-04-case-investigation-view-feasibility-assessment.md)
and the retrieval first-slice plan in PR #1795.

## What limits parallelism

**Review, not agent count, bounds throughput.** Almost every code brief below touches a
blocking-tier path, so it needs the maintainer's review and never auto-merges. Dispatch runs two
slots and at most six cycles a day ([ADR-0045](../adr/0045-dispatch-runs-two-slots-every-hour.md)).
The waves below assume more agents than that: run the extra lanes as separate worktree threads,
and cap the number of evidence-affecting PRs waiting on review at four.

**Four things serialize across all three programmes.** Two briefs that hold the same lane must
not be in flight at once.

| Lane | Rule | Briefs that hold it, in proposed order |
|---|---|---|
| Database migration | One migration PR open at a time. `pnpm db:migration:new` writes N+1 in `core.ts` and `migrations.ts`, so two branches cut from `main` both write 38. The version goes to whichever merges first. | CI-3 (retrieval fields), CE-6 (capture facts), CI-9 (investigation records). SC-2 and CE-3 join the lane only if they turn out to need a column. |
| Manifest schema | A verifier release ships before any writer of the new fields merges (ADR-0023). | CE-5 only, in this plan. Stage 2 Capture Methods can ride in CE-5 to save a release. |
| Case Archive version | One bump in flight. | CI-9 (8 to 9), then CE-9 if it needs one. |
| Hot files | Rebase cost, not correctness. Merge in the stated order. | `backgroundRenderer.ts`: CE-1, CE-2, CE-3, CE-7, CE-8. `captureLifecycle.ts`: CE-3, CE-7 to CE-9, CI-4. `manifest.ts`: SC-1, SC-2, SC-6, CE-5. `trustedTime.ts`: SC-1, then SC-4. `caseArchive.ts`: CI-4, CI-9, CE-9. |

`src/shared/ipc.ts`, `ipcHandlers.ts` and `src/preload/index.ts` change in most briefs. The
additions only append, so a rebase resolves them; they are not a lane.

## Decisions and approvals the maintainer owes

Each row blocks only the briefs named. Everything else in wave 0 can start today.

| Gate | Blocks |
|---|---|
| Approve a CBOR library for the sync wire format. None is installed. | SC-2 |
| Approve a QR code library for invites, and a base32 encoder if one is needed. | SC-6 |
| Answer the 2026-09-29 question on #1508: may a member join a Shared Case with a separate signing key, one per case or per Persona? A yes changes the `join` payload and `hello` signing. | SC-6 |
| Relay hosting for testers who cannot reach n0's relays (#1508). | Shipping to testers, not code |
| Rule on #1638 (what in the signed record marks a fork's import), #1657 (new issues for the three remaining gaps, or keep them there) and #1523 (null the `last_verified_*` columns, or change the wording only). | One brief each, once ruled |
| Designer revises the Shared Case members mock (items 19, 24, 25 and the "Verified" label). | SC-8 |
| Approve the capture engine first-slice spec and the CE-P plan. | CE-5 to CE-9 |
| Settle the `warcio` licence (approved 2026-10-02, licence open) and approve test-only readers: a WARC reader other than `warcio`, and a PDF parser. | CE-7, CE-8 |
| Tag a release carrying CE-5's verifier. | Merging CE-7 to CE-9 |
| Merge PR #1795 and pick the synthetic Case size. Apply `queued` to #1590. | CI-1, CI-2, CI-3 onward |
| Approve the CI-P engine plan. | CI-8 onward |
| Sign off `checkFieldHit` (retrieval plan Ruling 4). | CI-6 merge |
| A decision on what a Timestamp Token attests for a Capture without MHTML (ADR-0035). | Firefox, stage 4; not briefed |
| An ADR choosing the AI layer's local model and runtime, and the open questions G3 and G7 in the view brief. | AI layer and later view states; not briefed |

## Waves

A wave starts when its gates clear and the briefs it depends on have merged. Waves overlap:
a lane moves to its next brief as soon as its own dependencies merge.

| Wave | Shared Cases | Capture engine | Case investigation | Agents |
|---|---|---|---|---|
| 0, now | SC-1, SC-3 (spike), SC-7 | CE-1, CE-2, CE-P (plan), CE-S2 (spec) | CI-1, CI-P (plan) | 9 |
| 1 | SC-2 | CE-3 | CI-2, CI-3 | 4 |
| 2 | SC-4 | CE-4, CE-5, CE-S3 (spec) | CI-4, CI-8 | 6 |
| 3 | SC-5, SC-6 | CE-6 | CI-5, CI-6, CI-V1 | 6 |
| 4 | SC-8 | CE-7 | CI-7, CI-9, CI-V2, CI-V3, CI-V4 | 7 |
| 5 | | CE-8 | CI-10, CI-14 | 3 |
| 6 | | CE-9 | CI-11, CI-12 | 3 |
| 7 | | | CI-13, CI-V5 | 2 |

Wave 0 has four docs agents and five code agents. Three of the code briefs (SC-1, CE-1, CE-2) are
evidence-affecting, so wave 0 puts three PRs in front of the maintainer, plus four docs PRs
that need approval rather than review.

## Shared Cases briefs

Steps 1 to 3 merged (PRs #1518, #1571, #1626). These briefs finish steps 4 to 7 and the defects
that block a tester build. Nothing in `src/main/services/sharing/` exists yet.

**SC-1. Trusted time reads every accepted chain (#1713).** Wave 0, no dependencies.
Evidence-affecting.
- Starts in `trustedTime.ts`, `timestampWorker.ts`, and the read side of `manifest.ts`.
- Done when another member's stamped Capture reads as stamped, and a chain that failed
  verification contributes nothing.
- Verify with `BIRDBRAIN_REQUIRE_OPENSSL=1 pnpm test` on the trusted-time tests, then
  `pnpm preflight`.
- Merges before SC-4, which rewrites the same file.

**SC-2. Transport interface, in-process transport and sync session (#1512).** Wave 1, after
CBOR approval. Evidence-affecting: it writes `merge` entries and accepts remote chains and
Exhibit bytes.
- Starts in a new `src/main/services/sharing/`, `manifest.ts` (`appendManifestEntry`, remote
  chain files), `noteRepo.ts`, `tagRepo.ts`, the annotations path, and the IPC files.
- Done when the issue's two- and three-peer tests pass: first and incremental sync, revocation
  mid-session, a forged entry, a blob hash mismatch, transitive rows, and exactly one `merge`
  per session that brings new entries.
- At intake, check whether signed working-layer rows need a column. If they do, take the
  migration lane before writing code.
- `ManifestEntrySchema` already defines `merge`, so this needs no manifest schema bump.

**SC-3. Spike: can sync hide every member's address? (#1697).** Wave 0. Not evidence-affecting.
- Install `@number0/iroh` in a scratch directory outside the repository and measure whether the
  binding exposes `clear_ip_transports` and `proxy_url`, whether SOCKS works, and how sync
  performs over Tor.
- Deliverable: `docs/specs/2026-10-NN-anonymous-team-sync-spike.md`, with a verdict for SC-5.
- Verify with `.claude/hooks/vale-prose.sh --base origin/main`.

**SC-4. Trusted Time on `merge` entries (#1515).** Wave 2, after SC-1 and SC-2 merge.
Evidence-affecting, blocking tier.
- Starts in `timestampWorker.ts`, `trustedTime.ts`, `src/shared/verify/`, `src/verifier/`.
- Done when a session that writes a `merge` submits exactly one stamp of its Entry Hash
  (`subject: 'entry'`), a session without one submits none, content stamps are unchanged, and a
  known-answer test passes against a real DigiCert token.

**SC-5. Iroh transport and packaging (to file: split from #1513).** Wave 3, after SC-2 and
SC-3. Not evidence-affecting: the issue says "the transport itself is not on the evidence path."
- Covers `IrohTransport`, node-key persistence (the spec's open question 1), a loopback smoke
  test behind an environment flag, `sharing:isAvailable`, `setRelayUrl`, and adding the binding
  to `asarUnpack` in `package.json`.
- Done when the smoke test passes. The binding has to be checked loading on three platforms, and
  an Intel Mac has to report unavailable instead of crashing. That check is manual, so the PR
  states it for a human to run.
- Carries ADR-0032's unticketed requirement: when the Egress is not Direct, sync still runs and
  the app tells the Operator that teammates and the relay see their IP address.

**SC-6. Invite, join and roster writers (to file: split from #1513).** Wave 3, after SC-2, the
per-case key ruling and QR approval. Runs alongside SC-5. Evidence-affecting.
- Covers the `bbinvite1` format, the `join` and `welcome` handshake over `MemoryTransport`
  (treating the Iroh ticket as opaque), the `member-add`, `member-revoke` and `exclude` writers,
  and the IPC for invite, join, approve, decline, revoke, exclude, `getMembers` and `syncNow`.
- Done when a reused or expired invite fails with a named error and a join from the wrong node
  fails the signature check.
- Whichever of SC-5 and SC-6 merges second wires `IrohTransport` into the invite flow.

**SC-7. Seeded development profile (#1241).** Wave 0, once #1241 is re-triaged out of
`needs-info`. Not evidence-affecting.
- Adds `pnpm dev:seed` with cases, captures, notes, tags and Selectors, plus a two-member Shared
  Case built from the members table that step 2 added.
- SC-8's acceptance criteria name this fixture, and e2e and the app driver can share it.

**SC-8. Members UI (#1514).** Wave 4, after the designer's mock revision, SC-7, and the IPC
types from SC-5 and SC-6. Not evidence-affecting.
- Starts in `src/renderer/routes/cases/`, `TopBar.tsx`, `CommandPalette.tsx`,
  `NewCaseWizard.tsx`, `ManifestLedger.tsx`.
- Done when every surface in the members brief renders in light and dark with no unqualified
  assurance words.

## Capture engine briefs

Stage 1 adds new artifacts to the background renderer. Stages 2 to 4 (launched Chromium, the
Companion pipe with removal of the extension's capture code, and Firefox) are undesigned, so they
get spec briefs, not code briefs. Every code brief below is blocking tier.

**CE-1. Background renders deny permission prompts (#1693).** Wave 0. Evidence-affecting.
- A one-line permission check handler in `backgroundRenderer.ts`, with a test that notification
  and location read as denied.

**CE-2. Refuse a redirect to a loopback or private address (#1726).** Wave 0, alongside CE-1.
Evidence-affecting.
- Starts in `recapture.ts` and the renderer's redirect hooks. Done per the 2026-10-04 ruling on
  the issue.

**CE-3. Egress setting (#1695).** Wave 1, after CE-1 and CE-2 merge. Evidence-affecting.
- Edits the partition setup in `backgroundRenderer.ts` and the TLS re-fetch in
  `captureLifecycle.ts`, so it lands before CE-7.
- If it mirrors the Egress fields onto the `captures` row, it takes the migration lane.

**CE-4. Warn when no VPN is seen and the Egress is direct (#1696).** Wave 2, after CE-3. Not
evidence-affecting.

**CE-P. First-slice implementation plan (to file).** Wave 0. Docs only.
- Splits the first-slice spec into PRs, since the spec has no build order. This plan's proposal:
  CE-5 (verifier and schema), CE-6 (migration), CE-7 (Transaction Record, WARC and Bound TLS
  Details), CE-8 (inventory, Scroll-to-load and PDF), CE-9 (file handling).
- Recommends answers to the spec's five open questions. The `.warc.gz` choice and the size
  budget have to be settled before CE-7.
- Resolves the `warcio` licence and proposes the test-only WARC reader and PDF parser.
- Recommends whether CE-5 also carries the `launched`, `launched-passive` and `companion` Capture
  Method values, which saves one verifier release per stage.
- Reruns the probe spike on the current Electron (`^44.5.1`; the probe ran on 44.4.5), as the
  spike asks.
- Deliverable: `docs/plans/2026-10-NN-capture-engine-first-slice.md`. The maintainer approves it
  together with the spec.

**CE-5. Verifier and schema for the new capture fields (to file, U0).** Wave 2, after CE-P is
approved. Holds the manifest schema lane.
- Adds optional `capture` fields for the inventory, Scroll-to-load, Bound TLS Details and the
  WARC and PDF hashes. An absent hash claims nothing; a present hash with a missing or different
  file fails, as `screenshotHash` does today. `MANIFEST_SCHEMA_VERSION` 5 becomes 6.
- Starts in `src/shared/schemas.ts`, `manifest.ts`, `src/shared/verify/`, `src/verifier/`,
  `src/shared/constants.ts`.
- Done when old entries still verify and tamper tests fail on each new hash. A tagged release
  ships it before CE-7 merges.

**CE-6. Mirror the new capture facts on the `captures` row (to file, U1).** Wave 3, after CE-5
merges. Holds the migration lane after CI-3.
- Starts in `migrations.ts` and `captureRepo.ts`.

**CE-7. Transaction Record, WARC and Bound TLS Details (to file, U2 and U4).** Wave 4, after CE-3
and CE-6 merge and the `warcio` gate clears. Merges only after CE-5 is released.
- Loads `about:blank`, enables `Network` with buffer limits, then loads the target. Each
  `requestWillBeSent` becomes its own exchange. Credential header values are replaced in memory
  (ADR-0036). Bound TLS Details come from the main document's `securityDetails`, in a field beside
  `tls`.
- Starts in `backgroundRenderer.ts`, `recapture.ts`, `captureLifecycle.ts`, `captureStore.ts`.
- Done when the spec's known-answer tests pass against a local fixture server: gzip and plain
  digests, a redirect, cached, failed, cancelled and over-budget responses, a non-`warcio`
  reader, and a TLS fixture with a known certificate.

**CE-8. Artifact inventory, Scroll-to-load and PDF (to file, U3 and U5).** Wave 5, after CE-7.
- `scrollToLoadLazyContent` returns its outcome; the screenshot records scaled, truncated and
  trimmed with dimensions; `printToPDF` runs last and the inventory records that.
- Closes the background half of #1667: a failed scroll is recorded, not stored as a static
  capture.

**CE-9. File handling for the WARC and PDF (to file, U6).** Wave 6, after CE-8.
- Export, Case Archive export and import, Duplicate and deletion. Starts in `export.ts`,
  `caseArchive.ts`, `captureLifecycle.ts`, `evidencePackage.ts`, `verifyProcedure.ts`,
  `verifyRunbook.ts`, `reportHtml.ts`.
- Takes the Case Archive version lane after CI-9 if the archive format changes.

**CE-S2. Spec for stage 2, launched Chromium (to file).** Wave 0. Docs only.
- Covers what ADR-0034 leaves open: browser discovery and launch, the per-Persona profile layout,
  cookie seeding from the Persona import, proxy and WebRTC flags for the Egress, the CDP client
  (raw WebSocket or a library, a dependency decision), the Operator's capture trigger, cutting a
  session-long recording into per-Capture WARCs, multi-tab ownership, Selector matching, the
  `launched` and `launched-passive` values, and the Persona wording.
- Folds in #599 and #600, and states that #598 (extraction blocks the main process) has to land
  first.
- Deliverable: `docs/specs/2026-10-NN-capture-engine-launched-browser-design.md`.

**CE-S3. Spec for stage 3, the Companion pipe and removing extension capture (to file).** Wave 2,
after CE-S2 merges. Docs only.
- Covers the pipe's transport and authentication, what remains of the Capture Server, the legacy
  `extension` value, the `debugger` permission and its Chrome Web Store review exposure, and the
  deletion list (the screenshot stitcher, the `HOTFIX:` blocks, the `webRequest` header code).

## Case investigation briefs

The retrieval first slice is planned in PR #1795. The engine, the view and the AI layer have
designs and ADRs but no plan, so CI-P comes before any engine or view code.

**CI-1. Find domains, emails and URLs in search (#1590, retrieval step 0).** Wave 0, once
queued. The issue carries no `evidence-affecting` label, but the retrieval plan lists the path
backstop firing on this step, so the intake check settles the call.
- Quotes terms that contain punctuation in all three search paths.

**CI-2. Synthetic Case baseline (PR #1796, retrieval step 1).** Wave 1, after #1795 merges and
the size is picked. Not evidence-affecting.
- Finishes the generator and runner, then runs the baseline on `main` before CI-5 merges.

**CI-3. Search field tables and extractor (to file, retrieval step 2).** Wave 1, after #1795
merges. Holds the migration lane first.
- Migration for `exhibit_search_builds`, `exhibit_search_fields` and a trigram FTS5 table with
  triggers; `fieldExtractor.ts`; link helpers moved out of `captureLinks.ts`.

**CI-4. Field build service (to file, retrieval step 3).** Wave 2, after CI-3.
- Field repository and build service, the ingest hook in `captureLifecycle.ts`,
  `ensureCaseFields`, rebuild, and the rebuild on Case Archive import in `caseArchive.ts`.

**CI-5. Fielded search in the app (to file, retrieval step 4).** Wave 3, after CI-4 and the CI-2
baseline.
- The `search:fields` channel, the search bar group, and opening a hit in the Text or Links tab.

**CI-6. `checkFieldHit` (to file, retrieval step 5).** Wave 3, after CI-4. Evidence-affecting,
and the plan's Ruling 4 needs the maintainer's sign-off before merge.

**CI-7. Unreviewed view and second evaluation (to file, retrieval step 6).** Wave 4, after CI-5.
- A Data screen tab listing captures nobody annotated, the second run on the synthetic Case, and
  the finished assessment.

**CI-P. Engine implementation plan (to file).** Wave 0. Docs only.
- Table DDL for ADR-0042's records; which of the spec's two consistency approaches a run uses; the
  engine's typed contract and IPC; the identifier set beyond the retrieval plan's; whether PDF
  and `mbox` Exhibits are in the first engine slice; how the spec's thresholds get set from the
  evaluation; the engine fixture list; a PR split; the plan for retrieval step 7; and the Shared
  Case amendment for synced decisions and flags that ADR-0042 lists as a follow-up.
- Deliverable: `docs/plans/2026-10-NN-case-investigation-engine.md`.

**CI-8. Engine contract and fake engine (to file).** Wave 2, after CI-P is approved. Not
evidence-affecting.
- The typed contract in `src/shared/` and a fixture-backed fake that the view briefs build
  against.

**CI-9. Investigation records storage (to file).** Wave 4, after CI-3 and CE-6 hold and release
the migration lane. Evidence-affecting (`db/**`).
- One migration for the ADR-0042 tables, the Case revision triggers on every input table, the
  generation id replaced on snapshot restore and import, the archive collectors, importers and
  `ID_PROBE_TABLES`, and `CASE_ARCHIVE_SCHEMA_VERSION` 8 to 9.

**CI-10 to CI-13. Engine.** Waves 5 to 7, each split as CI-P decides.
- CI-10, the base layer (after CI-9 and CI-4): identifier extraction and normalization, the four
  proposal rules, document Subjects, two-Joint expansion, determinism.
- CI-11, claim checks (after CI-6 and CI-10): `checkFieldHit` plus the `textHash` comparison
  against the signed Manifest.
- CI-12, paths, strength summary, weak mark and gap list (after CI-10).
- CI-13, exporting Joints from `export.ts` (after CI-11 and CI-12). Evidence-affecting.

**CI-14. Withheld mark (to file, retrieval step 7).** Wave 5, after CI-9.

**CI-V1 to CI-V5. View surfaces.** Not evidence-affecting. Sizes are the feasibility
assessment's.
- CI-V1 (wave 3, after CI-8): the Investigate route and sidebar entry, header S2, run setup S1,
  narrow window S7, and the token fixes. It lands first because it owns `Sidebar.tsx` and the
  route tree.
- CI-V2, CI-V3 and CI-V4 run in parallel in wave 4, after CI-V1.
  - CI-V2: map and list S3, with a pure layout module like `backlinkMapModel.ts` and the map
    accessibility fix.
  - CI-V3: Joint detail S4 and source inspector S5. The inspector shares `SearchBar.tsx` and the
    viewer tab state with CI-5, so it rebases after CI-5.
  - CI-V4: gap list S6, own identifiers S9, same-name Subjects S10, and states 1 to 7, 10, 11
    and 15.
- CI-V5 (wave 7): swap the fake engine for CI-10 to CI-12.

Run history (G3), lookup consent (G7, state 9) and the AI layer (S8, states 13, 14, 16, 17) wait
on the decisions in the gates table.
