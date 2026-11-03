# Shared spool catalog with personal changes
Branch: feat/shared-spool-catalog from main c67ab6c; local implementation/tests only, no remote publication, live database changes or deployment.
Delivery: auto-chain / feature-branch-chain (user-selected integration branch); Node, disposable PostgreSQL and four-project Playwright checks.

## Specs
1. S1 — Original report: "adicione un usuario nuevo y no ve las bobinas como si no hay datos".
2. S2 — User selected "Catálogo común y cambios personales (recomendado)": "Todos ven las bobinas base; editar precio u otros datos afecta solo a su cuenta."
3. S3 — Authorization question: "¿Autorizás implementar y probar localmente el catálogo común usando solo productos verificados del proveedor, sin compartir bobinas personales?" User selected "Sí, incluir referencias pendientes": "Compartir productos confirmados y referencias sin peso; estas últimas siguen sin poder cotizarse."
4. S4 — User selected "Los campos que permite el editor actual": "Nombre, material, marca, precio y peso, respetando las validaciones existentes."
5. S5 — User selected "Actualizar lo que no personalizó (recomendado)": "Conservar sus cambios; recibir las novedades en los demás campos."
6. S6 — User selected "Priorizar su bobina sin duplicarla (recomendado)": "Conservar sus datos e identidad; no mostrar otra fila del mismo producto verificado."
7. S7 — User selected "Cadena sobre una rama integradora": "Revisar cada unidad por separado y reunirlas antes de llevar el conjunto a main." The question explicitly said "Por ahora solo se implementa y prueba localmente; esto no autoriza publicar."

## Tasks
- T1 [done] S1–S3,S5–S6 — Curate owner-free verified supplier seed and effective-catalog/identity contract with tests; route: gentle-ai-worker (context backstop); commit: this work unit (record exact SHA after commit).
- T2 [pending] S1–S6 — Add shared-base/private-override schema, validated CAS RPC and base quote authorization with real isolated SQL tests; route: gentle-ai-worker (context backstop); Risk: item 2 (new admission/RLS/RPC boundaries); commit: pending.
- T3 [pending] S1–S6 — Integrate complete guarded repository reads, composition and base identities into existing quote/catalog paths; route: gentle-ai-worker (context backstop); commit: pending.
- T4 [pending] S1–S6 — Integrate personal editor, consultation and deduplication, update docs and public browser fixtures/tests; route: gentle-ai-worker (context backstop); commit: pending.
- T5 [pending] S1–S7 — Run final checks, one independent risk-gated verification, parent spotcheck and close local reviewable chain; route: gentle-ai-verify plus parent; commit: pending.

## Log
- L1 User: "adicione un usuario nuevo y no ve las bobinas como si no hay datos".
- L2 Confirmed source behavior: spool profiles and pending references are filtered by owner_id in src/data/supabase.mjs and protected by owner-only RLS. Admission does not create catalog data. Existing account-switch browser tests expect an empty second account; no live new-account diagnosis was performed.
- L3 Accepted model/authorization/options are quoted in S2–S7. No live data read/write, native migration, publication or deployment has been authorized for this feature. Existing purchases, printers, quotes and personal rows remain private; do not loosen their policies.
- L4 Initial plan referenced old 71-item supplier documentation. More recent verified import evidence records 1127 confirmed supplier products plus 44 pending references (1171 source URLs); must reconcile against evidenced supplier-source artifacts before curating. Counts are historical evidence to verify, not a requirement to invent products or promote owner rows. Never use private native readbacks/receipts as a public seed.
- L5 Architecture direction: separately governed admitted-member-read base; owner-only per-field overrides/CAS; preserve profile:/purchase: identities and historical quote snapshots, add a stable base identity and guarded quote wrapper path. Deduplicate only exact verified supplier identity/URL, never fuzzy names. Personal data is never copied to the base. These technical choices implement S2–S6 without a live data operation.
- L6 Worktree .worktrees/shared-spool-catalog registered, initialized at c67ab6c. Existing in-project node_modules and browser-cache symlinks prepared; Vite protections unchanged. Forecast approximately 1200–1800 authored lines across dependent review units plus generated supplier seed data; user chose feature-branch-chain. Parent commits reviewable local work units, no remote operations.
- L7 T1 initial implementation generated 1127 confirmed/44 pending public-allowlisted records from reviewed prepared-catalog v5, excluding 8 nonfilaments. Five composition tests observed RED, then 7 focused / 201 full Node tests passed. Seed tests were post-builder, not RED. Parent found public display metadata dropped; scoped metadata-preservation test observed RED and correction passed 8 focused / 202 full Node tests, 0 fail/skip. Parent spotcheck reran 8 focused tests and diff-check successfully. T1 includes 299 authored code/test/doc lines plus 21189 generated seed lines, reviewed by allowlist/provenance/stable identity/coverage assertions. ASSESS unavailable due untracked files; self-verification plan fulfilled. Risk: none for this pure-data/domain unit. T2–T5 remain pending.
