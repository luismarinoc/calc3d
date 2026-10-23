# Brand registry and profile relation (T1–T2)

A brand is an owner-scoped identity with a stable UUID, an editable name and a representative color. T2 relates existing profiles to that identity and adds independent filament names and optional representative samples. Purchases, quotes and counters retain their original text and snapshots. T3 will add the maintainer, profile controls and visual markers.

## Public path

1. Apply `202610230001_calc3d_brands.sql` **after** the spool-profile migration, as the migration owner (not through the app). Existing nonempty brand text from profiles and purchased spools creates one brand per owner and normalized key, with `color: null` until the owner chooses a color.
2. On an admitted authenticated session, use `createRemoteRepositories(client, session).brands.list()`; entries are detached DTOs. For a brand name lookup, normalize legacy text with `normalizeBrandName(text)` and find that key in the brand's `aliases` array. Never compare another owner's list.
3. Save with `brands.createBrand({ name, color })` or `brands.updateBrand(id, { name, color }, expectedRevision)`. A save returns `{ ok: true, brand: DTO }`. Conflicts require reloading, not automatic retry.
4. Apply `202610230002_calc3d_profile_brand_colors.sql` after T1 as the migration owner. The profile list returns `brandId`, `filamentColor` and `filamentColorHex` alongside the original fields. Existing profile IDs, price, weight, revision and timestamps do not change during the association backfill.

## Shapes and normalization

| Surface | Exact shape |
| --- | --- |
| Input | `{ name: string, color: '#RRGGBB' }`; name trimmed and internal whitespace collapsed; color uppercase on save. Color required for new/edited records. |
| DTO | `{ id, name, normalizedName, color, aliases, revision, createdAt, updatedAt }`; `color` is null only for unconfigured legacy records, `aliases` is an array of normalized string keys. |
| REST list | `calc3d_brands` SELECT `id,name,normalized_name,color,aliases,revision,created_at,updated_at` (admitted owner only). |
| RPC | `calc3d_save_brand(payload jsonb, brand_id uuid default null, expected_revision bigint default 0)` returns a brand row. Create uses null ID and revision 0; update requires its ID and current positive revision. |

New/edited names reject Unicode general categories **Cc** (controls) and **Cf** (format characters), matching `validateBrand` (including zero-width characters such as U+200B); a PostgreSQL `C`-collation code-point range check enforces the same exclusion in the RPC and for configured-color rows. Ordinary accented names and emoji remain valid. Name identity is lowercased, trimmed and whitespace runs collapsed **within the owner**. It does not correct spelling. On rename the old key stays in `aliases`, so legacy purchase text can still identify the same brand without rewriting a snapshot. A former alias cannot be assigned to another brand of that owner. Different owners can use identical names. Legacy purchased labels longer than 120 characters remain readable, but an edited name must fit the new 120-character limit. If existing profile/purchase brand text contains Cc/Cf, the additive migration refuses transactionally (`23514`, `Legacy brand name contains unsupported control or format characters`); it does not strip text, merge names, or rewrite any historical row. Preflight and resolve such incompatible source data with the migration owner before applying; no live migration is part of T1. No delete, merge or deactivation API exists.

## Profile relation and independent filament color (T2)

| Surface | Exact contract |
| --- | --- |
| Profile DTO | Existing fields plus `brandId: UUID \| null`, `filamentColor: string`, `filamentColorHex: '#RRGGBB' \| null`. The readable name can be empty for unknown legacy filament. Empty names have no sample. |
| REST list | `calc3d_spool_profiles` SELECT additionally `brand_id,filament_color,filament_color_hex`; these map to the camelcase DTO names above. Old response mocks without optional columns map to null / empty / null; present invalid columns fail parsing. |
| RPC | The **same** `calc3d_save_spool_profile(payload jsonb, profile_id uuid default null, expected_revision bigint default 0)` accepts optional camelcase `brandId`, `filamentColor`, `filamentColorHex` in `payload`, in addition to existing fields. |
| Color input | Trimmed readable name, at most 120 code points, no Unicode Cc/Cf; optional six-digit hex uppercased on save. Supply `filamentColor` with any nonnull `filamentColorHex`. A named color may intentionally have null/no sample. |

Missing `brandId`, `brand`, `filamentColor` and `filamentColorHex` keys on **updates** retain their stored values. The domain validator and repository pass presence through rather than inserting defaults. Explicit `brandId: null` clears association; without a supplied `brand` it also clears the old brand label, while an explicit label stays readable but unassociated. Explicit `filamentColor: ''` clears the name and its sample; `filamentColorHex: null` clears only the sample. On creation, omitted fields default to unassociated, empty brand/color names and null sample. A `brandId` selection requires an owner-owned registry row; its **current registry name** is stored as the compatible profile `brand` text regardless of an additional supplied brand label. Text-only saves resolve owner aliases (including previous names); unknown strings remain readable and unassociated. Association never changes historical purchase/quote text, and renaming a registry brand does not rewrite existing profile text. T3 resolves the current registry name/color in lists.

The database enforces `(owner_id,brand_id)` via composite FK in addition to RPC owner lookup. Invalid payloads and missing/foreign brand IDs return `23514`, `Invalid spool profile`; stale/foreign profile revision returns `40001`, `Spool profile revision conflict`; denied admission returns `28000`, `Calc3D access denied`. Rejection leaves business rows/counters untouched. Only the RPC may mutate authenticated profiles; explicit save acknowledgement remains `{ ok: true, profile: DTO }` after a verified response.

## Failure contract

The RPC rejects invalid payload/revision with SQLSTATE `23514`, `Invalid brand`; occupied names (including prior aliases) with `23505`, `Brand name already in use`; missing, foreign or stale update with `40001`, `Brand revision conflict`; absent or disabled admission with `28000`, `Calc3D access denied`. It is atomic: no brand/alias update survives a rejection. The repository validates before RPC, maps revision conflicts to `La marca cambió; recarga antes de guardar.`, and fences owner/access both before and after every read/write. Direct authenticated table mutation and anonymous table/RPC access are not granted.

## Verification

`node --test tests/brands.test.mjs tests/supabase-brands-repositories.test.mjs tests/supabase-brands.test.mjs` covers T1. `node --test tests/spool-profiles.test.mjs tests/supabase-repositories.test.mjs tests/profile-brand-colors-repositories.test.mjs tests/supabase-profile-brand-colors.test.mjs` covers T2 with a disposable PostgreSQL cluster. Migrations are local-only; live deployment and UI are out of scope.
