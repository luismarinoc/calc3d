import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessService, normalizeRow } from '../src/auth/access.mjs';

function fixture({ session = { user: { email: 'admin@example.test' } }, status = { allowed: true, role: 'admin', email: 'admin@example.test' }, error = null } = {}) {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }), signOut: async () => ({ error: null }) },
    rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'calc3d_access_status' ? status : { email: args?.invited_email ?? args?.member_email, role: 'member', active: args?.enabled ?? true }, error }; },
    from: () => ({ select: () => ({ order: async () => ({ data: [{ email: 'member@example.test', role: 'member', active: true }], error }) }) }),
  };
  return { client, calls, service: createAccessService(client) };
}

test('missing session and failed admission never allow access', async () => {
  const absent = fixture({ session: null });
  assert.deepEqual(await absent.service.requireAccess(), { client: absent.client, session: null, access: null });
  assert.deepEqual(absent.calls, []);
  for (const status of [{ allowed: false, role: null, email: null }, null]) {
    const f = fixture({ status });
    assert.equal((await f.service.requireAccess()).access?.allowed, false);
  }
  const failed = fixture({ error: new Error('offline') });
  await assert.rejects(failed.service.requireAccess(), /offline/);
});

test('member cannot list, invite or deactivate; rejected actions do not call write RPCs', async () => {
  const f = fixture({ status: { allowed: true, role: 'member', email: 'member@example.test' } });
  await assert.rejects(f.service.listMembers(), /administrador/i);
  await assert.rejects(f.service.inviteUser('new@example.test'), /administrador/i);
  await assert.rejects(f.service.setUserActive('new@example.test', false), /administrador/i);
  assert.deepEqual(f.calls.map(([name]) => name), Array(3).fill('calc3d_access_status'));
});

test('admin actions use exact backend arguments; invalid input and self-deactivation do not write', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.listMembers(), [{ email: 'member@example.test', role: 'member', active: true }]);
  assert.equal((await f.service.inviteUser('new@example.test')).email, 'new@example.test');
  assert.equal((await f.service.setUserActive('member@example.test', false)).active, false);
  for (const email of ['bad', 'admin@example.test']) {
    await assert.rejects(f.service.setUserActive(email, false));
  }
  assert.deepEqual(f.calls.filter(([name]) => name !== 'calc3d_access_status'), [
    ['calc3d_invite_user', { invited_email: 'new@example.test' }],
    ['calc3d_set_user_active', { member_email: 'member@example.test', enabled: false }],
  ]);
});

test('RPC JSON object and one-row array normalize; empty result fails closed', () => {
  assert.deepEqual(normalizeRow([{ allowed: true }]), { allowed: true });
  assert.deepEqual(normalizeRow({ allowed: true }), { allowed: true });
  assert.equal(normalizeRow([]), null);
});
