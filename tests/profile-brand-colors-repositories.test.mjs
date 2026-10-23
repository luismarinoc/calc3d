import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpoolProfile } from '../src/domain/spool-profiles.mjs';
import { createRemoteRepositories } from '../src/data/supabase.mjs';

const owner = { user: { id: '11111111-1111-4111-8111-111111111111' } };
const id = '22222222-2222-4222-8222-222222222222';
const brandId = '33333333-3333-4333-8333-333333333333';
const input = { name: 'PLA', material: 'PLA', brand: 'Legacy', purchasePrice: 12, netWeightGrams: 1000 };
const row = { id, name: 'PLA', material: 'PLA', brand: 'Legacy', brand_id: brandId,
  filament_color: 'Azul', filament_color_hex: '#AABBCC', purchase_price: 12,
  net_weight_grams: '1000', revision: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
function harness() {
  let session = owner, allowed = true, response = row;
  const calls = [];
  const client = { from: () => ({ select: columns => { calls.push(columns); return Promise.resolve({ data: [row], error: null }); } }),
    rpc: async (name, args) => { calls.push(args); return { data: response, error: null }; } };
  const access = { requireAccess: async () => ({ session, access: { allowed } }) };
  return { repo: createRemoteRepositories(client, owner, access), calls,
    reply: value => { response = value; }, switchOwner: () => { session = { user: { id } }; }, deny: () => { allowed = false; } };
}

test('new fields validate without materializing omitted write keys', () => {
  assert.deepEqual(validateSpoolProfile(input), input);
  const { brand: unused, ...withoutBrand } = input;
  assert.deepEqual(validateSpoolProfile(withoutBrand), withoutBrand);
  assert.deepEqual(validateSpoolProfile({ ...input, brandId, filamentColor: '  Azul  ', filamentColorHex: '#aabbcc' }),
    { ...input, brandId, filamentColor: 'Azul', filamentColorHex: '#AABBCC' });
  assert.deepEqual(validateSpoolProfile({ ...input, brandId: null, filamentColor: '', filamentColorHex: null }),
    { ...input, brandId: null, filamentColor: '', filamentColorHex: null });
  for (const extra of [{ brandId: 'bad' }, { filamentColor: '\u200b' }, { filamentColor: 'x'.repeat(121) },
    { filamentColorHex: '#12' }, { filamentColorHex: '#123456' }, { filamentColor: '', filamentColorHex: '#123456' }]) {
    assert.throws(() => validateSpoolProfile({ ...input, ...extra }), TypeError);
  }
});

test('list maps independent fields, old optional response columns, and rejects malformed modern rows', async () => {
  const h = harness();
  const [item] = await h.repo.spoolProfiles.list();
  assert.equal(item.brandId, brandId);
  assert.equal(item.filamentColor, 'Azul');
  assert.equal(item.filamentColorHex, '#AABBCC');
  assert.match(h.calls[0], /brand_id,filament_color,filament_color_hex/);
  h.reply({ ...row, revision: 2 });
  const result = await h.repo.spoolProfiles.updateProfile(id, { ...input, filamentColor: 'Azul', filamentColorHex: '#aabbcc' }, 1);
  assert.equal(result.profile.filamentColorHex, '#AABBCC');
  assert.deepEqual(h.calls.at(-1).payload, { ...input, filamentColor: 'Azul', filamentColorHex: '#AABBCC' });
  await h.repo.spoolProfiles.updateProfile(id, { name: 'PLA', material: 'PLA', purchasePrice: 12, netWeightGrams: 1000 }, 1);
  assert.equal(Object.hasOwn(h.calls.at(-1).payload, 'brand'), false);
  const old = { ...row }; delete old.brand_id; delete old.filament_color; delete old.filament_color_hex;
  h.reply(old);
  const legacy = await h.repo.spoolProfiles.createProfile(input);
  assert.equal(legacy.profile.brandId, null);
  assert.equal(legacy.profile.filamentColor, '');
  for (const bad of [{ ...row, brand_id: 'bad' }, { ...row, filament_color: null },
    { ...row, filament_color_hex: '#123' }, { ...row, filament_color: '', filament_color_hex: '#AABBCC' }]) {
    h.reply({ ...bad, revision: 2 });
    await assert.rejects(h.repo.spoolProfiles.updateProfile(id, input, 1), /remota inválida/);
  }
});

test('new profile writes are fenced before and after RPC just like legacy writes', async () => {
  const h = harness(); h.deny();
  await assert.rejects(h.repo.spoolProfiles.createProfile({ ...input, brandId }), /Acceso/);
  assert.equal(h.calls.length, 0);
  const switched = harness(); switched.switchOwner();
  await assert.rejects(switched.repo.spoolProfiles.updateProfile(id, input, 1), /cuenta/);
  assert.equal(switched.calls.length, 0);
});
