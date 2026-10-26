import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessService } from '../src/auth/access.mjs';

const pending = { allowed: false, role: null, email: 'invite@example.test' };
const admitted = { allowed: true, role: 'member', email: 'invite@example.test' };
function fixture({ session = { user: { id: 'first' }, access_token: 'first-token' }, status = pending,
  claim = { data: { email: 'invite@example.test', role: 'member' }, error: null },
  afterClaim = admitted, onRpc = () => {} } = {}) {
  const calls = [];
  let current = session;
  let claimed = false;
  const client = {
    auth: { getSession: async () => ({ data: { session: current }, error: null }) },
    rpc: async name => {
      calls.push(name);
      await onRpc(name);
      if (name === 'calc3d_claim_invitation') { claimed = true; return claim; }
      return { data: claimed ? afterClaim : status, error: null };
    },
  };
  return { calls, client, service: createAccessService(client), changeSession: value => { current = value; } };
}

test('explicit bootstrap claims pending invitation once and independently re-reads admission', async () => {
  const f = fixture();
  assert.equal((await f.service.admitOnLogin()).access?.allowed, true);
  assert.deepEqual(f.calls, ['calc3d_access_status', 'calc3d_claim_invitation', 'calc3d_access_status']);
  assert.equal((await f.service.requireAccess()).access?.allowed, true);
  assert.deepEqual(f.calls.slice(3), ['calc3d_access_status']);
});

test('no session and already admitted member/admin never claim', async () => {
  for (const status of [null, admitted, { allowed: true, role: 'admin', email: 'admin@example.test' }]) {
    const f = fixture({ session: status ? { user: { id: 'first' }, access_token: 'first-token' } : null, status });
    assert.equal((await f.service.admitOnLogin()).access?.allowed ?? false, !!status);
    assert.deepEqual(f.calls, status ? ['calc3d_access_status'] : []);
  }
});

test('no-pending is denial, not successful claim; unexpected failures propagate', async () => {
  const noPending = fixture({ claim: { data: null, error: { code: '23514', message: 'Invitation is not pending' } } });
  assert.equal((await noPending.service.admitOnLogin()).access.allowed, false);
  assert.deepEqual(noPending.calls, ['calc3d_access_status', 'calc3d_claim_invitation']);
  for (const error of [{ code: '23514', message: 'Ambiguous Calc3D member identity' }, { code: '42501', message: 'Permission denied' }, new Error('offline')]) {
    const f = fixture({ claim: { data: null, error } });
    await assert.rejects(f.service.admitOnLogin(), failure => failure === error);
  }
});

test('empty successful claim response cannot be presented as accepted', async () => {
  const f = fixture({ claim: { data: null, error: null } });
  await assert.rejects(f.service.admitOnLogin(), /No se pudo aceptar la invitación/);
  assert.deepEqual(f.calls, ['calc3d_access_status', 'calc3d_claim_invitation']);
});

test('claim response is not authority: denied or malformed status remains denied', async () => {
  for (const afterClaim of [pending, null, { allowed: true, role: 'owner', email: 'invite@example.test' }]) {
    const f = fixture({ afterClaim });
    assert.equal((await f.service.admitOnLogin()).access.allowed, false);
    assert.deepEqual(f.calls, ['calc3d_access_status', 'calc3d_claim_invitation', 'calc3d_access_status']);
  }
});

test('session change before claim or after claim cannot authorize old identity', async () => {
  for (const point of [1, 2]) {
    let f;
    let count = 0;
    f = fixture({ onRpc: name => {
      if (name === 'calc3d_access_status' || name === 'calc3d_claim_invitation') {
        if (++count === point) f.changeSession({ user: { id: 'second' }, access_token: 'second-token' });
      }
    } });
    assert.equal((await f.service.admitOnLogin()).access?.allowed ?? false, false);
    assert.equal(f.calls.includes('calc3d_claim_invitation'), point === 2);
  }
});
