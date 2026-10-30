import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const url = 'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-pendiente';
const stamp = '2026-01-01T00:00:00Z';
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const pending = n => ({ id: id(n), owner_id: owner, name: `PLA ${n}`, material: 'PLA', brand: 'Marca', brand_id: null,
  filament_color: '', reference_price_clp: 11990, source_url: url, supplier_sku: 'SKU',
  pending_reasons: ['Peso neto sin confirmar'], provenance: { source: 'supplier' } });
const profile = n => ({ id: id(n), owner_id: owner, name: `PLA ${n}`, material: 'PLA', brand: '', brand_id: null,
  filament_color: '', filament_color_hex: null, purchase_price: 11000, net_weight_grams: 1000,
  revision: 1, created_at: stamp, updated_at: stamp, archived_at: null });
function harness(records, { cap = 3 } = {}) {
  let actor = owner, token = 'token-A', allowed = true;
  const calls = [];
  const access = { requireAccess: async () => ({ session: { user: { id: actor }, access_token: token }, access: { allowed } }) };
  const client = { from(table) {
    const query = { table, ownerFilter: null, cursor: null, count: false, limitSize: cap,
      select(_columns, options) { this.count = options?.count === 'exact'; return this; },
      eq(key, value) { assert.equal(key, 'owner_id'); this.ownerFilter = value; return this; },
      setHeader(key, value) { assert.equal(key, 'Authorization'); this.authorization = value; return this; },
      order(key) { assert.equal(key, 'id'); this.ordered = true; return this; },
      limit(size) { this.limitSize = Math.min(size, cap); return this; },
      gt(key, value) { assert.equal(key, 'id'); this.cursor = value; return this; },
      then(resolve, reject) {
        calls.push({ table, owner: this.ownerFilter, authorization: this.authorization, cursor: this.cursor });
        const visible = records[table].filter(row => row.owner_id === this.ownerFilter &&
          this.authorization === 'Bearer token-A' && this.ownerFilter === owner);
        const selected = this.cursor ? visible.filter(row => row.id > this.cursor) : visible;
        const sorted = this.ordered ? [...selected].sort((a, b) => a.id.localeCompare(b.id)) : selected;
        return Promise.resolve({ data: sorted.slice(0, this.limitSize), count: this.count ? visible.length : null }).then(resolve, reject);
      },
    }; return query;
  } };
  const repo = createRemoteRepositories(client, { user: { id: owner } }, access);
  return { repo, calls, switchOwner: () => { actor = other; token = 'token-B'; }, revoke: () => { allowed = false; } };
}

test('pending list is complete across capped pages, nonquotable, and isolated from positive profiles', async () => {
  const h = harness({ calc3d_supplier_references: Array.from({ length: 8 }, (_, i) => pending(i + 1)),
    calc3d_spool_profiles: [profile(1)] });
  const refs = await h.repo.supplierReferences.list();
  assert.equal(refs.length, 8);
  assert.deepEqual(refs.map(r => r.id), Array.from({ length: 8 }, (_, i) => id(i + 1)));
  assert.equal(refs[0].quotable, false);
  assert.equal(refs[0].kind, 'pending-reference');
  assert.equal(Object.hasOwn(refs[0], 'netWeightGrams'), false);
  assert.equal(Object.hasOwn(refs[0], 'purchasePrice'), false);
  assert.equal(refs[0].referencePriceClp, 11990);
  assert.deepEqual(h.calls.map(c => c.cursor), [null, null, id(3), id(6)]);
  assert(h.calls.every(c => c.owner === owner && c.authorization === 'Bearer token-A'));
  const profiles = await h.repo.spoolProfiles.list();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].netWeightGrams, 1000);
  assert.equal(profiles[0].purchasePrice, 11000);
});

test('pending reads reject account switch and denied admission without partial data', async () => {
  const h = harness({ calc3d_supplier_references: [pending(1)], calc3d_spool_profiles: [] });
  h.switchOwner();
  await assert.rejects(h.repo.supplierReferences.list(), /La cuenta cambió/);
  assert.equal(h.calls.length, 0);
  const denied = harness({ calc3d_supplier_references: [pending(1)], calc3d_spool_profiles: [] });
  denied.revoke();
  await assert.rejects(denied.repo.supplierReferences.list(), /Acceso denegado/);
  assert.equal(denied.calls.length, 0);
});

test('verified supplier aliases are exact additions to the legacy product URL mapper', async () => {
  const aliases = [
    'https://www.todotoner.cl/impresoras/impresoras-3d/filamentos/pla-mate-creality-verde-Palta-1kg',
    'https://www.todotoner.cl/filamento/pla-plus/filamentos-pla-arcoiris-1kg-ender-filamentos',
    'https://www.todotoner.cl/filamento-pla-mate-lila-1kg-con-bobina-plastica-esun-filamentos',
    'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-amarillo-1kg-todotonercl-filamentos-1',
    'https://www.todotoner.cl/filamento-pla-hyper-alta-velocidad-azul-1kg-todotonercl-filamentos-1',
    'https://www.todotoner.cl/filamento-pla-lite-azul-1kg-bambu-lab-filamentos',
    'https://www.todotoner.cl/filamento-petg-gris-texturizado-anycubic-filamentos',
    'https://www.todotoner.cl/filamento-petg-cafe-oscuro-anycubic-filamentos',
  ];
  for (const [index, link] of [...aliases, url].entries()) {
    const h = harness({ calc3d_supplier_references: [{ ...pending(index + 1), source_url: link }],
      calc3d_spool_profiles: [{ ...profile(index + 1), source_url: link }] });
    assert.equal((await h.repo.supplierReferences.list())[0].sourceUrl, link);
    assert.equal((await h.repo.spoolProfiles.list())[0].sourceUrl, link);
  }
  for (const link of ['https://www.todotoner.cl/filamento-no-autorizado',
    'http://www.todotoner.cl/filamento-pla-lite-azul-1kg-bambu-lab-filamentos',
    'https://evil.test/filamento-pla-lite-azul-1kg-bambu-lab-filamentos']) {
    const h = harness({ calc3d_supplier_references: [{ ...pending(1), source_url: link }],
      calc3d_spool_profiles: [{ ...profile(1), source_url: link }] });
    await assert.rejects(h.repo.supplierReferences.list(), /Respuesta remota inválida de la referencia pendiente/);
    assert.equal(Object.hasOwn((await h.repo.spoolProfiles.list())[0], 'sourceUrl'), false);
  }
});

test('invalid pending URL or missing reason fails closed', async () => {
  for (const change of [{ source_url: 'javascript:alert(1)' }, { pending_reasons: [] }]) {
    const h = harness({ calc3d_supplier_references: [{ ...pending(1), ...change }], calc3d_spool_profiles: [] });
    await assert.rejects(h.repo.supplierReferences.list(), /Respuesta remota inválida de la referencia pendiente/);
  }
});
