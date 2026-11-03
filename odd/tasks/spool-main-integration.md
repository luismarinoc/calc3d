# Spool catalog main integration
Integrate the authorized catalog branch through a protected PR while preserving newer main behavior.
Delivery: single-pr (user selected complete branch); no deployment or migration execution.

## Specs
1. S1 — User: "suba main".
2. S2 — Scope selection: "La rama completa mediante PR"; option description: "Autorizar crear la PR y fusionarla cuando pasen los checks, sin desplegar ni aplicar migraciones."
3. S3 — Original UI request: "quiero cambiar consultar bobina fue de de configuracion , tamnbien necesito que desde consultor bobima de pueda ediatar la bobina"; navigation selection: "En la navegación principal".

## Tasks
- T1 [done] S1–S3 — Reconcile source with current main preserving later color/material/runtime changes; route: gentle-ai-worker (runtime context backstop); commit: fe6d34cb6bb0cd55e2a339ee82a6722ad56be77e.
- T2 [in_progress] S1–S2 — Create one PR referencing approved issue #5; route: parent; commit: pending.
- T3 [pending] S1–S2 — Observe required checks and normally merge; route: parent; commit: pending.

## Log
- L1 User: "suba main".
- L2 User selected "La rama completa mediante PR" after disclosure of 34 files / 1,644 changed lines and no existing PR. The option explicitly authorizes PR creation and merge after passing checks, no deployment or executing migrations.
- L3 Source feat/todotoner-filament-catalog at c61a69d; latest two commits add Editar deep links (664afd6) and main-navigation consultation (c61a69d). Earlier catalog work already has newer equivalents in main via other integrations. Read-only merge-tree reports conflicts across duplicated files; latest main must not lose color columns, dynamic filters, incremental rendering, runtime fixes or test readiness.
- L4 Fresh GitHub reads verified luismarinoc/calc3d default main and issue #5 OPEN with status:approved and type:feature. Protected integration requires PR and strict Node tests / Browser tests. No bypass or force push.
- L5 Original c61a69d verification: expected RED navigation failure, then all spool-page browser projects / Node suite / build exit 0. These do not prove the new merged candidate.
- L6 Current main c575300 integration candidate in registered `.worktrees/spool-main-integration`: focused `npm run test:e2e -- tests/e2e/spool-page.pw.mjs --grep 'consultation Edit|consultation is in main navigation'` passed 8/8 across four projects (0 failed, 0 skipped). Combined `npm run test:e2e -- tests/e2e/spool-page.pw.mjs tests/e2e/spool-settings.pw.mjs tests/e2e/filament-color.pw.mjs` passed 96/96 across four projects (0 failed, 0 skipped). Earlier worker reported Node 194/194 and synthetic-env build passing twice; not rerun here. No candidate RED was observed because browser execution was unavailable in the earlier environment.

- L7 Reconciliation committed as fe6d34cb6bb0cd55e2a339ee82a6722ad56be77e: seven files, 75 additions / 7 deletions. Older source catalog work is already integrated into newer main, so this PR carries only missing navigation/edit semantics. Self-review Risk: none (requested UI/editor wiring only; no shared helper/guard/API/schema changes). ASSESS unavailable due untracked tracking file, returned self-verification plan fulfilled; RDD remains off.
