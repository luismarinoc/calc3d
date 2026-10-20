# 3D printing management: scope and implementation roadmap
Objective: manage printing costs, quotations, purchases, inventory and monthly performance in Chile. Status: T2a pure cost estimator verified; T2b prototype interface and browser-local demo saving verified with Node and emulated desktop/phone/tablet browser tests. Physical device proof pending. Full continuity mirror maintained under odd/print3d-management/tasks. Purchases, inventory, authentication and database not implemented.
Branch: feat/print3d-management (`git init -b feat/print3d-management` succeeded after a prior writer launch failed because Git was absent); work-unit commits recorded below. Delivery: auto-chain; chain_strategy=feature-branch-chain (user selected). Forecast exceeds 400 authored lines; review coherent slices on the project branch, no publication authorized. Initial test runner: Node built-in `node --test`.

## Specs

S1 — Cost calculator and quotations.
User: "Necesito crear una calculadora moderna tipo web donde yo pueda sacar los costos de mi impresión 3D." / "Lo necesito para saber el costo de la impresión y también para poder cotizar. Y también necesito llevar un historial de todo."
Check: calculate printing costs separately from sale price; explicitly saved quotations are retrievable. Reference image: screenshot discussed in this conversation; external temporary image path is not durable project storage.

S2 — Explicit saving and existing database.
User: "la idea es que yo tenga la potestad de decidir qué guardo y qué no guardo. Ojalá sea una base de datos., el pais es chile" / "yo tengo una base datos , pero despues te paso los datos cuando ya esta ok todo"
Check: experimenting with inputs creates no business record; explicit save creates one. Configure Chile/CLP. Prepare with clearly labelled test data first; integrate the user's database later. Its engine, hosting, schema and credentials are unknown. Do not claim test data is durable production storage.

S3 — Purchases, suppliers, inventory and consumption.
User: "Necesito tener una opción donde yo pueda tener un historial de compra sobre los insumos de la impresión 3D.Con fecha y todo. Lugar, dirección, teléfono." / "la idea es que yo hago compra, yo voy gastando, y todo lo que imprima, yo lo voy a registrar como tal, y así voy viendo cómo se va consumiendo mi inventario."
Check: saved purchases include date, supplier/place, address, phone, supplies, quantities and prices; purchases add inventory and registered printing consumption subtracts it. Retain dated movement history. Quotations alone never consume inventory. Confirmed granularity: track individual spools, each with its own acquisition cost and remaining grams. Charge actual consumption against the selected spool; do not infer a separate inventory valuation policy.

S4 — Administrator and configurable user permissions.
User: "necesito que maneje perfil: uno que sea administrador y el otro que sea usuario y que no tenga opción de ciertas cosas, por ejemplo, inventario, compras, sino que solo pueda hacer la cotización o que yo tenga la potestad de asignarle lo que pueda hacer."
Check: administrator assigns allowed actions; restricted users cannot access unauthorized data/actions through either the interface or server. Identity must accompany saved business movements. Authentication mechanism remains undecided.

S5 — Cost visibility and simultaneous adjustments.
User: "Sí, no hay problema que el usuario pueda ver el costo. También me gustaría tener un campo donde pueda poner un descuento o un recargo a nivel de monto y de porcentaje." / "Sí, elegir descuento y recargo por cotización, ambas al mismo tiempo."
Check: permitted quoting users see cost. Discount and surcharge can coexist, each as a fixed CLP amount or percentage. Both percentage adjustments use the sale price before either adjustment, not a sequential compounded base.

S6 — Cost floor.
User: "el descuento tiene que ser basado o el recargo basado a ese total" / "El total o la suma de todo lo que esté relacionado al costo, cuando yo haga el descuento, no puede ser menor a eso."
Check: final sale price = base sale price - discount + surcharge; reject saving/issuing a sale below total configured cost and explain the shortfall. Equality to cost is allowed. Adding a production expense changes cost; a commercial surcharge changes revenue, not cost. Internal/free work is not a sale and must not be forced to show fictitious revenue.

S7 — Responsive and intuitive experience.
User: "Necesito que esta aplicación funcione perfectamente, tanto en un computador como en un teléfono y tablet (IPAD)" / "Necesito que sea bastante amigable para el usuario.Las opciones sean intuitivas."
Check: usable desktop, phone and iPad layouts, portrait/landscape, touch controls, visible labels, meaningful validation and no hover-only actions. Verify actual supported browsers/devices where available; explicitly report untested devices rather than promise perfection.

S8 — Purpose of work and internal costs.
User: "que se pueda saber que es una cotización para un familiar o para uso interno" / "si una cotización yo la hice para mí, igual tiene que calcular el costo, pero cero de ganancia"
Check: distinguish sales from internal/personal and family/gift work. Internal work retains actual cost without sale revenue or commercial profit; show its expense separately in results. Family work must not automatically imply free work; allow the intended charge to be specified. Production consumption still applies to non-sale work.

S9 — Images and URLs only.
User: "cada cotización tenga la opción de adicionar link, fotos, URL" / "poder decir cuál es la foto del producto impreso" / "solo voy a guardar imágenes y URL. No voy a guardar proyectos ni nada por el estilo por ahora."
Check: attach images and named URLs to a quotation, distinguish reference/result photos, select a main image for history recognition. No model/project uploads, STL/3MF/OBJ storage, 3D viewer or slicer imports in this scope. A saved URL does not archive its remote content. File storage and size/format policy await architecture selection.

S10 — Monthly performance, profit/loss and internal consumption.
User: "tener informes que me ayuden a saber cuánto he ganado y cuánto he perdido" / "poder saber cuánto ha sido mi rendimiento por mes. También tener el cálculo de los costos que me he consumido yo internamente."
Check: report sales and associated costs, estimated commercial profit/loss, internal consumption and other non-sale production separately. Purchases/cash payments are not the same as consumed inventory or production costs; never count both as the same expense. Unexecuted quotations do not establish real consumption or revenue. This is management reporting, not formal accounting. Define reporting date/payment rules before implementation.

S11 — Durable project continuity.
User: "Que de una u otra manera esté guardado todo este alcance de este proyecto, de manera que si me salgo o apago el computador, no pierdas el norte o las actividades y tareas que tienes que hacer."
Check: this document contains requirements, implementation roadmap, unresolved decisions, evidence and original user requests; full recovery copy in project Engram topic odd/print3d-management/tasks. Synchronize after meaningful scope/task changes; no task is complete without observed evidence.

S12 — On-demand work plan with truthful status.
User: "La idea de lo último que te pedí es que cuando yo te diga otra vez \"dame el plan de trabajo\", me lo des y que me digas qué está hecho y qué no está hecho, como una tabla."
Check: when asked "dame el plan de trabajo", read and reconcile this document with implementation evidence, then respond in Spanish with a table: tarea, estado, qué está hecho, qué falta. Distinguish documented, implemented, verified, pending and blocked; never treat planning as a built feature. Include blocker/next action where applicable.

## Tasks

T0 | S1-S12 | route: inline | status: done | commit: ea49d74 | Local continuity document preserved. Parent restores full current document to Engram observation 2696, topic odd/print3d-management/tasks, and reads it back. Historical child mirror discrepancies remain logged; use latest parent mirror.
T1 | S1-S10 | route: inline planning | status: pending | commit: none | Technical preparation complete: initial browser/preview/test stack and spool granularity recorded. Financial, reporting and permission decisions remain unresolved; do not mark this complete.
T2a | S1,S3,S5,S6,S8 | route: delegated/context backstop | status: done (verified) | commit: adf30f0 | Pure cost estimator, 9 public-interface tests and input/rounding documentation. RED: `node --test tests/costs.test.mjs` exit 1, ERR_MODULE_NOT_FOUND before implementation; first implementation run exit 1 (8/9, internal fixed-adjustment error); correction followed by focused GREEN exit 0 (9/9) and `npm test` exit 0 (9/9). S1 cost-only (saved quotes later T4), S3 spool cost-only (inventory later T6/T7), S5/S6 calculator behavior, S8 internal-only (family policy pending). Saved locally after the user selected chained delivery.
T2b | S1,S2,S5,S6,S7,S8 | route: delegated/context backstop | status: done (prototype verified in emulated browsers) | commit: 6279bf9 | Spanish/CLP prototype, live costs and explicit browser-local demo history/reopen verified: `npm run test:e2e` exit 0, 20/20 on Chromium desktop and WebKit emulated phone/iPad portrait/landscape; `npm test` exit 0, 15/15. Real touch/iPad/Safari remains unverified. S1/S2 prototype only: no production database/auth; family policy unresolved. Independent verification passed; see L30.
T2c | S2,S7 | route: independent gentle-ai-verify / Risk item 5 | status: done | commit: e5fd2b2 | Authorized Playwright devDependency and project-local Chromium/WebKit installed (job-2 exit 0). Writer E2E 20/20 and Node 15/15; parent Node spot check 15/15 and screenshot review; independent verifier Node 15/15 and WebKit phone live-demo 1/1 in isolated copy. No production/physical-device claim. See L29-L30.
T3 | S2,S4 | route: re-evaluate at start | status: blocked | commit: none | Implement real authentication and administrator-assigned permissions only after identity, access ownership and server/database decisions; independent security verification required. Prototype UI is not an authorization boundary.
T4 | S1,S2,S5,S6,S8 | route: re-evaluate at start | status: pending | commit: none | Implement explicitly saved quotations, purposes, simultaneous adjustments, cost floor and history.
T5 | S2,S9 | route: re-evaluate at start | status: pending | commit: none | Add image attachments, main product image and URL references, with protected access and upload validation.
T6 | S2,S3 | route: re-evaluate at start | status: pending | commit: none | Implement supplier/purchase history and traceable inventory entries/adjustments; atomic changes and independent verification required.
T7 | S3,S8 | route: re-evaluate at start | status: pending | commit: none | Register actual printing consumption, including non-sale work and failed prints; prevent duplicate inventory deductions.
T8 | S3,S8,S10 | route: re-evaluate at start | status: pending | commit: none | Implement monthly performance reports with non-sale costs and no double-counting; test losses as well as gains.
T9 | S2,S4,S9 | route: re-evaluate at start | status: blocked | commit: none | Integrate existing database and durable media storage; waits for user-provided database engine, connection setup and integration authorization once the test version is ready. Never commit credentials.
T10 | S1-S10 | route: re-evaluate at start | status: pending | commit: none | Verify end-to-end workflows, responsive layouts, permissions and recovery; report all missing proof and document operation.

## Log

L1 — Original request, verbatim:
"Necesito crear una calculadora moderna tipo web donde yo pueda sacar los costos de mi impresión 3D./var/folders/8m/r2yz6vdj28n5b7vv7c7j11080000gn/T/gp5ApoE8/pi-clipboard-e840109a-ab53-451a-b251-8a40006dacdd.png Te anexo una imagen para que veas cómo más o menos la quiero. Esta imagen es de referencia. Analízala y dame un plan, y dime qué pudiéramos mejorar."

L2 — User clarification, verbatim:
"¿la querés principalmente para conocer tu costo de impresión o para cotizar y vender a clientes? Lo necesito para saber el costo de la impresión y también para poder cotizar. Y también necesito llevar un historial de todo."

L3 — User clarification, verbatim:
"Sí, la idea es que yo tenga la potestad de decidir qué guardo y qué no guardo. Ojalá sea una base de datos., el pais es chile"

L4 — User clarification, verbatim:
"yo tengo una base datos , pero despues te paso los datos cuando ya esta ok todo"

L5 — User authorization and scope expansion, verbatim:
"si, Recuerda que es una impresión 3D.Necesito tener una opción donde yo pueda tener un historial de compra sobre los insumos de la impresión 3D.Con fecha y todo. Lugar, dirección, teléfono.Y es un análisis cómo yo pudiera llevar el consumo de lo que yo voy comprando, y así poder llevar fin de mes cuánto me he gastado. No sé si me entiendes, ayúdame a analizar eso. Pues la idea es que yo hago compra, yo voy gastando, y todo lo que imprima, yo lo voy a registrar como tal, y así voy viendo cómo se va consumiendo mi inventario."

L6 — User scope expansion, verbatim:
"Adicional a eso, necesito que maneje perfil: uno que sea administrador y el otro que sea usuario y que no tenga opción de ciertas cosas, por ejemplo, inventario, compras, sino que solo pueda hacer la cotización o que yo tenga la potestad de asignarle lo que pueda hacer."

L7 — User clarification, verbatim:
"Sí, no hay problema que el usuario pueda ver el costo. También me gustaría tener un campo donde pueda poner un descuento o un recargo a nivel de monto y de porcentaje."

L8 — User clarification, verbatim:
"Necesito que esta aplicación funcione perfectamente, tanto en un computador como en un teléfono y tablet (IPAD),Sí, elegir descuento y recargo por cotización, ambas al mismo tiempo. Necesito que sea bastante amigable para el usuario.Las opciones sean intuitivas."

L9 — User correction, verbatim:
"No entendí muy bien la pregunta, pero cuando tú haces el cálculo, tomando en cuenta los costos, todos los datos para llegar a un precio de venta, el descuento tiene que ser basado o el recargo basado a ese total, ¿sí? Y no puede ser menor al costo. Hay campos que aumentan el costo, ¿cierto? El total o la suma de todo lo que esté relacionado al costo, cuando yo haga el descuento, no puede ser menor a eso.Dime si se entendió."

L10 — User scope expansion, verbatim:
"Necesito que las cotizaciones tengan algo, no sé si se dice tipo de cotización, dime tú cuál sería lo mejor, pero que se pueda saber que es una cotización para un familiar o para uso interno, no sé cuál es el nombre, ayúdame con eso. Pero la idea es que sea que no lo estoy vendiendo a un público, ¿me entiendes? De manera que cuando yo saque mis informes, yo pueda saber cuánto ha sido los gastos de mis ventas y cuánto ha sido los gastos que no he vendido nada y cuánto ha sido de mi ganancia. ¿Qué quiere decir? Que si una cotización yo la hice para mí, igual tiene que calcular el costo, pero cero de ganancia, ¿se entiende?"

L11 — User scope expansion, verbatim:
"Necesito también que cada cotización tenga la opción de adicionar link, fotos, URL. No sé si me entiendes. La idea es poder almacenar la foto, URL, poder almacenar objetos.Y dentro de esas opciones, poder decir cuál es la foto del producto impreso, para yo recordar que esa cotización se sacó tal foto o el producto. ¿Me entiendes?"

L12 — User reporting clarification, verbatim:
"Adiciono que tengo que tener informes que me ayuden a saber cuánto he ganado y cuánto he perdido. Yo sé que esto no es un sistema de contabilidad, pero poder saber cuánto ha sido mi rendimiento por mes. También tener el cálculo de los costos que me he consumido yo internamente."

L13 — User attachment correction, verbatim:
"No te respondí la pregunta anterior. No voy a guardar, solo voy a guardar imágenes y URL. No voy a guardar proyectos ni nada por el estilo por ahora."

L14 — User request, verbatim:
"Listo, dime entonces qué es lo que piensas construir. Dame el resumen."

L15 — User continuity request, verbatim:
"¿Qué necesito? Que de una u otra manera esté guardado todo este alcance de este proyecto, de manera que si me salgo o apago el computador, no pierdas el norte o las actividades y tareas que tienes que hacer. ¿Se entiende?"

L15a — User continuity refinement, verbatim:
"La idea de lo último que te pedí es que cuando yo te diga otra vez \"dame el plan de trabajo\", me lo des y que me digas qué está hecho y qué no está hecho, como una tabla."

L16 — Initial state and boundaries:
Only project metadata directory .atl/ existed at initial inspection. At the start of T2a there was no source, database connection, test runner, authentication, inventory logic or functional UI. T1 remains pending unresolved financial/reporting/permission decisions; T3 and T9 remain blocked. No push, release or PR is authorized. Preserve human files and existing data.

L17 — Open decisions / proposals, not silently accepted requirements:
- Individual spool tracking, per-spool acquisition cost and remaining grams are confirmed; consumption uses the actual selected spool. Initial stock and reconciliation rules are open. Do not select an additional inventory valuation policy.
- Database engine/hosting and authentication integration. Never request production secrets in a committed document. Media storage/backup and authorized access must be designed with the database.
- Reporting dates: production versus sale/collection dates; partial payments, refunds and cancellations are not specified. Internal costs affect management results but are not fictitious sales losses.
- Determine exact cost components, tax treatment and rounding rules; calculator labels markup, not margin. Chile does not by itself establish VAT applicability. Do not add VAT or channel logic without authorization. Shipping and channel fees require explicit bases. Confirm the commercial sale-floor rule for a partially charged family job before implementing that path.
- Proposed in conversation, not independently confirmed: PDF export, quotation state names, main-history thumbnail, supplier reuse, month comparison and export, failed-print categories, manual adjustment reasons. Preserve as proposals until resolved where consequential.
- Confirm ownership/access boundaries for other users' quotations and scope of their administrative permissions.
- Scope excludes accounting, 3D file/project storage and automatic slicer import. No inventory or sales feature may infer actual activity from an unsaved calculation.

L18 — Resume procedure:
1. Read this file in full and reconcile it with the existing code and project memory before changing anything.
2. In Engram: mem_context, project-scoped mem_search for odd/print3d-management/tasks, then mem_get_observation for the full recovery document. Do not choose a different project's latest memory.
3. Resolve discrepancies without overwriting surviving evidence. Review T1/open decisions before implementing dependent behavior.
4. For active implementation, project the relevant tasks to todo, mark exactly one in progress and record tests/commits only after observing them. Preserve stable task/spec IDs.
5. After every material scope or task change, update this file with targeted edits and refresh its full Engram mirror. Parent must paste actual full contents and read back; never replace with a summary. Future workers read Specs and Tasks before Log; verifiers read the whole document. Preserve historical mirror warnings as historical evidence, not current status.
6. T2b browser checks and independent tooling verification passed; real devices remain untested. User selected feature-branch-chain; initial work units are committed locally (L32), Risk item 5 tooling separate. Next: resolve family charging policy before T4, then build the next prototype unit; production DB/auth stay deferred until user supplies architecture details. Do not pretend future DB/auth/inventory/report tasks are done.

L19 — Prior documentation verification:
Structural Python check exited 0 at initial documentation: section order, S1-S12, T0-T10, original requests and recovery/table instructions present. No behavior tests or RED/GREEN applied to that passive documentation change. At the time no Git worktree existed; subsequently Git was initialized on feat/print3d-management with no commits. Local file and Engram mirror are continuity copies, not an off-device backup guarantee.

L20 — User latest authorization, verbatim:
"Listo, ya puedes empezar a trabajar."

L21 — Spool recommendation and user's answer, verbatim:
Recommendation: "Para el control de gastos que necesitás, recomiendo por bobina."
User answer: "si"
Decision: track each spool separately with its acquisition cost and remaining grams; account for actual consumption of the selected spool. No other inventory valuation method was accepted.

L22 — Initial implementation plan (technical decision, not a production promise):
Use a responsive browser application with native ES modules, HTML/CSS and no external dependencies. Keep pure domain calculations separate from UI and persistence adapters to permit future server-side validation and database integration. Use Node's built-in `node --test` for tests and Python's standard-library HTTP server bound to `127.0.0.1` for local preview only when later authorized. The initial browser-local, explicitly saved demonstration records are labelled test data, not durable production storage. There is no real authentication, authorization enforcement or database integration yet. Do not choose a future database engine or production authentication here. User-facing UI is Spanish for Chile/CLP.

L23 — Reversible scene/design assumption, not a new deliverable:
Initial scene: a workshop owner quoting on desktop and touch devices. Use a graphite-dark, reference-inspired interface with a restrained warm accent, high contrast and no decoration-heavy layout. Validate usability with real responsive checks later. PRODUCT.md and DESIGN.md are optional design context, not required files or new deliverables; this decision lives here.

L24 — T2a start: parent reconciled this entire document and full Engram observation 2696. Earlier writer launch failed before task creation because Git was absent; parent diagnosed the correct working directory, initialized Git with `git init -b feat/print3d-management`, and observed no commits. User authorized "Listo, ya puedes empezar a trabajar." and then asked "Review the delivered subagent output and continue." T1 remains pending later unresolved decisions, and no commit is authorized while delivery shape is undecided.

L27 — T2b evidence and pending proof: RED `node --test tests/ui*.test.mjs tests/demo*.test.mjs` exit 1, two ERR_MODULE_NOT_FOUND test loads before implementation; focused GREEN exit 0, 6/6; `npm test` exit 0, 15/15 including nine existing domain tests. Final rerun after adapter validation/style edits: focused exit 0, 6/6; full exit 0, 15/15. Browser automation discovery `find . -maxdepth 3 -type f` with browser-tool filename patterns found none; no visual/touch/real-browser verification. New source: index.html, src/app.mjs, src/ui/quote.mjs, src/data/demo.mjs, src/styles.css; new tests/ui.test.mjs and tests/demo.test.mjs; README and package.json updated. No source changes to costs.mjs; no Git HEAD for differential base; no commit. Authored code/tests/docs ~590 lines before CSS readability expansion, above advisory 400; retain whole behavior/tests/docs for review, delivery strategy parent-owned. S1/S2 demo-only, S5/S6/S8 UI behavior covered by Node tests, S7 responsive CSS structurally present but actual device proof outstanding; S11 mirror must be refreshed. Next: parent exact-document memory restore/readback and browser device interaction checks, then choose delivery strategy before commit.

L26 — T2b continuity and parent assessment: Parent independently ran `npm test` exit 0 (9/9) and inspected T2a module, tests and README and differential applicability; native candidate assessment unassessable with untracked worktree. Full local document was pasted into mem_save topic odd/print3d-management/tasks project calc3d (response ID 2696); child cannot read back memory. T1 moved pending, T2b is sole in-progress task; no commits. Mirror must be refreshed after this transition and final edits.

L25 — T2a evidence and boundaries: Added pure browser-compatible `calculateQuote(input)` in `src/domain/costs.mjs`, 9 tests in `tests/costs.test.mjs`, private Node test script and `README.md` input/default/rounding/error contract. RED before source: `node --test tests/costs.test.mjs` exit 1, stderr ERR_MODULE_NOT_FOUND, 0 passes/1 failed load; first implementation focused run exit 1, 8 passed/1 failed due internal fixed-adjustment error text. Corrected; focused GREEN `node --test tests/costs.test.mjs` exit 0, 9 passed/0 failed; full `npm test` exit 0, 9 passed/0 failed. Tests report stdout with 9 passing cases, no stderr on success. No pre-existing command or shared helper existed, so differential legacy comparison is inapplicable. No inventory is mutated or checked; no stored quotation, family payment policy, VAT, authentication or UI is implemented. Rounding of each component to integer CLP before summing is a reversible technical assumption; discount/surcharge round independently against the base and the floor compares final integer price with integer total cost. T2b is next; T1 unresolved and T3/T9 blocked. No commit. At this historical checkpoint memory upsert ID 2696 contained a summary; see later parent restoration in L28.

L28 — Parent review and continuity restoration:
Parent reviewed app wiring, form mapper and demo adapter; ran npm test and git diff --check: exit 0, 15 tests passed, 0 failed. Browser discovery found no chromium executable on PATH and no project-resolvable playwright, puppeteer or @playwright/test. No browser/device interaction proof is available; T2b is blocked awaiting the user's decision whether to enable browser tooling. Local HTTP smoke job-1 exited 0: /, /src/app.mjs, /src/styles.css, /src/domain/costs.mjs, /src/ui/quote.mjs and /src/data/demo.mjs returned 200 with nonempty bodies and expected MIME. Preview server stopped cleanly. Parent restores full current document to Engram and reads it back; no functional tests failed in this review. Prior assess returned writer self-verification, no independent verifier; native assess could not capture untracked files. No commits/publication. Risk: none for the reviewed prototype changes; new UI and validated explicit demo saves do not change existing domain behavior, inventory, security boundaries or production storage. Real authorization/database and images/reports/inventory remain unimplemented.

L29 — T2b browser verification, S1/S2/S5/S6/S7/S8 and S11 progress:
User consent verbatim: "si" to installing Playwright development dependency and downloading browsers. Parent's `npm install --save-dev @playwright/test && PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install chromium webkit` job-2 exited 0 after 22s; installed @playwright/test ^1.64.1 and Chromium1248/WebKit2370 in project-local `.cache/ms-playwright`. The parent added `.gitignore` exclusions for node_modules/, .cache/, test-results/, playwright-report/, .env and .env.* except example; these files are outside this worker's edits. Browser tests use Playwright's self-managed Python server, two workers, zero retries, four projects (Chromium desktop, WebKit emulated phone, WebKit emulated iPad portrait and landscape), isolated browser contexts and ignored `test-results/` screenshots. Scope: demo-only live results, simultaneous adjustments, exact CLP amounts, explicit snapshot/save/reload/reopen, rejected fields and floor equality, internal costs without revenue, corrupt storage and denied writes, controls/keyboard/no overflow and text rendering. No meaningful RED for pre-existing prototype behavior; first test uncovered an actual WebKit native select height of 22px despite CSS minimum 48px. First `npm run test:e2e` exit 1: 13 passed, 7 failed (three WebKit touch-height failures and four incorrect fieldset matcher failures; test log showed `<fieldset disabled>`). Corrected WebKit select appearance/chevron in `src/styles.css` and assert `disabled` attribute plus child input's effective state; `npm run test:e2e -- --grep 'live demo|internal purpose'` exit 0, 8/8. Full `npm run test:e2e` exit 0, 20/20, stderr only local Python HTTP access logs, no pageerror in interaction test; `npm test` exit 0, 15/15 Node tests, no test stderr. `git diff --check` exit 0 (untracked files are not checked by Git diff); `git status --short` showed no unignored tool cache or scratch path, and Git has no HEAD for differential prior-code run. Screenshot pairs `initial.png` and `result.png` are under `test-results/quote.pw.mjs-live-demo-exp-78f5a-s-and-keyboard-touch-layout-{chromium-desktop,webkit-phone,webkit-ipad-portrait,webkit-ipad-landscape}/`. These ignored screenshots can be read locally but are not committed. T2b done for prototype/browser emulation only; S1 quotations and S2 storage remain demo-limited, S5/S6 tested prototype arithmetic and floor, S7 checked browser emulation but not physical touch/actual iPad/Safari, S8 internal expense tested but family pricing unresolved. S11 local progress recorded here; mirror pending parent refresh of complete canonical document, not this summary. T1, T3 and T9 statuses unchanged. No commits. Next: parent restores full mirror and selects delivery strategy; later actual-device and production architecture checks remain.

L30 — Independent verification and parent review:
Independent gentle-ai-verify task mvh81a1x-5-pkug passed T2b prototype/tooling scope with no blockers. Its isolated copy ran npm test exit 0 (15 passed, 0 failed/skipped) and npm run test:e2e -- --project=webkit-phone --grep 'live demo' exit 0 (1 passed, 8.1s). Output combined stdout/stderr; no false split claimed, no retries/timeouts. It confirmed dev-only dependencies/lock, localhost binding, retries 0, ignored cache/results/env, honest emulation labels, and select correction. Parent also ran npm test exit 0 (15/15), reviewed desktop/phone screenshots and config/test source. Assessment escalation item 5 required this verifier; native capture remained unassessable because source is untracked. Physical iPad/touch/Safari remain untested, not blockers for the explicitly emulated prototype milestone. Optional proposed tooling.test.mjs was not written/run and is not required; do not add a new gate. Verifier used an external temporary scratch directory despite the parent's request for in-project scratch; parent did not access/delete it because outside-project cleanup lacks consent. Scratch path is in the verifier's message, not needed to run this project. No source correction or extra verification is warranted by this advisory. Risk: item 5 (development dependency and browser test environment), independently verified. Full local document and Engram mirror must reflect these results; delivery choice was open at this checkpoint. No publishing authorized.

L31 — Delivery choice:
User selected "Entregas encadenadas en una rama del proyecto (recomendado)" through ask_user_choice, token feature-branch-chain. Set delivery_strategy=auto-chain, chain_strategy=feature-branch-chain. Planned local commit slices: domain cost engine/tests/API docs; responsive prototype/demo-history/tests/docs; separate Risk item 5 browser tooling/dev dependency/tests/docs; tracking evidence. Preserve readability even if the cohesive UI slice exceeds the advisory 400 lines. No push, PR, main-branch integration or release authorized. Stage only each slice; never commit generated caches or credentials.

L32 — Local work-unit commit evidence:
Committed adf30f0: pure cost engine + 9 tests + API README, 252 authored insertions; Risk none. Committed 6279bf9: responsive calculator + explicit demo-history adapter + 6 tests + local preview/scripts/docs, 500 insertions/2 deletions; retained one coherent UI workflow rather than omit tests/minify solely to meet advisory 400; Risk none. Committed e5fd2b2: browser tests/config/Playwright devDependency/docs/ignore, 246 insertions/1 deletion (58 lockfile lines generated); Risk item 5 independently verified before commit. Committed ea49d74: scope and roadmap snapshot, 176 insertions. Tests/verification are the previously observed Node15/15 and browser20/20, parent Node15/15, independent Node15/15 + WebKit1/1; staging changed documentation/scripts by slice only, not tested source. Commits remain on feat/print3d-management; no remotes/push/PR/merge/release. Full application incomplete. Next focused product decision: whether family jobs may be partially paid below cost, distinct from free gifts and sales subject to floor. Do not invent this policy. Update progress evidence in a small docs commit and mirror this full document.
