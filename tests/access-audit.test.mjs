import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessService } from '../src/auth/access.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const time = '2026-10-27T12:00:00Z';
const request = { id: requestId, user_id: id, email: 'new@example.test', status: 'pending', revision: 0,
  created_at: time, updated_at: time, reviewed_at: null };
const event = { id: requestId, occurred_at: time, actor_id: id, actor_email: 'new@example.test',
  action: 'access_request.created', target_type: 'access_request', target_id: requestId,
  outcome: 'committed', ip_address: null, country: null };
const allowed = { allowed: true, role: 'admin', email: 'admin@example.test' };
const denied = { allowed: false, role: null, email: null };
function fixture({ access = denied, response = { state: 'pending', request }, rpc = {} } = {}) {
  const calls = [];
  let session = { user: { id }, access_token: 'first' };
  const client = { auth: { getSession: async () => ({ data: { session }, error: null }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (rpc[name]) return rpc[name](args);
      return { data: name === 'calc3d_claim_invitation' ? null : name === 'calc3d_request_access' ? response :
        name === 'calc3d_list_access_requests' ? [request] : name === 'calc3d_list_audit_events' ? [event] :
        name === 'calc3d_review_access_request' ? { ...request, status: args.decision, revision: 1, reviewed_at: time } : access,
      error: name === 'calc3d_claim_invitation' ? { code: '23514', message: 'Invitation is not pending' } : null };
    } };
  return { calls, service: createAccessService(client), switch: () => { session = { user: { id: requestId }, access_token: 'second' }; } };
}
const names = f => f.calls.map(([name]) => name);
test('bootstrap requests only unknown confirmed identity, records server decision and rechecks authority', async () => {
  const f = fixture();
  const result = await f.service.admitOnLogin();
  assert.equal(result.access.allowed, false);
  assert.deepEqual(result.request, { state: 'pending', request });
  assert.deepEqual(names(f), ['calc3d_access_status', 'calc3d_claim_invitation', 'calc3d_request_access', 'calc3d_record_access', 'calc3d_access_status']);
  const admitted = fixture({ access: allowed });
  assert.equal((await admitted.service.admitOnLogin()).access.allowed, true);
  assert.deepEqual(names(admitted), ['calc3d_access_status', 'calc3d_record_access', 'calc3d_access_status']);
  const absent = fixture(); absent.switch();
  // Ordinary checks cannot request or record.
  await absent.service.requireAccess();
  assert.deepEqual(names(absent), ['calc3d_access_status']);
});
test('rejected and revoked stay blocked; unexpected request and audit errors propagate', async () => {
  for (const state of ['rejected', 'revoked']) {
    const f = fixture({ response: state === 'revoked' ? { state, request: null } : { state, request: { ...request, status: state } } });
    const result = await f.service.admitOnLogin();
    assert.equal(result.access.allowed, false); assert.equal(result.request.state, state);
    assert.equal(names(f).filter(name => name === 'calc3d_request_access').length, 1);
  }
  for (const name of ['calc3d_request_access', 'calc3d_record_access']) {
    const f = fixture({ rpc: { [name]: () => ({ data: null, error: new Error('offline') }) } });
    await assert.rejects(f.service.admitOnLogin(), /offline/);
  }
  const malformed = fixture({ response: { state: 'approved', request } });
  await assert.rejects(malformed.service.admitOnLogin(), /Respuesta de acceso inválida/);
});
test('changed identity or token during request or access record cannot admit old account', async () => {
  for (const name of ['calc3d_request_access', 'calc3d_record_access']) {
    let f; f = fixture({ rpc: { [name]: () => { f.switch(); return { data: name === 'calc3d_request_access' ? { state: 'pending', request } : allowed, error: null }; } } });
    assert.equal((await f.service.admitOnLogin()).session, null);
    assert.equal(names(f).at(-1), name);
  }
});
test('admin operations validate inputs, detach DTOs, enforce admission before and after RPC', async () => {
  const f = fixture({ access: allowed });
  for (const input of [[null, 'approved', 0], [requestId, 'unknown', 0], [requestId, 'approved', -1]])
    await assert.rejects(f.service.reviewAccessRequest(...input), /inválidos/);
  await assert.rejects(f.service.listAuditEvents({ occurred_at: time }), /Cursor/);
  assert.equal(names(f).every(name => name === 'calc3d_access_status'), true);
  const rows = await f.service.listAccessRequests(); rows[0].email = 'changed';
  assert.equal(request.email, 'new@example.test');
  const reviewed = await f.service.reviewAccessRequest(requestId, 'approved', 0);
  assert.deepEqual(f.calls.find(([name]) => name === 'calc3d_review_access_request')[1], { request_id: requestId, decision: 'approved', expected_revision: 0 });
  assert.equal(reviewed.status, 'approved');
  const audit = await f.service.listAuditEvents();
  assert.equal(audit[0].ip_address, null);
  assert.deepEqual(f.calls.find(([name]) => name === 'calc3d_list_audit_events')[1], { before_time: null, before_id: null, limit_count: 50 });
  const member = fixture();
  await assert.rejects(member.service.listAccessRequests(), /administrador/);
  await assert.rejects(member.service.reviewAccessRequest(requestId, 'approved', 0), /administrador/);
  await assert.rejects(member.service.listAuditEvents(), /administrador/);
  assert.deepEqual(names(member), Array(3).fill('calc3d_access_status'));
  let switched; switched = fixture({ access: allowed, rpc: { calc3d_list_access_requests: () => { switched.switch(); return { data: [request], error: null }; } } });
  await assert.rejects(switched.service.listAccessRequests(), /administrador/);
  let changed; changed = fixture({ access: allowed, rpc: { calc3d_review_access_request: () => { changed.switch(); return { data: { ...request, status: 'approved', revision: 1, reviewed_at: time }, error: null }; } } });
  await assert.rejects(changed.service.reviewAccessRequest(requestId, 'approved', 0), /administrador/);
});
test('audit public RPC preserves PostgreSQL microseconds, offset instants and paired cursor', async () => {
  const first = { ...event, id: '00000000-0000-4000-8000-000000000001', occurred_at: '2026-10-27T12:00:00.123900Z',
    actor_email: 'admin@example.com', action: 'quote.saved', target_type: 'quote' };
  const second = { ...first, id: '00000000-0000-4000-8000-000000000002', occurred_at: '2026-10-27T12:00:00.123100Z' };
  const page = [first, second];
  const f = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: page, error: null }) } });
  assert.deepEqual(await f.service.listAuditEvents(), page);
  assert.deepEqual(names(f), ['calc3d_access_status', 'calc3d_list_audit_events', 'calc3d_access_status']);
  const cursor = { occurred_at: '2026-10-27T13:00:00.123900+01:00', id: first.id };
  const after = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: [second], error: null }) } });
  assert.deepEqual(await after.service.listAuditEvents(cursor), [second]);
  assert.deepEqual(after.calls.find(([name]) => name === 'calc3d_list_audit_events')[1], {
    before_time: cursor.occurred_at, before_id: cursor.id, limit_count: 50,
  });
  const equalTime = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: [{ ...second, occurred_at: '2026-10-27T13:00:00.123900+01:00' }], error: null }) } });
  await assert.rejects(equalTime.service.listAuditEvents(cursor), /Orden de auditoría inválido/);
  const tieFirst = { ...first, id: second.id, occurred_at: '2026-10-27T13:00:00.123900+01:00' };
  const tieSecond = { ...first, id: first.id };
  const tie = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: [tieFirst, tieSecond], error: null }) } });
  assert.deepEqual(await tie.service.listAuditEvents(), [tieFirst, tieSecond]);
  for (const badPage of [[second, first], [first, first], [{ ...first, occurred_at: '2026-10-27T12:00:00.1239000Z' }],
    [{ ...first, occurred_at: '2026-02-30T12:00:00Z' }]]) {
    const original = structuredClone(badPage);
    const bad = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: badPage, error: null }) } });
    await assert.rejects(bad.service.listAuditEvents(), /inválid[ao]|Orden de auditoría/);
    assert.deepEqual(badPage, original);
  }
  const badCursor = fixture({ access: allowed });
  await assert.rejects(badCursor.service.listAuditEvents({ occurred_at: '2026-10-27T12:00:00.1239000Z', id: first.id }), /Cursor/);
  assert.deepEqual(names(badCursor), ['calc3d_access_status']);
});
test('audit pagination checks paired cursor, order, bounds and malformed DTO', async () => {
  const f = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: [{ ...event, occurred_at: '2026-10-27T11:00:00Z' }], error: null }) } });
  await f.service.listAuditEvents({ occurred_at: time, id: requestId });
  assert.deepEqual(f.calls.find(([name]) => name === 'calc3d_list_audit_events')[1], { before_time: time, before_id: requestId, limit_count: 50 });
  for (const rows of [[event, event], [{ ...event, ip_address: 42 }], null]) {
    const bad = fixture({ access: allowed, rpc: { calc3d_list_audit_events: () => ({ data: rows, error: null }) } });
    await assert.rejects(bad.service.listAuditEvents());
  }
});
