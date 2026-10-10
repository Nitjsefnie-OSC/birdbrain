# Agent briefs for Shared Cases, the capture engine and the Case investigation view

**Status:** active

Reflects `origin/main` at `df531d36` (PR #1795 merged) and a verification pass on 2026-10-10
that checked each brief against its issue, the specs and the code. Schema version 37,
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
and the [retrieval first-slice plan](2026-10-09-case-retrieval-first-slice.md).

## What limits parallelism

**Review, not agent count, bounds throughput.** Almost every code brief below touches a
blocking-tier path, so it needs the maintainer's review and never auto-merges. Dispatch runs two
slots and at most six cycles a day ([ADR-0045](../adr/0045-dispatch-runs-two-slots-every-hour.md)).
The waves below assume more agents than that: run the extra lanes as separate worktree threads
once the maintainer authorizes them (see the gates table), and cap the number of
evidence-affecting PRs waiting on review at two (ADR-0045) unless the maintainer rules otherwise.
A wave's code PRs open only as earlier ones merge.

**Off-slot lanes need their own review path.** ADR-0020 commits a reviewer only to `agent-pr`
PRs, and ADR-0027 keeps the maintainer's account from opening an agent PR. Off-slot lanes open
PRs as the machine account with `agent-authored` only, and each PR gets a reviewer pre-pass under
a cycle claim before it asks for review. The alternative is to run the extra lanes as interactive
sessions the maintainer watches, and drop "unattended" for them.

**Four things serialize across all three programmes.** Two briefs that hold the same lane must
not be in flight at once.

| Lane | Rule | Briefs that hold it, in proposed order |
|---|---|---|
| Database migration | One migration PR open at a time. `pnpm db:migration:new` writes N+1 in `core.ts` and `migrations.ts`, so two branches cut from `main` both write 38. The version goes to whichever merges first. | Whichever is ready first takes it. Expected order: CI-3 (no gate left), SC-2 once CBOR is approved (one migration that rebuilds the working-layer constraints, see SC-2), CE-6, CI-9 and the ADR-0040 link-capture writer (slice-2 plan step 3). CE-3 joins only if it mirrors the Egress fields onto `captures`, and #1498 only if re-triaged. The maintainer keeps #811 out of the queue, or folds it into SC-2, while SC-2 holds `tagRepo.ts`. |
| Manifest schema | A verifier release ships before any writer of the new fields merges (ADR-0023). | Any schema step the beta.23 decision puts in that release (the ADR-0040 verifier step, #586's schema step) merges before beta.23 is tagged. Then CE-3 (writer of the schema-5 Egress fields; merges after a release carrying the schema-5 verifier). Then the steps left out of beta.23 (the ADR-0040 verifier step after #1736 accepts ADR-0040, #586's schema step once ruled, #1498 if re-triaged) and CE-5, under one number. The release carrying CE-5's verifier follows, then CE-7 to CE-9. SC-5 joins only if the node key does not persist. |
| Case Archive version | One bump in flight; each takes the next number at merge. | SC-2 (if its migration changes what an archive carries), CE-6, the ADR-0040 link-capture writer, CI-9 and CE-9 (and CE-3 if it mirrors Egress columns), in the order they become ready. |
| Hot files | Rebase cost, not correctness. Merge in the stated order. | `backgroundRenderer.ts`: CE-1, CE-2, CE-3, #1499, CE-7, CE-8. `recapture.ts`: CE-2, CE-3, #1499, the link-capture writer, CE-7. `captureLifecycle.ts`: CE-3, CI-4, SC-2b, CE-10, CE-7, CE-8, CE-9. `captureRepo.ts`: CI-1, SC-2b, CI-5, CE-6, CI-14. `noteRepo.ts`: CI-1, then SC-2. `manifest.ts`: SC-1, SC-2, CE-5, SC-6. `trustedTime.ts` and `timestampWorker.ts`: SC-1, then SC-4. `settings.ts`: CE-3, then CE-4. `OperatorConfig.tsx`: CE-3. `TopBar.tsx`: CE-4, then SC-8. `caseArchive.ts`: SC-2 and CE-3 (only if they bump the archive version), CI-4, then CE-6, the link-capture writer and CI-9 in the Case Archive lane's order, then CE-9. `export.ts`: SC-4 (if packages carry receipt stamps), CE-7 and CE-8 (export halves), CE-9, then CI-13. `verifyScript.ts` and `verifyRunbook.ts`: SC-V, SC-4 (if packages carry receipt stamps), CE-7, CE-8. |

Outside this plan: #1638 joins the `manifest.ts` hot-file list, and the manifest schema lane if
its ruling adds a signed field; #1657 joins the Case Archive lane if archives start carrying
thumbnails. An issue outside this plan that needs a lane a brief here holds stays out of the queue
until the lane frees, or takes a slot in the stated order.

`src/shared/ipc.ts`, `ipcHandlers.ts` and `src/preload/index.ts` change in most briefs. The
additions only append, so a rebase resolves them; they are not a lane.

## Decisions and approvals the maintainer owes

Each row blocks only the briefs named. In wave 0, SC-1, CE-1, CE-2 and CI-1 are each one
`queued` label from starting; the rest need the re-triage or filing in the queue row.

| Gate | Blocks |
|---|---|
| Queue and relabel. Now: apply `queued` to #1713 (SC-1), #1693 (CE-1), #1726 (CE-2) and #1590 (CI-1); re-triage #1241 out of `needs-info` (name the closing e2e spec set, add a verification command, make the evidence call, add the two-member fixture), then queue it; relabel #1697 to `ready-for-agent` and queue it, or mark SC-3 as human work; file and triage CE-P, CE-S2, CI-P and CI-3. When their waves open: queue #1512 and #1515 (after their `evidence-affecting` label), #1695 and #1696, and relabel #1514 from `ready-for-human` to `ready-for-agent` and queue it. Relabel #598 from `ready-for-human` to `ready-for-agent` once its direction is picked, and queue it (CE-10). Split #1513 into the SC-5 and SC-6 issues. File and triage each other to-file brief when its wave opens. | Every issue-backed brief |
| Authorize N off-slot lanes with a stated spend bound (ADR-0029), and rule on how many evidence-affecting PRs may wait on review at once, recorded as an amendment to ADR-0045's consequence. | Every lane beyond the two dispatch slots, and the review cap |
| Apply `evidence-affecting` to #1512 and #1515. Both bodies make the call yes, but neither carries the label, so both fail ready-for-agent bar point 4 at intake. | SC-2, SC-4 |
| Approve a CBOR library for the sync wire format. None is installed. | SC-2 |
| Answer the 2026-09-29 question on #1508: may a member join a Shared Case with a separate signing key, one per case or per Persona, and should the design tell anonymous members to use a pseudonym as their name? A yes changes spec decision 6, the `join` payload, and the key that `hello` and working-layer rows are signed with. | SC-2, SC-6 |
| Approve widening the `lastError.kind` union agreed in the members feasibility assessment (item 21) with a newer-version kind. | SC-2, SC-8 |
| Rule what the collaborative cases design leaves open for received Captures: whether columns no entry carries (such as `captures.title`) are re-derived from the received files or carried as signed rows, and what a received `deletion` does to the local row and files. | SC-2b |
| Approve a base32 encoder if one is needed (the `bbinvite1` string). | SC-6 |
| Approve a QR code library for the Owner-side invite screen. | SC-8 (SC-6 instead, if SC-6 renders the QR code in the main process) |
| Designer revises the Shared Case members mock (items 19, 24, 25, the "Verified" label, and the ADR-0032 notice that teammates and the relay see the Operator's IP while the Egress is not Direct, on the Members tab and the sync pill), or the maintainer rules the notice copy-only. | SC-8 |
| If CE-3 is still waiting on its release when SC-5 is ready, choose: hold SC-5 for CE-3, or merge SC-5 without the non-Direct-Egress notice and file a follow-up that adds it once CE-3 merges. | SC-5 |
| After SC-3 merges, the maintainer rules go or no-go on anonymous-team mode (#1697, ADR-0032 rule 1). A go adds a brief after SC-5 and CE-3; a no-go records the reason on #1697. | Anonymous-team mode; not briefed |
| Relay hosting for testers who cannot reach n0's relays (#1508), and a recorded manual real-network sync between two machines on different networks, one through the relay. | Shipping to testers, not code |
| Rule on #1638 (what in the signed record marks a fork's import), #1657 (new issues for the three remaining gaps, or keep them there) and #1523 (null the `last_verified_*` columns, or change the wording only). | One brief each, once ruled |
| Tag a release carrying #1747 (manifest schema 5), for example beta.23 from #1799. Its release notes tell Shared Case members to upgrade together. | Merging CE-3 |
| Before beta.23 (#1799) is tagged, decide which schema steps land in it; the rest share CE-5's release under one number. | The ADR-0040 verifier step (slice-2 plan step 2), #586, CE-5 |
| Rule whether update checks follow the Egress (ADR-0032 rule 1 lists no update traffic). If yes, add the `electron-updater` partition to CE-3's scope and acceptance criteria (with the proxy stopped, the check fails and no request leaves directly). If no, amend ADR-0032 to name a second exception and state it in CE-D1. | CE-3 |
| Approve a test-only SOCKS5 server dependency, if CE-3 does not write its fixture server by hand. | CE-3 (only if it takes the dependency) |
| Re-triage #1505 (close it as superseded by a `launched` Persona Capture that CE-S2 specifies) and remove `persona-window` from #1498's scope, before either is queued. | #1498, #1505 |
| Approve the capture engine first-slice spec and the CE-P plan. | CE-5 to CE-9 |
| Settle the `warcio` licence (approved 2026-10-02, licence open) and approve test-only readers: a WARC reader other than `warcio`, and a PDF parser. | CE-7, CE-8 |
| Choose how the probe is rerun on each Electron upgrade after CE-7 (capture engine spec risk section): an Electron-run CI test in CE-7 comparing the renderer with the Network domain off and on (`navigator.webdriver`, `window.chrome` keys, the `Error.stack` getter count, resource timing), or a rule that every Electron bump PR attaches a probe rerun. | CE-7 |
| Tag a release carrying CE-5's verifier. Its release notes tell Shared Case members to upgrade together. | Merging CE-7 to CE-9 |
| Pick #598's direction (a utility process, or extraction moved off the capture's critical path). | CE-10 (the #598 fix); CE-S2's stage-2 code briefs |
| Rule on #1694: close it if the in-app display of the Egress kind and label belongs to later work, or name the issue that carries it. The answer also decides whether a display brief follows CE-8 for the inventory, Scroll-to-load and Bound TLS Details, kept apart from the TLS Cert Chain in `ForensicsTab.tsx` (blocking tier), or whether only the report (CE-9) shows them. | Display of capture fields; not briefed |
| Close #804 and #635 as answered by ADR-0035 and ADR-0034, or fold #635 into CE-S3's deletion list; rule on #1667's extension half (close it in favor of CE-S3, or keep it for an interim record), and whether #1667 closes once CE-8 records its background half. | Backlog hygiene; no brief |
| A decision on what a Timestamp Token attests for a Capture without MHTML (ADR-0035). | Firefox, stage 4; not briefed |
| Pick the synthetic Case size. | CI-2's baseline run, and through it CI-5; CI-9's trigger timing |
| Approve the CI-P engine plan. | CI-8 onward, CI-D, CI-R and CI-E |
| Sign off `checkFieldHit` (retrieval plan Ruling 4). | CI-6 merge, and so CI-7 |
| Pick how the Investigate section stays out of releases until CI-V5 and the base-layer bar: (a, recommended, adds no pattern) CI-V1 registers the route and components, and the `Sidebar.tsx` and command palette entries land in CI-V5; or (b) a dev-build-only route. | CI-V1 merge |
| Design the Withheld from analysis mark on Case search results and in the unreviewed view (ADR-0044). | CI-14 |
| Rule whether MCP tools return Withheld Exhibits (ADR-0044, #547). | The merge of the first brief that lets an Operator set the flag (CI-D) |
| Approve CI-P's Shared Case amendment (to `docs/specs/2026-09-19-collaborative-cases-design.md`), and rule on #543 for syncing own identifiers with the marking member's Member Code. | CI-S |
| Confirm the base-layer bar is met and the safety gate passes on the synthetic Case (CI-E's run; `docs/specs/2026-10-02-case-investigation-engine-design.md:291`, `:293`). | CI-V5 merge and any release that shows the Investigate section |
| An ADR choosing the AI layer's local model and runtime, and the open questions G3 and G7 in the view brief. | The AI layer's local option and later view states; not briefed |

## Waves

A wave starts when its gates clear and the briefs it depends on have merged. Waves overlap:
a lane moves to its next brief as soon as its own dependencies merge.

| Wave | Shared Cases | Capture engine | Case investigation | Agents |
|---|---|---|---|---|
| 0, now | SC-1, SC-3 (spike), SC-7 | CE-1, CE-2, CE-P (plan), CE-S2 (spec) | CI-1, CI-3, CI-P (plan) | 10 |
| 1 | SC-2, SC-V | CE-3 | CI-2 | 4 |
| 2 | SC-2b, SC-4 | CE-4, CE-5, CE-S3 (spec), CE-D1 (docs) | CI-4, CI-8 | 8 |
| 3 | SC-5, SC-6 | CE-6, CE-10 | CI-5, CI-V1 | 6 |
| 4 | SC-8, SC-9, SC-D (docs), SC-E | CE-7 | CI-6, CI-9, CI-E, CI-V2, CI-V3, CI-V4 | 11 |
| 5 | | CE-8 | CI-7, CI-10, CI-D, CI-R | 5 |
| 6 | | CE-9 | CI-11, CI-12, CI-14, CI-S | 5 |
| 7 | | | CI-13, CI-V5 | 2 |

Wave 0 has four docs agents and six code agents. Five of the code briefs (SC-1, CE-1, CE-2,
CI-1, CI-3) touch blocking-tier paths and need the maintainer's review, and the four docs PRs need
the maintainer's approval. Under the review cap of two, those five code PRs open in turn.

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
- Merges before SC-4. Both edit `trustedTime.ts` and `timestampWorker.ts` (SC-1 widens the
  entries passed at `trustedTime.ts:27` and `:41`; SC-4 adds receipt-stamp reporting), so the
  order saves rebase work. It is not a correctness dependency.

**SC-2. Transport interface, in-process transport and sync session (#1512).** Wave 1, after CBOR
approval, the per-case key ruling, the `lastError` kind approval and the `evidence-affecting`
label on #1512. Evidence-affecting: it writes `merge` entries and accepts remote chains and
Exhibit bytes. `ManifestEntrySchema` already defines `merge`, so this needs no manifest schema
bump.
- Starts in a new `src/main/services/sharing/`, `manifest.ts` (`appendManifestEntry`, remote
  chain files), `noteRepo.ts`, `tagRepo.ts`, the annotations path, and the IPC files. Builds the
  blob list from one shared list of the hash fields a capture entry anchors (`contentHash`,
  `screenshotHash`, `textHash` today); CE-5 extends it, or creates it if CE-5 merges first.
- Takes the migration lane before writing code. Migration 36 added `author_installation_id`,
  `version`, `deleted_at` and `row_signature` to notes, annotations, tags, `exhibit_tags` and
  `note_tags`, but the constraints do not fit per-author rows. One migration covers PR #1571's
  five findings: the global `tags.name` UNIQUE (`migrations.ts:34`, which fails a remote member's
  tag that shares a local tag's name), `annotations` keyed by `capture_id` alone, no
  `tags.created_at` for the color rule, no sync columns on `annotation_pins`, and author-less
  primary keys on `exhibit_tags` and `note_tags`. It states whether the Case Archive needs a bump
  (an older importer drops `tags.created_at` and the `annotation_pins` sync columns, and merges
  two members' same-name tags into one, `caseArchive.ts:807-826`). If it does, SC-2 takes the
  Case Archive lane and bumps `CASE_ARCHIVE_SCHEMA_VERSION`.
- Done when the issue's two- and three-peer tests pass (first and incremental sync, revocation
  mid-session, a forged entry, a blob hash mismatch, transitive rows, and exactly one `merge` per
  session that brings new entries), a peer not in the roster cannot obtain entries or blobs, and
  every remote file becomes visible only after its hash matches the entry.
- Also done when tests show three things. First, an entry above the local schema version stops
  that member's chain at that index, sets a distinct `lastError` kind instead of a forged
  verdict, and later entries resume after an upgrade. Second, a Settings > Database edit to a
  synced table either re-signs and re-versions the row or the app refuses it for Shared Cases.
  Third, after a snapshot restore the next local write gets a version above every version peers
  hold (for example, from a high-water mark in `sync-state.json`, which a database restore does
  not revert).
- In the same PR, amends `docs/specs/2026-07-31-evidence-affecting-paths-assessment.md`: the
  session, entry-acceptance and blob-acceptance modules under `src/main/services/sharing/` go on
  the blocking tier, and the transport interface and `IrohTransport` go on the advisory tier or
  the exclusion list, with the reason (the #227 and #515 precedents).

**SC-2b. Apply received entries to the local database (to file).** Wave 2, after SC-1, SC-2 and
the received-Captures ruling; merges before SC-8. Evidence-affecting (`src/main/services/db/**`,
`captureLifecycle.ts`).
- SC-2 writes no `captures`, `exhibits` or `capture_texts` rows for another member's Captures, so
  without this brief a joined member's app lists none of the Owner's Captures.
- Starts in the sharing session module, `captureLifecycle.ts` (`runPostCaptureWork`,
  `runDataExtraction`), `exhibitRepo.ts` and `captureRepo.ts`.
- Done when, after a `MemoryTransport` sync, the receiver lists the remote member's Captures and
  Exhibits with author and Member Code, finds their text in Case search, has their
  `extracted_data` rows (and field records once CI-4 has merged), shows their Derived Files, and
  resolves their Trusted Time through SC-1, and this installation's timestamp worker does not
  stamp another member's content.
- Verify with the two-peer `MemoryTransport` tests, then `pnpm preflight`.

**SC-3. Spike: can sync hide every member's address? (#1697).** Wave 0. Not evidence-affecting.
- Install `@number0/iroh` in a scratch directory outside the repository and answer #1697's four
  questions: whether the binding exposes `clear_ip_transports` and `proxy_url`; whether the proxy
  accepts SOCKS5 or only HTTP(S); whether two raw Iroh endpoints exchange a fixed payload over
  relay-only plus Tor, and how long one round takes (no sync session exists until SC-2 and SC-5,
  so end-to-end sync timing moves to SC-5's smoke test); and whether a ticket created in
  relay-only mode carries any direct address.
- Deliverable: `docs/specs/2026-10-NN-anonymous-team-sync-spike.md`, with a verdict for SC-5.
- Verify with `.claude/hooks/vale-prose.sh --base origin/main`.

**SC-4. Trusted Time on `merge` entries (#1515).** Wave 2, after SC-1 and SC-2 merge and the
`evidence-affecting` label on #1515. Evidence-affecting, blocking tier.
- Starts in `timestampWorker.ts`, `trustedTime.ts`, `src/shared/verify/`, `src/verifier/`. If
  packages are to carry receipt stamps, it also starts in `export.ts`, `verifyScript.ts` and
  `verifyRunbook.ts`.
- Done when a session that writes a `merge` submits exactly one stamp of its Entry Hash
  (`subject: 'entry'`), a session without one submits none, content stamps are unchanged, and a
  known-answer test passes against a real DigiCert token.
- Also done when the PR states, in one line each for the standalone verifier, the package checker
  (`evidencePackage.ts`), `verify.sh` and `VERIFY.md`, whether it reports the receipt stamp, with
  a test for each that does.

**SC-5. Iroh transport and packaging (to file: split from #1513).** Wave 3, after SC-2 and SC-3
merge, and after CE-3 (#1695) merges unless the maintainer lets SC-5 merge without the IP notice
(see the gates table). Not evidence-affecting while the node key persists (#1513: "the transport
itself is not on the evidence path").
- Covers `IrohTransport`, node-key persistence (the spec's open question 1), a loopback smoke
  test behind an environment flag, `sharing:isAvailable`, `setRelayUrl`, and adding the binding
  to `asarUnpack` in `package.json`.
- If the binding regenerates the node key, #1513 asks for a rotation path in `member-add`, a
  `.strict()` schema (`schemas.ts:881`). SC-5 then becomes evidence-affecting and joins the
  manifest schema lane, with a verifier release before any writer.
- Carries ADR-0032's unticketed requirement: when the Egress is not Direct, sync still runs and
  the app tells the Operator that teammates and the relay see their IP address. The notice reads
  CE-3's Egress setting, which main lacks. If CE-3 is still waiting on its release, the
  maintainer picks: SC-5 waits, or it merges without the notice and a follow-up adds the notice
  once CE-3 merges.
- Done when the smoke test passes and times one sync session, the part of #1697's question 3
  that SC-3 cannot run. The PR states a manual check for a human to run: the binding loads on
  three platforms, and an Intel Mac reports unavailable instead of crashing.
- Also done when `SECURITY.md` Network egress, the `features.mdx` Network use list and the privacy
  whitepaper's outbound list name the n0 relay, peer connections, the inbound listener and the
  ADR-0032 IP disclosure.

**SC-6. Invite, join and roster writers (to file: split from #1513).** Wave 3, after SC-2, the
per-case key ruling and the base32 approval if one is needed; merges after SC-V. Runs alongside
SC-5. Evidence-affecting.
- Covers the `bbinvite1` format, the `join` and `welcome` handshake over `MemoryTransport`
  (treating the Iroh ticket as opaque), the `member-add`, `member-revoke` and `exclude` writers,
  and the IPC for invite, join, approve, decline, revoke, exclude, `getMembers`, `syncNow` and
  `sharing:cancelInvite`.
- Also covers the Owner's own first `member-add`, setting `cases.shared_at` and
  `owner_installation_id`, and `memberCode` on new `exhibit` entries.
- Done when a reused or expired invite fails with a named error and a join from the wrong node
  fails the signature check. Creating the first invite writes the Owner's own `member-add` and
  sets `shared_at` and `owner_installation_id`; the PR states and tests whether new `exhibit`
  entries carry `memberCode`; a cancelled invite refuses a later join with the named error.
- Whichever of SC-5 and SC-6 merges second wires `IrohTransport` into the invite flow.

**SC-7. Seeded development profile (#1241).** Wave 0, once #1241 is re-triaged out of
`needs-info`. Not evidence-affecting.
- Adds `pnpm dev:seed` with cases, captures, notes, tags and Selectors, plus a two-member Shared
  Case: the Owner's chain with signed `member-add` entries for both members and a second
  `manifest.<installationId>.jsonl`, hand-signed the way
  `tests/main/services/sharedCaseExport.test.ts` builds them, with `case_members` filled as the
  derived cache. #1241's body has no Shared Case fixture, so its re-triage adds one to the
  acceptance criteria.
- SC-8's acceptance criteria name this fixture, and e2e and the app driver can share it.

**SC-8. Members UI (#1514).** Wave 4, after the designer's mock revision, the QR library and
`lastError` kind approvals, SC-2b, SC-7, CE-3, the IPC types from SC-5 and SC-6, and the #1514
relabel and queue (see the queue gate row). Evidence-affecting.
- Triage re-makes #1514's call ("No. Renderer only"): `ManifestLedger.tsx` and `ledgerModel.ts`
  sit under `src/renderer/components/data/**`, blocking tier, so the PR carries
  `evidence-affecting` and gets human review.
- Starts in `src/renderer/routes/__root.tsx` (the `/cases/$caseId` route tree, where the
  `/settings` child goes), `TopBar.tsx`, `CommandPalette.tsx`, `NewCaseWizard.tsx`,
  `src/renderer/components/data/ManifestLedger.tsx`.
- Done when every surface in the members brief renders in light and dark from the `pnpm dev:seed`
  two-member fixture with no unqualified assurance words; the Integrity label reads "Verified"
  instead of "Chain verified"; and the newer-version `lastError` kind and the non-Direct-Egress
  notice render.

**SC-9. Sync service (to file).** Wave 4, after SC-5 and SC-6. Evidence-affecting by path
(`src/main/index.ts` is blocking tier).
- Spec decision 13 makes sync automatic (app start, a 60-second timer, Sync now). Neither #1512
  nor #1513 owns the timer, the startup run or the listening endpoint.
- Starts in a new sharing service module and `src/main/index.ts`.
- Done when, with fake timers over `MemoryTransport`, a session runs at startup for every shared
  Case, repeats every 60 s while a peer is reachable, and stops for revoked members; the endpoint
  listens while the app is open and closes on quit; and `getSyncState` reports `peersReachable`
  from this service.

**SC-V. `verify.sh` checks Shared Case packages (to file).** Wave 1 or 2, no code dependency (the
schema-4 verifier shipped in 1.0.1-beta.22); merges before SC-6. Evidence-affecting, blocking
tier.
- PR #1626 kept this out and filed no issue. `verify.sh` reads `deletion` and `capture` entries
  from `$MANIFEST_FILE` only. Landing the fix before SC-6 means no Shared Case package ships with
  the old script.
- Starts in `verifyScript.ts`, `verifyRunbook.ts` and
  `tests/main/services/sharedCaseExport.test.ts`.
- Done when `verify.sh` verifies each member chain under its `member-add` key, checks every
  `merge` head, and binds remote Captures and Exhibits to their author's chain, or reports
  INCOMPLETE (exit 3), never PASS, for any member chain it does not check; and a two-member
  package with one forged remote entry fails under `runVerifyScript`.

**SC-E. Two-instance Shared Case e2e (to file).** Wave 4, after SC-2b, SC-6 and SC-7, alongside
SC-8. Evidence-affecting by path (a test-only Capture Server port override in
`src/main/index.ts`).
- The spec's Testing section asks for this test. A second instance cannot boot today: the Capture
  Server port is fixed (`constants.ts:1`) and boot aborts on `EADDRINUSE`.
- Starts in `e2e/fixtures/electronApp.ts`, a new e2e spec, and a test-only transport bridge
  behind an environment flag.
- Done when two instances invite, join and sync one Capture, and the receiver shows it with the
  Owner's Member Code prefix.

**SC-D. Shared Cases docs (to file).** Wave 4, beside SC-8; merges before the tester build. Docs
only.
- Scope: a Shared Cases section in `threat-model.mdx` (what a Shared Case protects and what it
  does not, from the collaborative cases design's Evidence impact item 2, and the key held per
  member), the `features.mdx` "one investigator on one machine" limit line, a tester-guide
  section on invite, join, revoke and the relay, and `CONTEXT.md` terms for Member and Invite
  plus the Entry Hash subject of a Timestamp Token.
- Verify with `.claude/hooks/vale-prose.sh --base origin/main` and `pnpm dlx mint broken-links`.

## Capture engine briefs

Stage 1 adds new artifacts to the background renderer. Stages 2 to 4 (launched Chromium, the
Companion pipe with removal of the extension's capture code, and Firefox) are undesigned, so they
get spec briefs, not code briefs. Every code brief below except CE-4 is blocking tier.

**CE-1. Background renders deny permission prompts (#1693).** Wave 0. Evidence-affecting.
- A one-line permission check handler in `backgroundRenderer.ts`, with a test that notification
  and location read as denied.

**CE-2. Refuse a redirect to a loopback or private address (#1726).** Wave 0, alongside CE-1.
Evidence-affecting.
- Starts in `recapture.ts` (`validateUrl` :99, the final-URL check :150),
  `src/renderer/components/captures/guestLink.ts` (its address classification moves to a module
  both sides import), `backgroundRenderer.ts` (a new per-hop redirect check before anything
  renders, because it has no redirect hook today), `tests/main/services/recapture.test.ts`, and
  the test-only loopback allowance below.
- Done per the 2026-10-04 ruling on the issue, and when the two recapture e2e specs still pass
  through a test-only allowance for loopback fixtures that a packaged build cannot turn on, and a
  test asserts that production refuses `127.0.0.1`. CE-3 and CE-7 run their fixture tests through
  the same allowance.
- Adds the shared address-classification module to the evidence-affecting paths assessment as a
  blocking row.

**CE-3. Egress setting (#1695).** Wave 1, after CE-1 and CE-2 merge and the update-check ruling;
merges only after a release carrying #1747's schema-5 verifier (`a7cd33a1`) is tagged.
Evidence-affecting.
- #1695 stays blocked until #1694's verifier ships. v1.0.1-beta.22 predates it; draft PR #1799
  (1.0.1-beta.23) is the candidate release.
- Edits the partition setup in `backgroundRenderer.ts` and the TLS re-fetch in
  `captureLifecycle.ts`, so it lands before CE-7. Per #1695's scope it also starts in
  `timestamp.ts`, `consentBlocker.ts`, `waybackMachine.ts`, `webviewPolicy.ts`
  (`WAYBACK_PARTITION`), `settings.ts` (advisory) and `OperatorConfig.tsx` (blocking tier).
- If it mirrors the Egress fields onto the `captures` row, it takes the migration lane and the
  Case Archive lane.
- Its fixture tests use CE-2's loopback allowance. The agent writes the SOCKS5 fixture server by
  hand in the test, or takes a test-only server dependency to the maintainer for approval (see
  the gates table). The PR describes one Recapture through Tor Browser's port for a human to run
  before merge.

**CE-4. Warn when no VPN is seen and the Egress is direct (#1696).** Wave 2, after CE-3. Not
evidence-affecting.
- Stores the network hash in `settings.ts` (advisory) and only opens the Egress setting. If its
  diff touches `OperatorConfig.tsx` (blocking tier), the PR carries `evidence-affecting` by the
  backstop.

**CE-D1. Egress docs (to file).** Wave 2, or inside CE-3's PR in wave 1. Docs only.
- Scope: `SECURITY.md` Network egress, `features.mdx` Network use and Capture, the two ADR-0032
  statements (a background Recapture names Birdbrain; time zone and language still reveal the
  region through a proxy), and a network-attribution section in `threat-model.mdx` with its
  limits, or a note on #546 saying where it went.
- Verify with `.claude/hooks/vale-prose.sh --base origin/main` and `pnpm dlx mint broken-links`.

**CE-P. First-slice implementation plan (to file).** Wave 0. Docs only.
- Splits the first-slice spec into PRs, because the spec has no build order. This plan's proposal:
  CE-5 (verifier and schema), CE-6 (migration), CE-7 (Transaction Record with its inventory part,
  WARC, Bound TLS Details, and the WARC in Evidence Packages), CE-8 (screenshot and PDF
  inventory, Scroll-to-load, PDF, and the PDF in Evidence Packages), CE-9 (Case Archive,
  Duplicate and deletion).
- Recommends answers to the spec's five open questions. The `.warc.gz` choice has to be settled
  before CE-5, because the verifier finds each artifact by a path that fixes its extension
  (`evidence-package-layout/lib/paths.ts`) and a released verifier cannot be recalled. The size
  budget can wait for CE-7.
- Resolves the `warcio` licence and proposes the test-only WARC reader and PDF parser.
- Recommends whether CE-5 also carries the `launched` value. `launched-passive` stays with #600,
  as #599 rules ("lands with the restoration, not before"), unless the maintainer overrides that
  ruling. `companion` is stage 3 (ADR-0034, order of work) and waits for CE-S3 to define its
  entry.
- Reruns the probe spike on the current Electron (`^44.5.1`; the probe ran on 44.4.5), as the
  capture engine spec's risk section asks ("Rerun it on each Electron upgrade").
- Deliverable: `docs/plans/2026-10-NN-capture-engine-first-slice.md`. The maintainer approves it
  together with the spec.

**CE-5. Verifier and schema for the new capture fields (to file).** Wave 2, after CE-P is
approved and the beta.23 schema-steps decision. Holds the manifest schema lane after CE-3 and the
schema steps ahead of it in the lanes table.
- Adds optional `capture` fields for the inventory, Scroll-to-load, Bound TLS Details and the
  WARC and PDF hashes. An absent hash claims nothing; a present hash with a missing or different
  file fails, as `screenshotHash` does today. `MANIFEST_SCHEMA_VERSION` takes the next number,
  settled when CE-5 starts against the releases that have shipped (the slice-2 plan's rule).
- Adds the WARC and PDF hash fields to the shared list of anchored hash fields. If CE-5 starts
  before SC-2 merges, CE-5 creates that list with `contentHash`, `screenshotHash` and `textHash`,
  and SC-2 builds its blob list from it.
- Starts in `src/shared/schemas.ts`, `manifest.ts`, `src/shared/verify/` (including
  `evidencePackage.ts`, the package checker, which checks `screenshotHash` at :849-858),
  `src/verifier/`, `src/shared/constants.ts`, `src/packages/evidence-package-layout/`.
- Done when old entries still verify and tamper tests fail on each new hash, and the PR adds
  `src/packages/evidence-package-layout/**` to the assessment's blocking tier. A tagged release
  ships it before CE-7 merges.

**CE-6. Mirror the new capture facts on the `captures` row (to file).** Wave 3, after CE-5
merges. Takes the migration lane when it is free, and the Case Archive lane.
- Starts in `migrations.ts` and `captureRepo.ts`.
- Done when the migration test shows the new columns, the `CAPTURE_COLUMNS` drift test passes,
  ingest writes the mirror values from the entry, and `CASE_ARCHIVE_SCHEMA_VERSION` takes the
  next number, because an older importer drops the new columns.

**CE-7. Transaction Record, WARC and Bound TLS Details (to file).** Wave 4, after CE-3, CE-6 and
SC-2 merge and the `warcio` and probe-rerun gates clear. Merges only after CE-5 is released.
- Loads `about:blank`, enables `Network` with buffer limits, then loads the target. Each
  `requestWillBeSent` becomes its own exchange. Credential header values are replaced in memory
  (ADR-0036). Bound TLS Details come from the main document's `securityDetails`, in a field beside
  `tls`. It writes no `WARC-IP-Address` from CDP's remote address while the Egress is not Direct.
- Writes the Transaction Record part of the inventory: exchange counts, the cached, cancelled,
  failed, in-flight and over-budget requests, incomplete request bodies, the replaced credential
  header names (ADR-0036), and the reason Bound TLS Details are absent when the main document came
  from cache.
- In the same PR: places the WARC in Evidence Packages (`export.ts`, the `evidence-package-layout`
  path, the `verify.sh` check); updates the `CONTEXT.md` clauses it makes true (dropping
  _Planned_) and the Capture section of `features.mdx`, stating beside the capability that
  Birdbrain replaces credential header values (ADR-0036); and adds each new acquisition module
  (WARC writer, inventory) as a blocking row in the evidence-affecting paths assessment.
- Starts in `backgroundRenderer.ts`, `recapture.ts`, `captureLifecycle.ts` (`verifySidecars`),
  `captureStore.ts`, `export.ts`, `verifyScript.ts`, `verifyRunbook.ts`, `verifyProcedure.ts`
  (only if the WARC check adds a verify step), `src/packages/evidence-package-layout/` and
  `src/main/services/sharing/`.
- Done when the spec's known-answer tests pass against a local fixture server reached through
  CE-2's loopback allowance (gzip and plain digests, a redirect, cached, failed, cancelled and
  over-budget responses, a non-`warcio` reader, and a TLS fixture with a known certificate); a
  package exported from a Capture carrying the WARC hash verifies and a changed byte in that file
  fails; and `verifySidecars` reports a WARC hash mismatch as tampered and a missing file as
  missing (the #1661 pattern), with a test for each.
- Also done when a two-peer `MemoryTransport` test shows the receiver hash-checks the WARC before
  showing it and its Shared Case walk passes, and when, with CE-3's SOCKS5 fixture and the Egress
  set to a proxy, neither the WARC nor the inventory contains the proxy's host or port (ADR-0032
  rule 5).

**CE-8. Screenshot and PDF inventory, Scroll-to-load and PDF (to file).** Wave 5, after CE-7 (and
so SC-2).
- `scrollToLoadLazyContent` returns its outcome (skipped, page stopped growing, height cap, time
  budget, or failure), which records #1667's background half; whether #1667 then closes is the
  maintainer's call. The screenshot records scaled, truncated and trimmed with dimensions, and
  `printToPDF` runs last. This inventory part covers only the screenshot, the PDF and
  Scroll-to-load.
- Places the PDF in Evidence Packages in the same PR, and `verifySidecars` checks the PDF hash as
  CE-7 does for the WARC.
- Starts in `backgroundRenderer.ts`, `captureLifecycle.ts` (`verifySidecars`), `export.ts`,
  `verifyScript.ts`, `verifyRunbook.ts` and `src/packages/evidence-package-layout/`.
- Done when, for a fixture page, the inventory records each Scroll-to-load outcome and each
  screenshot and PDF state; a package exported from a Capture carrying the PDF hash verifies and a
  changed PDF byte fails verification; `verifySidecars` has tamper and missing tests for the PDF;
  and a two-peer `MemoryTransport` test shows the receiver hash-checks the PDF before showing it
  and its Shared Case walk passes.
- In the same PR: updates the `CONTEXT.md` clauses it makes true (dropping _Planned_) and the
  Capture section of `features.mdx`, and adds each new acquisition module as a blocking row.

**CE-9. File handling for the WARC and PDF (to file).** Wave 6, after CE-8.
- Case Archive export and import, Duplicate and deletion; the Evidence Package half lands in CE-7
  and CE-8. Starts in `caseArchive.ts`, `captureStore.ts` (`CAPTURE_ARTIFACT_TYPES`,
  `parseArtifactFilename`), `captureLifecycle.ts`, `export.ts`, `reportHtml.ts` and
  `src/main/services/db/dbAdmin.ts` (`findOrphans`).
- Takes the Case Archive version lane: it needs a bump (an older importer drops the WARC and PDF
  files).
- Done when a Case Archive round trip, a Duplicate and a deletion each carry, copy or remove the
  WARC and PDF, with a test each; the orphan scan reports a stray `.warc` or `.warc.gz` and
  `.pdf`, and flags a Capture missing either; and the PR updates the `CONTEXT.md` clauses it makes
  true (dropping _Planned_) and the Capture section of `features.mdx`.

**CE-10. Extraction stops blocking the main process (#598).** Wave 3, after CI-4 merges and the
#598 direction gate; before any stage-2 code brief. Blocking tier (`captureLifecycle.ts`).
- Moves both data extraction and the field build, in the direction the gate picks.
- Starts in `captureLifecycle.ts` (`runPostCaptureWork`, `runDataExtraction`).

**CE-S2. Spec for stage 2, launched Chromium (to file).** Wave 0. Docs only.
- Covers what ADR-0034 leaves open: browser discovery and launch, the per-Persona profile layout,
  cookie seeding from the Persona import, proxy and WebRTC flags for the Egress, the CDP client
  (raw WebSocket or a library, a dependency decision), the Operator's capture trigger, cutting a
  session-long recording into per-Capture WARCs, multi-tab ownership, Selector matching, the
  `launched` and `launched-passive` values, and the Persona wording.
- Folds in #599 and #600, and states that #598 (extraction blocks the main process) has to land
  first (CE-10).
- Deliverable: `docs/specs/2026-10-NN-capture-engine-launched-browser-design.md`. It names #1505
  as superseded.

**CE-S3. Spec for stage 3, the Companion pipe and removing extension capture (to file).** Wave 2,
after CE-S2 merges. Docs only.
- Covers the pipe's transport and authentication, what remains of the Capture Server, the legacy
  `extension` value, the `debugger` permission and its Chrome Web Store review exposure, and the
  deletion list (the screenshot stitcher, the `HOTFIX:` blocks, the `webRequest` header code).

## Case investigation briefs

`docs/plans/2026-10-09-case-retrieval-first-slice.md` (PR #1795, merged) plans the retrieval
first slice. The engine, the view and the AI layer have designs and ADRs but no plan, so CI-P
comes before any engine or view code.

Retrieval steps 2, 3, 4 and 6 (CI-3, CI-4, CI-5, CI-7) share one evidence call: no (retrieval
plan, Evidence impact). Each touches `db/**` (CI-4 also `captureLifecycle.ts` and
`caseArchive.ts`), so its PR carries `evidence-affecting` by the backstop, explains in Evidence
impact why nothing stored changes, and never auto-merges. The filed issue states the call. A
brief that updates `features.mdx` also runs `pnpm dlx mint broken-links` and
`.claude/hooks/vale-prose.sh --base origin/main`.

**CI-1. Find domains, emails and URLs in search (#1590, retrieval step 0).** Wave 0, once
queued. The triage call on #1590 is no (2026-10-05 brief). The diff touches
`src/main/services/db/**` (blocking tier), so the PR carries `evidence-affecting`, gets human
review, and says in Evidence impact why nothing changes.
- Quotes terms that contain punctuation in all three search paths.

**CI-2. Synthetic Case baseline (PR #1796, retrieval step 1).** Wave 1; #1795 has merged, and
the baseline run waits for the size. Not evidence-affecting.
- Fixes PR #1796's two blocking review findings (the ranking counts only planted pages, so the
  top-5 and top-20 counts both equal the found count; three queries name the mail page's
  Reply-To, which D10 says no query names), then finishes the generator and runner. The fixes do
  not wait on the size; the baseline run on `main` does, and it runs before CI-5 merges.

**CI-3. Search field tables and extractor (to file, retrieval step 2).** Wave 0. Holds the
migration lane first. Evidence call: no, with the backstop (see above).
- Migration for `exhibit_search_builds`, `exhibit_search_fields` and a trigram FTS5 table with
  triggers; `fieldExtractor.ts`; link helpers moved out of `captureLinks.ts`.

**CI-4. Field build service (to file, retrieval step 3).** Wave 2, after CI-3. Evidence call: no,
with the backstop (see above).
- Field repository and build service, the ingest hook in `captureLifecycle.ts`,
  `ensureCaseFields`, rebuild, and the rebuild on Case Archive import in `caseArchive.ts`.
- The field build runs in `runPostCaptureWork` as today. CE-10 (the #598 fix) merges after CI-4
  and moves both data extraction and the field build.

**CI-5. Fielded search in the app (to file, retrieval step 4).** Wave 3, after CI-4 and the CI-2
baseline. Evidence call: no, with the backstop (see above).
- The `search:fields` channel, the search bar group, and opening a hit in the Text or Links tab.
- Done when an e2e spec seeds a Capture holding a header block through `e2e/fixtures/seed.ts`,
  searches its From address, and the Text tab opens with the span highlighted, and the PR updates
  `features.mdx` for the feature. Verify with `pnpm test:e2e`, then `pnpm preflight`.

**CI-6. `checkFieldHit` (to file, retrieval step 5).** Wave 4, after CI-5. Evidence-affecting,
and the plan's Ruling 4 needs the maintainer's sign-off before merge.
- Shows the check beside the hit CI-5 adds (D7), and updates `features.mdx` in the same PR.

**CI-7. Unreviewed view and second evaluation (to file, retrieval step 6).** Wave 5, after CI-5
and CI-6 (and so after the Ruling 4 sign-off). Evidence call: no, with the backstop (see above).
- A Data screen tab listing captures nobody annotated, the second run on the synthetic Case, and
  the finished assessment.
- Updates `features.mdx` for the unreviewed view in the same PR.

**CI-P. Engine implementation plan (to file).** Wave 0. Docs only.
- Table DDL for ADR-0042's records, giving the decision, Withheld, own-identifier, Source Class
  and copy-mark tables the four working-layer columns so CI-9's one migration serves the sync;
  which of the spec's two consistency approaches a run uses; the engine's typed contract and IPC;
  the identifier set beyond the retrieval plan's; whether PDF and `mbox` Exhibits are in the first
  engine slice; how the spec's thresholds get set from the evaluation; the engine fixture list; a
  PR split that assigns run lifecycle to a named brief; the plan for retrieval step 7; and the
  Shared Case amendment for synced decisions and flags that ADR-0042 lists as a follow-up.
- Says whether Transaction Record headers become a field source: either they stay out of the
  engine's first slice, or a later field-extractor brief depends on CE-7 and records absence for
  Captures without a WARC.
- Deliverable: `docs/plans/2026-10-NN-case-investigation-engine.md`.

**CI-8. Engine contract and fake engine (to file).** Wave 2, after CI-P is approved. Not
evidence-affecting.
- The typed contract in `src/shared/` and a fixture-backed fake that the view briefs build
  against.

**CI-9. Investigation records storage (to file).** Wave 4, after CI-2, CI-3 and CI-P approval;
takes the migration lane when it is free (CE-6 or CI-9, whichever is ready first).
Evidence-affecting (`db/**`).
- One migration for the ADR-0042 tables, the Case revision triggers on every input table, the
  generation id replaced on snapshot restore and import, the archive collectors, importers and
  `ID_PROBE_TABLES` (`src/main/services/db/core.ts:140`), and `CASE_ARCHIVE_SCHEMA_VERSION` at the
  next number at merge.
- The Case revision read (generation, counter, and the Manifest head read from `manifest.jsonl`)
  in the app and in the MCP server under `src/mcp/`, with a test on each path.
- Done when a successful `db:restore` (Restore from File) and a successful `db:restoreSnapshot`
  each replace every Case's generation, with one test per path showing that a run recorded before
  the restore reads as out of date after it.
- Also done when, on the synthetic Case, a whole-Case reprocess and a Case Archive import are
  timed with and without the triggers, and the change-log rows they write are counted, with both
  recorded in the engine assessment.

**CI-10 to CI-13 and CI-D. Engine.** Waves 5 to 7, each split as CI-P decides.
- CI-10, the base layer (after CI-9 and CI-4): identifier extraction and normalization, the four
  proposal rules, document Subjects, two-Joint expansion, determinism. Done when CI-E's runner,
  run against CI-10, records the measures and sets the spec's thresholds in the engine assessment.
- CI-11, claim checks (after CI-6 and CI-10): `checkFieldHit` plus the `textHash` comparison
  against the signed Manifest. Evidence-affecting: it reports whether a span is present in stored
  bytes, the class Ruling 4 rules evidence-affecting.
- CI-12, paths, strength summary, weak mark and gap list (after CI-10 and its threshold run), and
  the local-only source trail (investigation engine spec step 6): matches pinned Wayback Refs
  (`waybackRefRepo`) by URL and date, finds a marked copy's original inside the Case, and feeds
  the gap list's missing-originals group. It makes no network request, and a test asserts that.
- CI-13, exporting Joints from `export.ts` (after CI-11 and CI-12). Evidence-affecting.
- CI-D, decision and flag writes (wave 5, after CI-9): accept, reject, add and dismiss with the
  acceptance context, Source Class, copy marks, Withheld from analysis, the Operator's own
  identifiers, and the run record's single revision-checked write. Until the MCP ruling, it adds
  a sentence to `website/content/docs/mcp.mdx` stating that MCP tools still return withheld
  Exhibits.
- CI-10, CI-12 and CI-D: triage makes the call when each is filed; each touches `db/**`, so its PR
  carries `evidence-affecting` by the backstop.

**CI-R. Run lifecycle (to file).** Wave 5, after CI-8 and CI-9, split as CI-P decides. The issue
carries an explicit evidence call; the diff touches `db/**`, so the PR carries
`evidence-affecting`.
- Starts in the engine service and IPC CI-P names, plus the Notes editor action for a selected
  passage.
- Done when a run starts from an inquiry, from a Note passage (recording an Operator-started Joint
  whose Note never counts as support), or from Find more material; progress events and cancel
  work, and a cancel discards partial results; a revision change mid-run stops it as invalidated;
  the out-of-date check applies ADR-0042's two exceptions and lists what changed from the change
  log; and the same-name choice starts a Joint that cites the span.

**CI-14. Withheld mark (to file, retrieval step 7).** Wave 6, after CI-9, CI-5, CI-7 and the
mark's design; its paths come from CI-P. Triage makes the evidence call when it is filed; it
touches `db/**` (`searchCaptures`), so its PR carries `evidence-affecting` by the backstop.
- Done when withheld-before-indexing and withheld-after-indexing pages are added to
  `scripts/retrieval-eval/`; a third evaluation run shows the withheld Exhibit in Case search with
  its mark, and in no analysis query once the engine exists; and the results are appended to the
  retrieval first-slice assessment.

**CI-S. Sync investigation records (to file).** Wave 6, after SC-2, CI-9, CI-D and the amendment
gate. The issue carries an explicit evidence call; the diff touches `db/**`, so the PR carries
`evidence-affecting`.
- Starts in the `rows` step under `src/main/services/sharing/` and the investigation
  repositories.
- Done when a two-peer `MemoryTransport` test shows that an accept syncs attributed to its member;
  a reject of an unsynced proposal stays local; a Withheld flag received by sync invalidates a
  running run; own identifiers sync without the Persona label or notes; and two conflicting
  Source Class values show attributed until a member chooses.

**CI-E. Engine evaluation Case and runner (to file).** Wave 4, after CI-P is approved and CI-2
merges. Not evidence-affecting (scripts and docs only).
- Reuses the #1796 generator. Starts in `scripts/retrieval-eval/` (or a sibling
  `scripts/engine-eval/`), with the invented pages and answer key for investigation engine spec
  :264-276.
- Done when the runner records every measure at :283-289 and the safety gate at :291 against the
  CI-8 fake, with results in a dated assessment under `docs/specs/`. The :279 question is its
  end-to-end case.

**CI-V1 to CI-V5. View surfaces.** Triage makes the evidence call per brief: CI-V1 and CI-V2 no;
CI-V3 shows claim-check outcomes, which Ruling 4 treats as evidence-affecting; CI-V4 shows
cannot-check and Integrity Status, and any edit to `ProvenanceBadge.tsx` or
`getProvenanceColor.ts` trips the blocking backstop. Sizes are the feasibility assessment's.
- CI-V1 (wave 3, after CI-8): the Investigate route, header S2, run setup S1, narrow window S7,
  and the token fixes. The sidebar and command palette entries land here or in CI-V5, per the
  release gate. It lands first because it owns the route tree, and `Sidebar.tsx` too unless the
  gate picks option (a). Done when it states which release option it implements.
- CI-V2, CI-V3 and CI-V4 run in parallel in wave 4, after CI-V1.
  - CI-V2: map and list S3, with a pure layout module like `backlinkMapModel.ts` and the map
    accessibility fix.
  - CI-V3: Joint detail S4 and source inspector S5. If the inspector reuses the span highlighting
    CI-5 adds to the Text and Links tabs (retrieval plan Ruling 2), it rebases after CI-5.
  - CI-V4: gap list S6, own identifiers S9, same-name Subjects S10, and states 1 to 8 (8 with
    S10), 10, 11, 12 and 15. State 12's real-engine form needs synced decisions (CI-S), so CI-V4
    builds it against the fake engine.
- CI-V5 (wave 7, after CI-10 to CI-12, CI-D and CI-R): swap the fake engine for the real one, and
  add the Investigate section to `features.mdx` with the base layer's limit (it finds only shared
  identifiers and exact text). Merges only once CI-E's runner has run against the real engine and
  the base-layer bar gate clears.

Run history (G3), lookup consent (G7, state 9) and the AI layer (S8, states 13, 14, 16, 17) wait
on the decisions in the gates table. The provider benchmark harness (investigation engine spec
:295-297) is not
briefed: it depends on CI-E and on CI-9's MCP revision read, not on the local-model ADR.
