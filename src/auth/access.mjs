import { auditInstant, auditRow, requestDecision, requestRow, rows, validCursor, validId, validRevision } from './access-audit.mjs';

export function normalizeRow(data) {
  return Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data ?? null;
}

const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const denied = () => new Error('Se requiere acceso de administrador.');
function parseAccess(data) {
  const row = normalizeRow(data);
  if (!row || typeof row.allowed !== 'boolean') throw new Error('Respuesta de acceso inválida.');
  if (row.allowed) {
    if (!['admin', 'member'].includes(row.role) || typeof row.email !== 'string' || !validEmail(row.email)) throw new Error('Respuesta de acceso inválida.');
    return { allowed: true, role: row.role, email: row.email };
  }
  return { allowed: false, role: null, email: null };
}

// Inject an official browser client or a deterministic test double. Recheck server
// admission for every protected operation; RLS remains the final authority.
export function createAccessService(client) {
  async function requireAccess({ adminOnly = false } = {}) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data?.session ?? null;
    if (!session) return { client, session: null, access: null };
    const result = await client.rpc('calc3d_access_status');
    if (result.error) throw result.error;
    const access = parseAccess(result.data);
    if (adminOnly && access.role !== 'admin') return { client, session, access: { ...access, allowed: false } };
    return { client, session, access };
  }
  const empty = () => ({ client, session: null, access: null });
  const identity = session => `${session?.user?.id ?? ''}\n${session?.access_token ?? ''}`;
  async function current(session) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return !!data?.session && identity(data.session) === identity(session);
  }
  // Writes belong to authenticated bootstrap only. Request/claim acknowledgements never admit.
  async function admitOnLogin() {
    const initial = await requireAccess();
    if (!initial.session) return initial;
    const session = initial.session;
    if (!await current(session)) return empty();
    let request = null;
    if (!initial.access.allowed) {
      const claim = await client.rpc('calc3d_claim_invitation');
      if (!await current(session)) return empty();
      if (claim.error) {
        if (claim.error.code !== '23514' || claim.error.message !== 'Invitation is not pending') throw claim.error;
      } else if (!normalizeRow(claim.data)) throw new Error('No se pudo aceptar la invitación.');
      // Recheck after a successful claim before deciding whether a request is necessary.
      if (!claim.error) {
        const admitted = await requireAccess();
        if (!await current(session)) return empty();
        if (admitted.access?.allowed) return record(session, null);
      }
      const response = await client.rpc('calc3d_request_access');
      if (!await current(session)) return empty();
      if (response.error) throw response.error;
      request = requestDecision(normalizeRow(response.data));
      if (request.request?.user_id !== undefined && request.request.user_id !== session.user?.id) throw new Error('Identidad de solicitud inválida.');
    }
    return record(session, request);
  }
  async function record(session, request) {
    if (!await current(session)) return empty();
    const response = await client.rpc('calc3d_record_access');
    if (!await current(session)) return empty();
    if (response.error) throw response.error;
    const recorded = parseAccess(response.data);
    const result = await requireAccess();
    if (!await current(session)) return empty();
    if (!result.session || identity(result.session) !== identity(session)) return empty();
    if (recorded.allowed !== result.access.allowed || recorded.role !== result.access.role) throw new Error('Decisión de acceso inconsistente.');
    return { ...result, request: result.access.allowed ? null : request };
  }
  async function admin() {
    const result = await requireAccess({ adminOnly: true });
    if (!result.access?.allowed) throw denied();
    return result;
  }
  async function listMembers() {
    await admin();
    const { data, error } = await client.from('calc3d_members').select('email,role,active,created_at').order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
  async function inviteUser(email) {
    await admin();
    const normalized = email?.trim().toLowerCase();
    if (!validEmail(normalized)) throw new Error('Correo inválido.');
    const { data, error } = await client.rpc('calc3d_invite_user', { invited_email: normalized });
    if (error) throw error;
    const row = normalizeRow(data);
    if (!row) throw new Error('No se pudo autorizar el correo.');
    return row;
  }
  async function setUserActive(email, enabled) {
    const { access } = await admin();
    const normalized = email?.trim().toLowerCase();
    if (!validEmail(normalized) || typeof enabled !== 'boolean') throw new Error('Datos de usuario inválidos.');
    if (!enabled && normalized === access.email?.toLowerCase()) throw new Error('No puedes desactivar tu propia cuenta.');
    const { data, error } = await client.rpc('calc3d_set_user_active', { member_email: normalized, enabled });
    if (error) throw error;
    const row = normalizeRow(data);
    if (!row) throw new Error('No se pudo cambiar el acceso.');
    return row;
  }
  async function adminSession() {
    const result = await admin();
    if (!await current(result.session)) throw denied();
    return result.session;
  }
  async function checkedAdmin(session) {
    if (!await current(session)) throw denied();
    const result = await admin();
    if (!await current(session) || identity(result.session) !== identity(session)) throw denied();
  }
  async function listAccessRequests() {
    const session = await adminSession();
    const result = await client.rpc('calc3d_list_access_requests');
    await checkedAdmin(session);
    if (result.error) throw result.error;
    return rows(result.data, requestRow);
  }
  async function reviewAccessRequest(id, decision, revision) {
    const session = await adminSession();
    if (!validId(id) || !['approved', 'rejected'].includes(decision) || !validRevision(revision)) throw new Error('Datos de solicitud inválidos.');
    const result = await client.rpc('calc3d_review_access_request', { request_id: id, decision, expected_revision: revision });
    // The server may have committed even if the user's admin status changes while awaiting.
    await checkedAdmin(session);
    if (result.error) throw result.error;
    const row = requestRow(normalizeRow(result.data));
    if (row.id !== id || row.status !== decision || row.revision !== revision + 1) throw new Error('Respuesta de revisión inválida.');
    return row;
  }
  async function listAuditEvents(cursor = null) {
    const session = await adminSession();
    if (cursor !== null && !validCursor(cursor)) throw new Error('Cursor de auditoría inválido.');
    const result = await client.rpc('calc3d_list_audit_events', {
      before_time: cursor?.occurred_at ?? null, before_id: cursor?.id ?? null, limit_count: 50,
    });
    await checkedAdmin(session);
    if (result.error) throw result.error;
    const list = rows(result.data, auditRow);
    const before = (left, right) => auditInstant(left.occurred_at) < auditInstant(right.occurred_at) ||
      (auditInstant(left.occurred_at) === auditInstant(right.occurred_at) && left.id.toLowerCase() < right.id.toLowerCase());
    if (list.length > 50 || list.some((item, i) => {
      const prior = i ? list[i - 1] : cursor;
      return prior && !before(item, prior);
    })) throw new Error('Orden de auditoría inválido.');
    return list;
  }
  return { client, requireAccess, admitOnLogin, listMembers, inviteUser, setUserActive,
    listAccessRequests, reviewAccessRequest, listAuditEvents, signOut: () => client.auth.signOut() };
}
