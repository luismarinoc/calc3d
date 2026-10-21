# Printer power profiles and readable quote totals
Objective: choose estimated printer power from a list and make the result panel easier to scan, without changing calculation formulas or historical quotes.
Branch: feat/print3d-management. Risk: item 3 (shared initialization, result rendering and copy reopening). One coupled calculator UI work unit; local commits only, no publication.

## Specs

S1 — Printer/power list.
User: "el tema de potencia deberia tomar de una lista"
Reference screenshot: Bambu Lab A1 (95 W), Bambu Lab A1 Mini (45 W), Bambu Lab P1P (80 W), Bambu Lab P1S (100 W), Bambu Lab X1 Carbon (120 W), Bambu Lab P2S (130 W), Bambu Lab H2S (210 W).
Check: printer selector fills its estimated power; retain Otro / personalizado for a non-listed/manual power. Label these as user-provided profile estimates, not verified measured/peak manufacturer consumption. New ordinary draft defaults to P2S130W (accepted reference example), rather than unexplained145W. Manual watt edits remain possible and clearly switch to custom, preventing selectedmodel/power disagreement. Remember chosen model in a new saved form snapshot; old records without model reopen with their exact stored W/custom selection. New records must preserve stored W if a profile later disagrees; never rewrite history or silently recalculate original snapshots.

S2 — Readable result amounts.
User: "Necesito que el resultado o el valor de los montos cambie o se vea mejor. Te doy una referencia."
Reference image: dark result card with ordered cost breakdown, separated total cost and a large highlighted final sale amount.
Check: improve hierarchy/contrast/spacing of cost rows, total cost and final sale amount; use a clear prominent final-total box inspired by reference rather than making all amounts equally small. Internal/gift show their expense clearly, never a fictitious charge/profit. Preserve existing amounts/CLP formatting and accessible result labels when possible. This is visual, not authorization to introduce Mercado Libre pricing, +30% supply markup, tax or new formulas; those screenshot policies are unproven. Do not copy marketplace-price panel without an agreed calculation rule.

S3 — Preserve compact layout and business behavior.
User: "el tema de potencia deberia tomar de una lista" / "Necesito que el resultado o el valor de los montos cambie o se vea mejor. Te doy una referencia."
Check: default compact1280×800 remains without main-document scroll, primary controls/result/Save readable with44px controls; phone/iPad have no horizontal overflow and all controls reachable. Production extras still do not move/resize Material. Reference22000/1000g,294g,11h,130W,tariff230,replacement220000/4320,error5%,×2 remains7724.94cost/15449.88sale. Preserve customer data/local COT numbers, optionalblank=zero, sale/internal/gift, discounts/surcharges/floor, tabs and old-copy arithmetic. No new records or stock changes on preview/model selection.

## Tasks

T1 | S1-S3 | route: delegated/context-backstop | status: done | commit: e0ece34 | Add model catalog/selection/manual fallback and stronger results hierarchy together against shared viewport budget; tests/docs alongside UI.
T2 | S1-S3 | route: independent verifier / Risk3 | status: done | commit: e0ece34 | Verify profiles/manual/old-new copy W, exact reference values, result hierarchy/bounds, compactness and unchanged client/number/history/stock.
T3 | S1-S3 | route: inline | status: done | commit: e0ece34; tracking checkpoint follows | Record evidence, exact mirror and coherent local commit, retaining unrelated visual changes separately; no publication.

## Log

L1 — User printer request, verbatim:
"el tema de potencia deberia tomar de una lista"
User supplied pi-clipboard-9c62e5b6-3238-4cd0-a10d-3d9f59a92633.png. Values in S1 are profile values from that image, not independently verified manufacturer specifications.

L2 — User result request, verbatim:
"Necesito que el resultado o el valor de los montos cambie o se vea mejor. Te doy una referencia."
User supplied pi-clipboard-a09dbed4-448b-4132-b68e-3dd895c56d80.png. Parent clarified design-only, no formula changes. Reference has red final-price panel; retain dark app identity and use strong readable total emphasis. Marketplace/+30% supply calculations remain outside this scope.

L3 — Existing state and coupled scope:
Baseline6e4c40e after closing customer/quote-number feature (sourced98449e). Pre-existing verified parent visual changes remain unstaged in README.md,index.html,src/styles.css,tests/e2e/compact-calculator.pw.mjs plus newalignment/disclosure tests. Preserve all of them; do not revert or fold unrelated changes into this unit. Source power currently manual145W, with no model list. Saved forms clone arbitrary form fields; new model metadata can be additive without mapper/history schema edits. App initialization/open-copy/result row rendering are shared. Both requested changes consume the same Production/result viewport and edit the same app/index/styles surfaces, so use one bounded coupled writer, not overlapping parallel writers.

L4 — Verification boundaries:
Test-first profile and result-presentation rules via public UI/pure catalog API. Cover all supplied profiles, explicit manual override/custom, saved-newmodel reload/copy and oldcopy withoutmodel preserving arbitrary W. Assert draft/model switching writes no stored records or inventory. Check gift/internal no-sale presentation and accessible final-total amount, default1280×800 bounds, touch/no-horizontal-overflow, stableMaterial with extras. Reference7724.94/15449.88 through visible form; keep legacy and modern public calculate/evaluate outputs identical for unchanged inputs. Full Node/browser suite once after focused GREEN, with real temporary config in task-owned scratch, explicit project cwd/absolute testDir/imports, isolatedfree5212/workers1 and absolute local browsercache. No processsubstitution config, no user5173 interruption, no automatic retry after timeout or outside scratch cleanup. Keep readability near400authoredlines; report honest overage instead of codegolf. No dependencies or publishing.

L5 — Implementation delivered, browser proof pending:
Worker mvhm9778-f-95t5 implemented immutable estimated profile catalog, newdraftP2S130W, manualcustom fallback, oldcopy storedW preservation, semantic cost/sale/expense result classes, new tests/docs. Node RED missing profilemodule then focused1/1/full64/64 and diffcheck0. Browser RED/focused/full and differential were not run by worker because it treated temporary config as unavailable; do not invent that proof. Parent read module/app/browser tests, reran Node64/64/diffcheck0, confirmed no arithmetic/mapper/store diff, and launched job-14 focused+full browser with real scratch config, explicit project cwd, isolated5212/workers1. Risk3 assess requires independent review after self-proof. No extra repo config or userpreview interruption. Source uncommitted/unpublished; prior parent visual edits retained.

L6 — Browser verification passed:
Parent job-14 exit0: focused profiles/results12/12 and fullbrowser132/132 (full56.0s), real task-owned scratch config, isolated5212,explicit project cwd,workers1. Parent inspected desktop result-hierarchy.png: profileP2S130W, lifetime/error visible, referencecost7724.94/final15449.88 with large red final-amount box; all primary controls/result/Save within1280×800. No arithmetic/mapper/store diff and Node64/64 retained. Browser RED was not captured before implementation; this is final functional proof, not invented earlier RED. Independent final-code Risk3 verification next; no source commit/publication yet.

L7 — Independent approval and local delivery:
Verifier mvhmez4g-g-20a9 returned S1/S2/S3 met, no blocker. Isolated candidateNode7/7 exit0,baseline6e4c40e reference/quote6/6 exit0; Chromium supplied3/3 exit0 and independentunknownmodel/storagereset/geometryprobe1/1 exit0. All seven estimatedprofiles, defaultP2S130W, manual177Wcustom, savedmodel and old/disagreeing/unknowncopy storedW passed with quote/purchase/print bytes unchanged; reloadfresh130P2S. Reference7724.94/15449.88 and gift/internal expense/no sale/profit rows passed; measured sale22px onrgb149,61,56. Material stable on productionexpansion and1280×800bounds passed. Business module SHA256 hashes unchanged; full132/132 not independently rerun. BrowserREDmissing remains documented, not fabricated. No build/typecheck or physicaldevice proof.
Parent reviewed module/app/tests and desktop screenshot, Node64/64/diffcheck0. Committed coherent local Risk item3 unite0ece34 (7files175insertions19deletions). Partialstaging included only profile/result feature changes, leaving parent spacing,Materialwrapper/production-onlyscroll,alignment and theirregressions uncommitted in workingtree. No data/visual edits lost. Existing committed tests coverS1-S3; optional duplicate independentprobe not imported, outside scratch not read/deleted. Full mirror/structuralcheck and finaltracking checkpoint follow. No push/PR/merge/release. Potencies remain user-supplied estimates, not hardware measurements.
