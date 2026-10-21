import { accessService, onAccessChange } from './auth/browser.mjs';

const status = document.querySelector('#users-status');
const errorBox = document.querySelector('#users-error');
const content = document.querySelector('#admin-content');
const list = document.querySelector('#members-list');
const form = document.querySelector('#invite-form');
let currentEmail = null;
let revision = 0;
function failure(message) { errorBox.textContent = message; errorBox.hidden = false; }
function row(member) {
  const item = document.createElement('div');
  item.className = 'member';
  const info = document.createElement('div');
  const email = document.createElement('strong');
  email.textContent = member.email;
  const meta = document.createElement('span');
  meta.textContent = `${member.role === 'admin' ? 'Administrador' : 'Miembro'} · ${member.active ? 'Activo' : 'Desactivado'}`;
  info.append(email, meta);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'secondary';
  toggle.textContent = member.active ? 'Desactivar' : 'Activar';
  toggle.disabled = member.active && member.email.toLowerCase() === currentEmail?.toLowerCase();
  toggle.title = toggle.disabled ? 'No puedes desactivar tu propia cuenta' : '';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    errorBox.hidden = true;
    try {
      await accessService.setUserActive(member.email, !member.active);
      await refresh();
    } catch { failure('No se pudo cambiar el acceso. No se modificó esta lista.'); toggle.disabled = false; }
  });
  item.append(info, toggle);
  return item;
}
async function refresh() {
  const sequence = ++revision;
  content.hidden = true;
  errorBox.hidden = true;
  status.textContent = 'Comprobando permisos…';
  try {
    const { session, access } = await accessService.requireAccess({ adminOnly: true });
    if (sequence !== revision) return;
    if (!session) { window.location.assign('/login.html'); return; }
    if (!access?.allowed) { status.textContent = 'Solo administradores pueden consultar Usuarios.'; return; }
    currentEmail = access.email;
    const members = await accessService.listMembers();
    if (sequence !== revision) return;
    list.replaceChildren(...members.map(row));
    content.hidden = false;
    status.textContent = `${members.length} usuario(s) autorizados.`;
  } catch {
    if (sequence !== revision) return;
    failure('No se pudo consultar los permisos o la lista. Revisa tu conexión.');
    status.textContent = 'Acceso no disponible.';
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button');
  button.disabled = true;
  errorBox.hidden = true;
  try {
    await accessService.inviteUser(form.elements.email.value);
    form.reset();
    await refresh();
  } catch { failure('No se pudo autorizar el correo. No se modificó la lista.'); }
  finally { button.disabled = false; }
});
document.querySelector('#signout').addEventListener('click', async () => {
  content.hidden = true;
  const { error } = await accessService.signOut();
  if (error) { failure('No se pudo cerrar la sesión.'); return; }
  window.location.assign('/login.html');
});
onAccessChange(refresh);
refresh();
