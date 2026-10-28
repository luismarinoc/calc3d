# Server-derived quotation totals

New remote quotations calculate their persisted result from the validated `input`, never from the submitted `result` or display-only `form` amounts. The submitted result must still have its established breakdown keys and safe numeric types; its monetary values do not set the stored totals. The public `calc3d_save_quote(jsonb)` admission RPC and its `{allowed,role,email}` membership check remain the same; the private core computes before allocating the owner's atomic COT number. Invalid arithmetic, adjustments, mode, purpose, malformed result shape, and unsafe monetary outputs reject with SQLSTATE `23514` without advancing the counter.

## Methods and history

| Method | New-save calculation | Historical records |
| --- | --- | --- |
| Omitted/legacy | Round each component to whole CLP, then sum; markup and independent adjustments use the base price. | Existing stored JSON remains untouched. |
| Reference | Keep raw component precision for allowance, total and multiplier; round displayed money to cents. | Existing stored JSON remains untouched. |
| Gift/internal | No sale price or commercial profit; gift has `giftCost` equal to total cost. | Opening a copy reads its original input and form; saving is a new calculation, never an edit to the old row. |

For copies, the current UI re-evaluates the saved form; a missing purchased spool stays marked unavailable. If pricing rules change in future, version or explicitly confirm copied drafts instead of silently interpreting an old form under new prices. This migration does not change pricing rules or rewrite prior snapshots.

## Verify in isolation

Run `node --test tests/supabase-quote-integrity.test.mjs tests/supabase-storage.test.mjs tests/supabase-repositories.test.mjs tests/costs.test.mjs tests/reference-costs.test.mjs` with local PostgreSQL binaries. The fixture starts a disposable TCP-only server under the system temporary directory and removes it afterward. It checks forged outputs, the two pricing methods and purposes, rejected-write row/counter invariants, historical rows, and independent owners. Do not apply this migration to a live database until separately reviewed and preflighted.
