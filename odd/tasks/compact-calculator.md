# Compact single-screen calculator
Objective: reduce calculator height without changing numerical results; separate saved history into an accessible tab.
Branch: feat/print3d-management. Local work-unit commits only. Risk: item 3 (shared calculator UI and history navigation).

## Specs

S1 — Compact desktop calculator.
User: "ya esta ok ,necesito mejorar el diseño, necesito que todo la informacion salga en una solo ventana. y scroll sale muy alta. hay que cam"
Check: at 1280×800 desktop, ordinary calculator draft fits without main-document vertical or horizontal scrolling. Replace oversized intro/spacing with compact functional heading, arrange fields in columns, retain a readable summary and visible Save. All primary inputs including lifetime/replacement/error and multiplier must be visible, not clipped or hidden to fake the height. Keep labels/units, legible text and at least44×44 touch targets. Advanced production costs remain accessible; if expanded or viewport too short/zoomed, allow scrolling rather than clipping. On phone/tablet adapt readably; no impossible zero-scroll promise on small screens.

S2 — Separate history tab.
User selected: "Calculadora completa; historial aparte (recomendado)"
Option description: "Campos compactos en columnas, resultados y Guardar siempre visibles. Historial en otra pestaña. Objetivo: escritorio de 1280×800 sin scroll principal; en celular se adapta."
Check: calculator and history are distinct accessible tabs within the existing page, with clear selection and keyboard operation. Save remains explicit and confirms without silently overwriting records. History is reachable with one action; opening a saved copy returns to calculator. Retain historical-copy notice/current-draft action, missing purchased identity rejection and read-only purchased fields. Saved history may scroll on its own view. No deleting or migrating old data.

S3 — Preserve accepted behavior.
User: "ya esta ok"
Check: do not change arithmetic modules, mapper, persistence or acquired stock. Reference example22000CLP/1000g,294g,11h,130W,230tariff,220000replacement/4320h,5%,×2 stays7724.94cost/15449.88sale. Keep presets/custom, internal no-revenue, simultaneous adjustments/floor, validation and explicit-save-only. Browser probes use isolated state. Purchases page stays unaffected.

## Tasks

T1 | S1-S3 | route: delegated/context-backstop | status: done | commit: 11f7a40 | Compact calculator layout and accessible calculator/history tabs, preserving field IDs/behavior, with tests/docs.
T2 | S1-S3 | route: independent verifier / Risk3 | status: done | commit: 11f7a40 | Verify measured desktop height/visibility, responsive touch/overflow, tab/save/reopen flow, reference values and unchanged saved bytes.
T3 | S1-S3 | route: inline | status: done | commit: 11f7a40; tracking checkpoint follows | Record evidence/screenshots, mirror full tracking and commit coherent local unit; report physical-device limitations.

## Log

L1 — User request, verbatim:
"ya esta ok ,necesito mejorar el diseño, necesito que todo la informacion salga en una solo ventana. y scroll sale muy alta. hay que cam"

L2 — Product decision:
Parent inspected index.html/styles.css; current desktop full-page screenshot is1280×2739, oversized intro and vertical section spacing dominate. Asked: "Para que entre en una sola pantalla de escritorio, ¿cómo querés organizar el historial?" User selected "Calculadora completa; historial aparte (recomendado)", token compact-calculator-separate-history, with description quoted in S2. Preserve current colors/identity; no new marketing sections or design-document detour.

L3 — Implementation/verification boundaries:
Baseline894910e, clean worktree before this tracking document. Do not modify costs.mjs,reference-costs.mjs,quote mapper or data stores. Existing E2E tests requiring visible saved history need tab-aware public UI navigation, not forced DOM state or hidden-element assertions. No clipping via overflow:hidden to fake fitting; ordinary desktop main controls/result/save must all be visible together. Measure actual scrollHeight and bounding boxes in tests. Alternate isolated localhost5203/explicit project cwd/workers1 for browser runs; do not stop user's5173 preview. Prior connection-reset incident is documented; preserve failures and never automatically retry a timeout. No publishing, dependencies, auth, DB or unrelated purchase UI work.

L4 — Implementation and observed self-verification:
Worker mvhhaesg-8-6oap completed compact layout and accessible tabs. RED desktop1280×2739 and missing tabs; GREEN focused12/12 across four emulated projects, desktop1280×800 with primary controls/result/save in viewport and reference7724.94/15449.88. Full browser88/88 passed on correction run after fixing history-on-reload test; first failure remains a recorded test expectation issue, not a discarded run. Worker Node54/54/diffcheck0. Parent reviewed desktop screenshot, tab/open-copy code and public browser regressions; parent npm54/54,diffcheck0 and confirmed no domain/mapper/store changes. Independent Risk3 assess required verifier, native unassessable because new tracking/test files untracked, RDD off. No baseline differential browser or physical-device proof; no source commit/publication yet.

L5 — Independent approval and delivery:
Verifier mvhhkvoh-9-of41 returned S1/S2/S3 met without blockers. Independent focused Chromium/phone6/6 exit0 and geometry3/3 exit0; desktop document1280×800 both initially and after reference values, full result bottom595.44 and Save bottom748.84. Primary targets44×44/viewport bounds passed; expanded costs height923 and shortdesktop600px content reachable with normal scroll. Phone/iPadlandscape no horizontal overflow. Tab keyboard/roles/selection/focus and save/open-copy byte isolation passed. Exact reference7724.94/15449.88 unchanged; no domain/mapper/store diff against894910e. Full browser88/88 and Node54/54 remain prior self-proof, not independently repeated. No physical-device or baseline-browser-differential claim.
Parent reviewed source, public regression and desktop screenshot; staged diff-check exit0. Committed coherent local Risk item3 unit11f7a40 (9files223insertions66deletions). Optional scratch geometry probe not imported; existing committed test already covers primary bounds, reference results and expanded/short-screen reachability, and no outside scratch read/delete authorized. Full feature mirror refreshed; final tracking checkpoint follows. No push/PR/merge/release, no arithmetic/persistence changes. Mobile/expanded states may scroll by design; ordinary1280×800 calculator does not.
