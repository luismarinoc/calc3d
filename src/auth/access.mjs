export function normalizeRow(data) {
  return Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data ?? null;
}

const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const denied = () => new Error('Se requiere acceso de administrador.');

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
    const row = normalizeRow(result.data);
    const access = row?.allowed === true && ['admin', 'member'].includes(row.role)
      ? { allowed: true, role: row.role, email: row.email }
      : { allowed: false, role: null, email: null };
    if (adminOnly && access.role !== 'admin') return { client, session, access: { ...access, allowed: false } };
    return { client, session, access };
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
  return { client, requireAccess, listMembers, inviteUser, setUserActive, signOut: () => client.auth.signOut() };
}
