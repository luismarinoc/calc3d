# Brand registry contract (T1)

A brand is an owner-scoped identity with a stable UUID, an editable name and a representative color. Historical purchases and quotations keep their original text and snapshots. T2 will relate spool profiles to these IDs; T3 will add the maintainer and visual markers. This migration does not change existing profile, purchase, spool, quote or counter rows.

## Public path

1. Apply `202610230001_calc3d_brands.sql` **after** the spool-profile migration, as the migration owner (not through the app). Existing nonempty brand text from profiles and purchased spools creates one brand per owner and normalized key, with `color: null` until the owner chooses a color.
2. On an admitted authenticated session, use `createRemoteRepositories(client, session).brands.list()`; entries are detached DTOs. For a brand name lookup, normalize legacy text with `normalizeBrandName(text)` and find that key in the brand's `aliases` array. Never compare another owner's list.
3. Save with `brands.createBrand({ name, color })` or `brands.updateBrand(id, { name, color }, expectedRevision)`. A save returns `{ ok: true, brand: DTO }`. Conflicts require reloading, not automatic retry.

## Shapes and normalization

| Surface | Exact shape |
| --- | --- |
| Input | `{ name: string, color: '#RRGGBB' }`; name trimmed and internal whitespace collapsed; color uppercase on save. Color required for new/edited records. |
| DTO | `{ id, name, normalizedName, color, aliases, revision, createdAt, updatedAt }`; `color` is null only for unconfigured legacy records, `aliases` is an array of normalized string keys. |
| REST list | `calc3d_brands` SELECT `id,name,normalized_name,color,aliases,revision,created_at,updated_at` (admitted owner only). |
| RPC | `calc3d_save_brand(payload jsonb, brand_id uuid default null, expected_revision bigint default 0)` returns a brand row. Create uses null ID and revision 0; update requires its ID and current positive revision. |

New/edited names reject Unicode general categories **Cc** (controls) and **Cf** (format characters), matching `validateBrand` (including zero-width characters such as U+200B); a PostgreSQL `C`-collation code-point range check enforces the same exclusion in the RPC and for configured-color rows. Ordinary accented names and emoji remain valid. Name identity is lowercased, trimmed and whitespace runs collapsed **within the owner**. It does not correct spelling. On rename the old key stays in `aliases`, so legacy purchase text can still identify the same brand without rewriting a snapshot. A former alias cannot be assigned to another brand of that owner. Different owners can use identical names. Legacy purchased labels longer than 120 characters remain readable, but an edited name must fit the new 120-character limit. If existing profile/purchase brand text contains Cc/Cf, the additive migration refuses transactionally (`23514`, `Legacy brand name contains unsupported control or format characters`); it does not strip text, merge names, or rewrite any historical row. Preflight and resolve such incompatible source data with the migration owner before applying; no live migration is part of T1. No delete, merge or deactivation API exists.

## Failure contract

The RPC rejects invalid payload/revision with SQLSTATE `23514`, `Invalid brand`; occupied names (including prior aliases) with `23505`, `Brand name already in use`; missing, foreign or stale update with `40001`, `Brand revision conflict`; absent or disabled admission with `28000`, `Calc3D access denied`. It is atomic: no brand/alias update survives a rejection. The repository validates before RPC, maps revision conflicts to `La marca cambió; recarga antes de guardar.`, and fences owner/access both before and after every read/write. Direct authenticated table mutation and anonymous table/RPC access are not granted.

## Verification

`node --test tests/brands.test.mjs tests/supabase-brands-repositories.test.mjs tests/supabase-brands.test.mjs` exercises the domain, repository and disposable PostgreSQL public read/RPC contract. Migration is local-only; deployment and UI are not part of T1.
