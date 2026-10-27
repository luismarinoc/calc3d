import { accessService, onAccessChange } from './auth/browser.mjs';

const status = document.querySelector('#users-status');
const errorBox = document.querySelector('#users-error');
const content = document.querySelector('#admin-content');
const list = document.querySelector('#members-list');
const form = document.querySelector('#invite-form');
const requests = document.querySelector('#requests-list');
const requestStatus = document.querySelector('#requests-status');
const requestError = document.querySelector('#requests-error');
const audit = document.querySelector('#audit-list');
const auditStatus = document.querySelector('#audit-status');
const auditError = document.querySelector('#audit-error');
const more = document.querySelector('#audit-more');
let currentEmail = null;
let revision = 0;
let auditCursor = null;
let loadingAudit = false;
const showError = (box, message) => { box.textContent = message; box.hidden = false; };
const date = value => new Date(value).toLocaleString('es-CL');
const cell = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
const valid = sequence => sequence === revision && !content.hidden;
function clear() {
  content.hidden = true;
  currentEmail = null;
  list.replaceChildren();
  requests.replaceChildren();
  audit.replaceChildren();
  auditCursor = null;
  loadingAudit = false;
  more.hidden = true;
  requestError.hidden = auditError.hidden = true;
}
function memberRow(member) {
  const item = document.createElement('div');
  item.className = 'member';
  const info = document.createElement('div');
  info.append(cell('strong', member.email), cell('span', `${member.role === 'admin' ? 'Administrador' : 'Miembro'} · ${member.active ? 'Activo' : 'Desactivado'}`));
  const toggle = cell('button', member.active ? 'Desactivar' : 'Activar');
  toggle.type = 'button'; toggle.className = 'secondary';
  toggle.disabled = member.active && member.email.toLowerCase() === currentEmail?.toLowerCase();
  toggle.title = toggle.disabled ? 'No puedes desactivar tu propia cuenta' : '';
  toggle.addEventListener('click', async () => {
    const sequence = revision;
    toggle.disabled = true;
    errorBox.hidden = true;
    try {
      await accessService.setUserActive(member.email, !member.active);
      if (valid(sequence)) await refresh();
    } catch { if (valid(sequence)) { showError(errorBox, 'No se pudo cambiar el acceso. Comprueba el estado actual.'); toggle.disabled = false; } }
  });
  item.append(info, toggle);
  return item;
}
function requestRow(request) {
  const item = document.createElement('div'); item.className = 'member';
  const info = document.createElement('div');
  const label = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }[request.status];
  info.append(cell('strong', request.email), cell('span', `${label} · ${date(request.created_at)}`));
  item.append(info);
  if (request.status === 'pending') {
    const controls = document.createElement('div'); controls.className = 'request-controls';
    for (const [decision, name] of [['approved', 'Aprobar'], ['rejected', 'Rechazar']]) {
      const button = cell('button', name); button.type = 'button'; button.className = 'secondary';
      button.addEventListener('click', async () => {
        const sequence = revision;
        for (const control of controls.children) control.disabled = true;
        requestError.hidden = true;
        try {
          await accessService.reviewAccessRequest(request.id, decision, request.revision);
          if (!valid(sequence)) return;
          // A definitive acknowledgement is not undone by a failed follow-up read.
          requestStatus.textContent = 'Decisión guardada. Actualizando solicitudes…';
          item.replaceWith(requestRow({ ...request, status: decision }));
          try { await loadRequests(sequence); }
          catch { if (valid(sequence)) showError(requestError, 'Decisión guardada, pero no se pudo actualizar la lista. Vuelve a cargar Usuarios.'); }
        } catch { if (valid(sequence)) { showError(requestError, 'No se pudo confirmar la decisión. Recarga antes de volver a intentar.'); for (const control of controls.children) control.disabled = false; } }
      });
      controls.append(button);
    }
    item.append(controls);
  }
  return item;
}
async function loadRequests(sequence) {
  requestStatus.textContent = 'Cargando solicitudes…'; requestError.hidden = true;
  const rows = await accessService.listAccessRequests();
  if (!valid(sequence)) return;
  requests.replaceChildren(...rows.map(requestRow));
  requestStatus.textContent = rows.length ? `${rows.filter(row => row.status === 'pending').length} solicitud(es) pendientes. ${rows.length} en total.` : 'No hay solicitudes todavía.';
}
const actionNames = {
  'access.decision': 'Decisión de acceso', 'access_request.created': 'Solicitud creada',
  'access_request.approved': 'Solicitud aprobada', 'access_request.rejected': 'Solicitud rechazada',
  'quote.saved': 'Cotización guardada', 'purchase.saved': 'Compra guardada',
  'printers.saved': 'Impresoras guardadas', 'profile.created': 'Perfil creado',
  'profile.updated': 'Perfil actualizado', 'profile.archived': 'Perfil archivado',
  'brand.created': 'Marca creada', 'brand.updated': 'Marca actualizada',
  'brand.archived': 'Marca archivada', 'membership.invited': 'Invitación creada',
  'membership.activated': 'Acceso activado', 'membership.deactivated': 'Acceso desactivado',
  'identity.claimed': 'Invitación aceptada',
};
function auditRow(event) {
  const item = document.createElement('div'); item.className = 'audit-entry'; item.dataset.id = event.id;
  item.append(cell('strong', actionNames[event.action] ?? event.action),
    cell('span', `${date(event.occurred_at)} · ${event.actor_email ?? 'Sistema'} · ${event.outcome}`),
    cell('span', `${event.target_type}: ${event.target_id ?? 'No disponible'}`),
    cell('span', `IP: ${event.ip_address ?? 'No disponible'} · País: ${event.country ?? 'No disponible'}`));
  return item;
}
async function loadAudit(sequence, append = false) {
  if (loadingAudit) return;
  loadingAudit = true; more.disabled = true; auditError.hidden = true;
  auditStatus.textContent = 'Cargando actividad…';
  try {
    const rows = await accessService.listAuditEvents(append ? auditCursor : null);
    if (!valid(sequence)) return;
    if (!append) audit.replaceChildren();
    const seen = new Set([...audit.children].map(item => item.dataset.id));
    for (const row of rows) if (!seen.has(row.id)) { audit.append(auditRow(row)); seen.add(row.id); }
    auditCursor = rows.length ? { occurred_at: rows.at(-1).occurred_at, id: rows.at(-1).id } : null;
    more.hidden = rows.length < 50;
    auditStatus.textContent = audit.children.length ? `${audit.children.length} evento(s) visibles.` : 'No hay actividad disponible en los últimos 180 días.';
  } catch {
    if (valid(sequence)) {
      showError(auditError, 'No se pudo cargar la actividad. Inténtalo de nuevo.');
      auditStatus.textContent = 'Actividad no disponible.';
    }
  } finally { if (sequence === revision) { loadingAudit = false; more.disabled = false; } }
}
async function refresh() {
  const sequence = ++revision;
  clear(); errorBox.hidden = true;
  status.textContent = 'Comprobando permisos…';
  try {
    const { session, access } = await accessService.requireAccess({ adminOnly: true });
    if (sequence !== revision) return;
    if (!session) { window.location.assign('/login.html'); return; }
    if (!access?.allowed) { status.textContent = 'Solo administradores pueden consultar Usuarios.'; return; }
    currentEmail = access.email;
    const members = await accessService.listMembers();
    if (sequence !== revision) return;
    list.replaceChildren(...members.map(memberRow));
    content.hidden = false;
    status.textContent = `${members.length} usuario(s) autorizados.`;
    // Independent reads: a failed section cannot hide the other controls or pretend empty.
    void loadRequests(sequence).catch(() => {
      if (valid(sequence)) { showError(requestError, 'No se pudo cargar las solicitudes.'); requestStatus.textContent = 'Solicitudes no disponibles.'; }
    });
    void loadAudit(sequence);
  } catch {
    if (sequence !== revision) return;
    clear();
    showError(errorBox, 'No se pudo consultar los permisos o la lista. Revisa tu conexión.');
    status.textContent = 'Acceso no disponible.';
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const sequence = revision;
  const button = form.querySelector('button'); button.disabled = true; errorBox.hidden = true;
  try { await accessService.inviteUser(form.elements.email.value); if (valid(sequence)) { form.reset(); await refresh(); } }
  catch { if (valid(sequence)) showError(errorBox, 'No se pudo autorizar el correo. Comprueba el estado actual.'); }
  finally { button.disabled = false; }
});
more.addEventListener('click', () => { if (auditCursor) void loadAudit(revision, true); });
document.querySelector('#signout').addEventListener('click', async () => {
  revision++; clear();
  const { error } = await accessService.signOut();
  if (error) { showError(errorBox, 'No se pudo cerrar la sesión.'); return; }
  window.location.assign('/login.html');
});
onAccessChange(refresh);
void refresh();
