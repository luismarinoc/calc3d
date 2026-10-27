import { client, accessService, onAccessChange } from './auth/browser.mjs';

const status = document.querySelector('#login-status');
const errorBox = document.querySelector('#login-error');
const actions = document.querySelector('#login-actions');
const denied = document.querySelector('#denied-actions');
const google = document.querySelector('#google-login');
const form = document.querySelector('#password-form');
let checking = false;
let revision = 0;
let queued = false;
function error(message) { errorBox.textContent = message; errorBox.hidden = false; }
function busy(active) { google.disabled = active; form.querySelector('button').disabled = active; }
async function check() {
  if (checking) { queued = true; return; }
  checking = true;
  const token = revision;
  busy(true);
  status.textContent = 'Comprobando acceso…';
  try {
    const { session, access, request } = await accessService.admitOnLogin();
    if (token !== revision) return;
    if (session && access?.allowed) { window.location.replace('/'); return; }
    denied.hidden = !session;
    actions.hidden = !!session;
    status.textContent = !session ? 'Inicia sesión para continuar.' : ({
      pending: 'Solicitud pendiente de aprobación.', rejected: 'Solicitud rechazada.',
      revoked: 'Acceso desactivado.', approved: 'Aprobación pendiente de verificación.',
    }[request?.state] ?? 'Acceso no autorizado.');
  } catch {
    if (token === revision) {
      error('No pudimos comprobar tu acceso. Revisa tu conexión e inténtalo de nuevo.');
      status.textContent = 'No se pudo comprobar el acceso.';
    }
  } finally {
    checking = false;
    if (queued || token !== revision) { queued = false; void check(); }
    else busy(false);
  }
}
google.addEventListener('click', async () => {
  busy(true); errorBox.hidden = true;
  status.textContent = 'Conectando con Google…';
  const { error: failure } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
  if (failure) { error('No se pudo iniciar sesión con Google. Inténtalo otra vez.'); busy(false); }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  busy(true); errorBox.hidden = true;
  const { error: failure } = await client.auth.signInWithPassword({ email: form.elements.email.value, password: form.elements.password.value });
  form.elements.password.value = '';
  if (failure) { error('Correo o contraseña incorrectos.'); busy(false); return; }
  await check();
});
document.querySelector('#change-account').addEventListener('click', async () => {
  revision++;
  denied.hidden = true;
  status.textContent = 'Cerrando sesión…';
  busy(true);
  const { error: failure } = await accessService.signOut();
  if (failure) { error('No se pudo cerrar la sesión. Inténtalo otra vez.'); busy(false); return; }
  denied.hidden = true;
  actions.hidden = false;
  await check();
});
onAccessChange(() => { revision++; void check(); });
void check();
