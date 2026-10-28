# Quote client details and local numbering
Objective: optionally attach client contact details to explicitly saved quotations and assign a human-readable local quote number without altering existing records.
Branch: feat/print3d-management. Risk: item 4 (local numbering and stale browser snapshots; best-effort conflict detection, not server atomicity). Local work-unit commits only, no publication.

## Specs

S1 — Optional client data.
User: "Falta un campo donde pueda colocar datos del cliente cuando quiera guardar la cotización.Que la guarde con un número."
Proposal accepted by user "si": "Cliente o empresa", "Teléfono", "Correo", all optional. No RUT/address in this delivery.
Check: user can enter/leave blank client/company name, phone and email when preparing to save; include detached client snapshot in saved quote. Show client in history and restore details when opening a copy; copies must not overwrite original quote/client. Whitespace normalizes to empty; invalid supplied data rejects saving clearly before writing or allocating a number. Treat phone as text, not a numeric value; render all user text safely. No client requirement for sale/internal/gift or pure calculation. Clearly keep browser-local demo storage disclosure.

S2 — Automatic local quote number.
User: "Que la guarde con un número."
Proposal accepted by user "si": "Número automático: COT-000001, COT-000002…"; assigned only on successful save, numbering local to this browser.
Check: assign next unique sequential COT-number to each successfully saved new record (including copies saved as new). Display number in saved confirmation/history and when opening a copy; unsaved drafts must not claim a committed number. Failed/invalid/conflicting saves do not add records, overwrite data or consume the next quote number. Existing records without number stay readable, unnumbered and otherwise unchanged. Prevent known stale-tab overwrite/duplicate numbering with changed-key detection and explicit reload error; never claim atomic multi-tab/server guarantees. Use one validated history write containing record+number; do not create a separately mutable counter key.

S3 — Preserve current behavior and layout.
User: "si"
Check: retain explicit-save-only, gift/internal no-sale semantics, optional blanks=zero, original reference7724.94/15449.88 and no quote inventory deduction. Old sale/internal/gift and legacy copies remain intact. New optional customer entry must not increase default compact calculator height beyond1280×800; all customer fields must remain reachable when expanded. Preserve stable Material behavior when expanding production costs. Historial remains a separate accessible tab. No automatic DB/auth/publication or rewriting old business records.

## Tasks

T1 | S1-S3 | route: delegated/context-backstop | status: done | commit: d98449e | Add customer snapshot and numbered explicit save, readable history/copies, best-effort stale-save rejection, UI/help/tests.
T2 | S1-S3 | route: independent verifier / Risk4 | status: done | commit: d98449e | Verify numbering success/failure/reload/stale-store invariants, client save/reopen/text safety and legacy/arithmetic preservation through public APIs/UI.
T3 | S1-S3 | route: inline | status: done | commit: d98449e; tracking checkpoint follows | Record proof, exact mirror, coherent local work-unit commit and final limitations.

## Log

L1 — Original user request, verbatim:
"Falta un campo donde pueda colocar datos del cliente cuando quiera guardar la cotización.Que la guarde con un número."

L2 — Accepted proposal:
Parent proposed optional Cliente o empresa/Teléfono/Correo and automatic COT-000001,COT-000002; number only on successful save, prior quotes unchanged, numbering browser-local. Asked if those details suffice or RUT/address needed; user answered "si". Accept recommended basic details and auto number only, not additional identity/address fields.

L3 — Existing state and boundaries:
Parent read history/store/app/form before proposal. Current record has randominternalid/date/title/form/input/result, no human number/client snapshot, no stale-history-key check. Baseline5ff3fb7; current branchfeat/print3d-management. Pre-existing parent visual changes: README.md,index.html,src/styles.css,tests/e2e/compact-calculator.pw.mjs,newadjustment-alignment.pw.mjs,newproduction-disclosure.pw.mjs. These visual changes already passed fullbrowser108/108 and Node57/57; preserve them without mixing unrelated parent changes into source work unit. Do not edit arithmetic/mapper/purchase/print/catalog modules. History helper can add optional fields and validation but may not migrate or relabel legacyrecords. Derive local number from highest valid saved number and persist atomically with new record in the same localStorage value; no counter side key. No record deletion/reversal feature. If config/destination uncertain, stop with specific evidence instead of inventing production numbering.

L4 — Verification constraints:
Tests first per S1/client and S2/number rule. Public isolated storage/browser only; assert exact error/output, byte/write/ID/clock/counter effects on rejection. Include success1/2,reload/legacycoexistence,writefailure without numbergap,invalidclientdata,knownstale-storeconflict,changedclientcopy as new without overwriting original. Browser public explicit save/history/open/customer blank acceptance; no HTML injection. Full browser suite workers1 on free127.0.0.1:5210 via a real temporary config with absolute testDir and explicit project cwd; no process substitution configs, user5173preview untouched. Preserve failed/time-out evidence and no automatic retry after timeout. Tempconfig outside tree under task-owned scratch; no unrequested repository config files or outside cleanup. No dependencies or publishing. Production multiuser numbering awaits real database, not this demo feature.

L5 — Implementation and observed self-verification:
Worker mvhlmvod-d-kqp2 implemented normalized optional client snapshots and canonical local numbers in single history writes, stale-key conflict rejection, client/history/copy UI and public tests/docs. RED6Nodefailures -> GREENfocused6/6/full63/63. Isolatedbase5ff3fb7 public reference/legacy evaluations matched stdout/stderr/exit. Initial fullbrowser89passed27failed; corrected run116/116 passed before final legacy-copy test addition. Final focusedbrowser12/12 across fourprojects includes the added legacy-copy reset test; no later fullsuite with that added case claimed. Observed saveCOT-000001, editedcopyCOT-000002 with oldrecordunchanged. Parent read store/clientvalidator/app/tests; npm63/63,diffcheck0. Risk4 assess requires independent verification; native diff unassessable due untracked newfiles,RDDoff. Existing parent visual edits preserved; no source commit/publication yet. Stale detection remains best-effort, not atomic DB numbering.

L6 — Independent approval and local delivery:
Verifier mvhlyt0p-e-ru0i returned S1/S2/S3 met, no blockers: isolated Node12/12 exit0; Chromium feature3/3 exit0 and own public-browserflow1/1 exit0; independent publicAPI OWN_PASS exit0 checked baseline5ff3fb7 comparisons, failedwrite recovery, invalidclient/rejected-save hashes/write/ID/clock effects, staleconflict and duplicate/malformed numbered history. Observed trimmed Acme & Co/+56 9 9999 9999/office@example.cl afterreload/copy; changedcopy preserved original. COT-000001 thenCOT-000002, legacyunnumbered unchanged. Newdraft noquote write/defaultheight<=800, expandedclientfieldsreachable and no purchasewrite. Singlekeywrite only and best-effort detection, not production atomicity. No final fullbrowser run claimed after addedlegacycase; priorfull116 and finalfocused12/12 retained. No build/typecheck or physicaldevice proof.
Parent reviewed store/validator/app/tests and passed Node63/63/diffcheck0. Committed coherent Risk item4 localunitd98449e (8files318insertions11deletions). Partial staging excluded prior visualspacing,Materialcolumnwrapper/production-onlyscroll,multiplieralignment and their regressiontests; those remain in workingtree, no changes lost. Optional duplicate independent probe not imported; no outside scratch access/cleanup. Fullfeaturemirror refreshed and structural/checkpoint evidence follows. No push/PR/merge/release. Current customer/numbering data remains browser-local demo.
