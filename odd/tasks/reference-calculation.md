# Reference calculator alignment
Objective: reproduce the user's accepted calculation example in the web calculator, without changing historical records or the existing print-cost API.
Branch: feat/print3d-management. One calculation/UI work unit; local commits only, no publication. Risk: item 3 (shared quote mapper and consumers).

## Specs

S1 — Reference parity.
User: "este calculo esta ok, esta es mal" / "valida que los caulcolo esten como lo que te pase" / "mas que pruebaa valida que calculo de igual" / "ajusta"
Check: with filament 22000 CLP/1000 g, consumption 294 g, 11 hours, 0 minutes, 130 W, tariff 230 CLP/kWh, replacement expense 220000 CLP amortized over 4320 hours, 5% error allowance and ×2 sale multiplier, display material 6468.00, electricity 328.90, wear 560.19, allowance 367.85, cost 7724.94 and sale 15449.88. Keep precision in intermediate arithmetic; round monetary outputs for presentation to two decimals, not integer components before summing. Allowance is 5% of material+electricity+wear in this example. The reference screenshot has zero extra supplies; do not invent a nonzero supply markup or platform commission policy.

S2 — Multipliers.
User: "x2 es el margen de ganacia que quiero pero quiero varias obciones y que se puede personalizar"
Check: default ×2; reference presets ×2, ×2.5, ×3, ×3.5, ×4, ×5 and custom positive multiplier. Label as multiplier, not mathematical profit margin. Existing cost floor, simultaneous amount/percent discount/surcharge and internal-purpose zero-revenue rules remain applicable. The zero-extra reference example must match S1 exactly.

S3 — Compactness request retained, not part of this numeric correction.
User: "Necesito que page no sea tan alta"
Check: retain this request for later; this work unit does not redesign the page. Do not introduce new oversized explanatory sections.

## Tasks

T1 | S1,S2 | route: delegated/context-backstop | status: done | commit: 76d7ea1 | Add isolated reference arithmetic and wire explicit reference inputs/multiplier into calculator. Preserve legacy calculateQuote callers (especially validatePrint) and historical persisted snapshots. Tests/docs accompany behavior.
T2 | S1,S2 | route: independent verification / Risk3 | status: done | commit: 76d7ea1 | Check exact reference amounts through public function/form mapping and browser, prior quote/print contracts and unchanged saved bytes. Recheck only blockers if any.
T3 | S1-S3 | route: inline | status: done (S3 request retained, not implemented) | commit: 76d7ea1; final tracking checkpoint follows | Record observed results, synchronize mirror, commit coherent local work unit and report numeric parity plus any missing proof.

## Log

L1 — User correction request, verbatim:
"ajusta"

L2 — Context and observed mismatch:
User's earlier requests: "analiza y  ajusta", "Necesito que page no sea tan alta", "x2 es el margen de ganacia que quiero pero quiero varias obciones y que se puede personalizar", "mas que pruebaa valida que calculo de igual". First screenshot is accepted reference; current screenshot is not. Parent read-only public calculateQuote probe with equivalent material/time/wear/×2 returned cost7357 and sale14714; reference raw sum×1.05 yields cost7724.94 and sale15449.88. Missing automatic allowance and early component integer rounding explain mismatch. Earlier current screenshot also had different user inputs220000CLP/1g/290g/35%; do not use those for parity acceptance.

L3 — Scope/preservation:
Existing createDemoHistory stores detached quote input/result/form snapshots; never rewrite existing stored records or migrations. Print store revalidates persisted costs with calculateQuote: its legacy integer algorithm MUST remain unchanged for omitted reference-mode inputs. Prefer additive reference module/path; never globally change safeCLP or legacy calculateQuote default behavior. Current inventory, purchases, consumption, family charging, DB/auth, platform pricing and nonzero extra-supply +30% semantics are outside this bounded fix. Preserve explicit-save-only and no quote stock deduction. Existing quote adjustment rules must still hold in the new path. Old form copies must not silently inherit new reference defaults when reopened; identify legacy/reference forms explicitly and preserve old saved arithmetic.

L4 — Layout-check incident, not parity proof:
Earlier standalone compact-layout browser attempt timed out waiting for #title because temporary Playwright config served its scratch directory (webServer.cwd omitted). No layout source changed. Do not retry that timed-out layout task; it is dropped from this work unit. For this newly authorized numeric behavior, any fresh temporary browser config must explicitly set webServer.cwd to the project root, with a free isolated localhost port, so it cannot interrupt the user's5173 preview. No browser pass claimed yet. Parent-owned obsolete untracked compact-layout test will be removed.

L5 — Implementation and parent correction evidence:
Worker mvhen26j-3-4jtp added isolated reference-costs.mjs, explicit mapper route, reference expenses/multipliers, decimal rendering and legacy-copy handling plus tests/docs. RED missing module; focused4/4/full52/52 and five public legacy evaluate differential cases passed. Browser initial focused0/4 and full64pass4fail: test used toBeDisabled on fieldset, despite disabled attribute. Parent corrected assertion to disabled attribute plus disabled discount/surcharge controls. Job-2 exit0: focused4/4/full68/68 using isolated5198 and explicit project cwd, without interrupting user preview. Save/reload and legacy snapshots passed through public UI. No physical-device proof.
Parent public calculateReferenceQuote asserted exact cost7724.94/sale15449.88, npm52/52/diffcheck0. Parent then found internal API positive percentages accepted at zero base and tiny positive amounts rounded tozero; regression RED1pass1fail exit1. Matched legacy raw-value internal adjustment guard: GREEN focused5/5/full53/53/diffcheck0. Browser68/68 preceded this isolated API guard change; UI already omits internal adjustments. Risk3 assess returned independentVerifier=true, native diff unassessable due untracked source, RDD off. Independent final-code review is next. No source commit/push/PR/merge yet.

L6 — Independent finding, correction and bounded resolution:
Verifier mvheutvb-4-hf5k confirmed S1 exact parity, S2 presets/custom/adjustments/floor, focused5/5 and combined legacy/reference/print23/23; five baseline726e318 evaluate cases matched and rejected save preserved byte hash. One S2 blocker: reference internal mapper ignored explicit positive discount/surcharge. Legacy-only depreciation is deliberate mode semantics, not a final finding. Parent mapper regression RED3pass1fail exit1, then parsed internal adjustment numbers only for reference mode and rejected nonzero values without altering legacy stale-field behavior. GREEN focused6/6/full54/54/diffcheck0.
Bounded recheck mvhexlyr-5-02zv resolved S2: focused6/6 exit0; independent public probe exit0 confirms discount100,surcharge1,tiny0.001 exact error/null input/result, unchanged bytes and zero write/ID/clock calls; zero/omitted values preserve internal7724.94 and zero price/profit; legacy stale fields unchanged; S1 sale7724.94/15449.88 retained. No browser/full-suite rerun in recheck. Earlier browser68/68 covers UI save/reload/legacy isolation; final raw API/mapper guard changes are covered by Node and independent probes. Physical devices not tested.

L7 — Delivery evidence and remaining scope:
Committed coherent local Risk item3 work unit76d7ea1 (371insertions23deletions,10files), preserving legacy costs/print/purchase/history stores unchanged. Parent staged diff-check exit0. No push/PR/merge/release. The accepted zero-extra reference example now matches exactly; default×2, presets and custom work. The page compactness request S3 remains explicitly deferred, not complete. Nonzero supply+30%/marketplace pricing and production integration remain outside this correction. Final tracking checkpoint records outcome and mirror; no additional tests are invented for bookkeeping.
