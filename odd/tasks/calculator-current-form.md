# Current calculator form correction
Objective: make new calculator drafts use the accepted reference formula directly; preserve old saved quotation arithmetic without making the user choose a calculation version.
Branch: feat/print3d-management. Local work-unit commits only. Risk: item 3 (shared UI initialization and historical reopening).

## Specs

S1 — Reported visible failure.
User: "no veo vida util" / "me dices que el calculo esta bien y ni el campo esta" / "pero coloc los valores y no me da"
Check: reproduce the supplied screenshot before changing source: 22000 CLP/1000g,294g,11h,130W,230CLP/kWh, zero legacy depreciation and35% markup yielded cost6797/sale9176. This proves active legacy mode, not incorrect material inputs. A fresh or reloaded calculator must directly expose replacement cost/lifetime/error percentage and preset/custom multiplier with reference behavior, without requiring manual version selection. For replacement220000/lifetime4320/error5%/×2, render cost7724.94 and sale15449.88. Do not alter arithmetic modules or historical storage.

S2 — Preserve historical data.
User: "ajusta"
Check: correction remains within the authorized reference alignment. Keep saved quote snapshots and purchases/print stores untouched. Legacy saved forms still open with their legacy calculation, with a clear notice that this is a historical calculation and a deliberate action to start a current-reference draft. No silent recalculation or overwriting original history. New ordinary drafts cannot get stuck in legacy due to restored browser form values. Continue explicit-save-only and quote no-stock-deduction rules.

S3 — Preserve requested multiplier workflow.
User: "x2 es el margen de ganacia que quiero pero quiero varias obciones y que se puede personalizar"
Check: retain default×2,presets×2/2.5/3/3.5/4/5,custom and reference internal-purpose no-revenue behavior. Do not restore35% markup as the normal fresh-form sales workflow. Do not broaden into a layout redesign or platform/supply fees.

## Tasks

T1 | S1-S3 | route: delegated/context-backstop | status: done | commit: 66f6549 | Reproduce fresh-form legacy visibility regression, correct initialization and historical-only UI, update public browser regressions and concise usage docs.
T2 | S1-S3 | route: independent verifier / Risk3 | status: done | commit: 66f6549 | Verify exact visible reference example and fresh/reloaded behavior, explicit old-copy notice/action, unchanged historical bytes and legacy API.
T3 | S1-S3 | route: inline | status: done | commit: 66f6549; tracking checkpoint follows | Record proof/mirror, commit coherent local unit and report only observed outcome.

## Log

L1 — Latest failure report, verbatim:
"pero coloc los valores y no me da"
User supplied pi-clipboard-328470cf-2e1b-4d12-a272-d0b9e2800132.png; visible inputs22000,1000g,294g,11h,130W,230tariff; output6797cost/9176sale; UI has legacy35% and no lifetime/error fields.

L2 — Parent reproduction:
Read-only public evaluate with these inputs, calculationMode legacy, depreciation0,markup35 returned exactly6797cost/9176sale, exit0 with assertions. Previous numeric correction76d7ea1 and tracking46e03dd are correct for explicit reference mode, but did not solve the normal visible workflow. No claim that the user's screenshot is wrong. Reference arithmetic should remain unchanged; fix UI state/visibility and compatibility routing instead.

L3 — Routing and constraints:
Runtime context backstop previously triggered; bounded several-file UI correction delegated. Prefer hidden explicit calculationMode for reference drafts, historical mode controlled by opening saved copies rather than a user-facing version chooser. On old-copy open show a clear legacy notice and a deliberate current-draft action; never mutate stored bytes while viewing/editing. Existing tests that choose legacy for contract scenarios should open a genuine legacy saved fixture through public UI/storage APIs, not force DOM state. All browser tests use isolated storage/local server with explicit project cwd and alternate port; do not interrupt user preview5173. No deleting outside scratch paths, no publication or dependency/tooling changes.

L4 — Partial implementation, observed amounts and missing proof:
Worker mvhgdhks-6-blr1 implemented reference-only fresh drafts, hidden calculationMode, visible lifetime/replacement/error/default×2, historical notice/current-draft action, initialization/reload handling and public browser fixtures/docs. New UI tests RED8/8 failed, then GREEN8/8 across four emulated projects; screenshot example displayed7724.94cost/15449.88sale. Seeded historical copy displayed6797/9176 with unchanged saved bytes. Node54/54 and diffcheck0. Full browser first75passed1failed; worker applied one correction, then full75passed1different failure (Chromium reference test timed out waiting Material). This is partial, not complete; no further automatic retry.
Parent read failed test snapshot and project-local trace.zip without rerunning: console recorded net::ERR_CONNECTION_RESET loading http://127.0.0.1:5200/src/data/purchases.mjs. Empty spool options/results show page initialization did not complete. This explains the timeout in that run; it does not prove full browser suite passes. No additional functional checks or verifier launched. Risk3 assess requires independent verifier; native diff unassessable because tracking/test is untracked, RDD off. Independent proof remains pending until self-verification is available. Code remains uncommitted/unpublished; no physical-device claim. Needs owner decision to authorize one new full browser run after the local connection failure, then required independent review; or leave this unit paused.

L5 — Authorized full run passed:
User answered "soluciona" to the explicit new-run/independent-review decision. Parent job-3 used a temporary config, explicit project cwd, isolated127.0.0.1:5201 and workers1 without touching user5173 preview. Full browser76/76 passed exit0 in36.7s. Parent npm54/54 and diff-check exit0; inspected desktop current-reference.png showing visible4320h lifetime,220000replacement,5%,×2 and exact7724.94/15449.88. Previous failed/time-out runs remain recorded, not recast as passes. Independent final-code Risk3 verification is next; no source commit/publication yet.

L6 — Independent approval and local delivery:
Verifier mvhgp9uq-7-1u5n returned S1/S2/S3 met, no blockers: independent Chromium current-form2/2 exit0, bounded browser probes2/2 exit0, focused reference/history Node7/7 exit0. Fresh/reloaded form visibly showed replacement/lifetime/error/default×2 and exact7724.94cost/15449.88sale; all presets/custom1.5/invalidzero/internal behavior passed. Historical6797/9176 copy notice/action, edit/open/reload byte isolation and missing purchased identity rejection passed. Full76/76 was not independently repeated; no build/typecheck script or physical-device proof. Separate baseline-output comparison was not performed by verifier; arithmetic/mapper/storage modules are unchanged in this UI-only unit, and their existing Node contracts pass.
Parent reviewed source/routing/tests and staged diff-check exit0. Committed coherent Risk item3 work unit66f6549 (8files,129insertions38deletions). No push/PR/merge/release. Existing committed current-calculator regression already covers required visible workflow; optional additional scratch probe was not imported, and outside scratch was not read/deleted without consent. Full mirror refreshed; final tracking checkpoint follows. Compact layout request remains deferred, not implemented by this correction.
