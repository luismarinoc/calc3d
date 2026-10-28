import { requireAccess, onAccessChange, accessService } from './browser.mjs';

/** Admission is checked before mounting and rechecked after auth changes. A generation
 * invalidates every pending response and every page loader before it can paint. */
export async function protectPage({ onReady, onClear }) {
  const main = document.querySelector('main');
  if (main) main.inert = true;
  let owner = null;
  let generation = 0;
  let busy = false;
  let queued = false;
  let ready = false;
  const banner = document.createElement('div');
  banner.className = 'access-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = 'Comprobando acceso…';
  document.body.prepend(banner);
  const nav = document.createElement('nav');
  nav.className = 'account-nav';
  nav.hidden = true;
  const email = document.createElement('span');
  const users = document.createElement('a');
  users.href = './users.html'; users.textContent = 'Usuarios';
  const logout = document.createElement('button');
  logout.type = 'button'; logout.textContent = 'Salir';
  nav.append(email, users, logout);
  document.querySelector('header')?.append(nav);

  function invalidate() {
    generation++;
    ready = false;
    onClear();
    nav.hidden = true;
    if (main) main.inert = true;
    banner.hidden = false;
    queued = true;
  }
  logout.addEventListener('click', async () => {
    invalidate();
    banner.textContent = 'Cerrando sesión…';
    try { await accessService.signOut(); window.location.assign('/login.html'); }
    catch { banner.textContent = 'No se pudo cerrar sesión. Comprueba la conexión y vuelve a intentarlo.'; }
  });

  async function check() {
    if (busy) { queued = true; return; }
    busy = true;
    do {
      queued = false;
      const token = generation;
      const isCurrent = () => token === generation;
      try {
        const result = await requireAccess();
        if (!isCurrent()) continue;
        if (!result.session || !result.access?.allowed) {
          invalidate();
          queued = false; // requireAccess has already initiated the login redirect.
          banner.textContent = 'Acceso pendiente o desactivado. Inicia sesión con una cuenta autorizada.';
          continue;
        }
        const id = result.session.user.id;
        if (owner && owner !== id) {
          invalidate();
          // The old account is gone before loading any of the new account's records.
          queued = false;
        }
        owner = id;
        const current = generation;
        if (!ready) {
          await onReady(result, () => current === generation);
          if (current !== generation) continue;
          ready = true;
        }
        if (current !== generation) continue;
        email.textContent = result.access.email || result.session.user.email || 'Cuenta activa';
        users.hidden = result.access.role !== 'admin';
        nav.hidden = false; banner.hidden = true;
        if (main) main.inert = false;
      } catch {
        if (isCurrent()) {
          invalidate();
          queued = false;
          banner.textContent = 'No se pudo verificar el acceso. Comprueba tu conexión y recarga la página para reintentar.';
        }
      }
    } while (queued);
    busy = false;
  }
  const unsubscribe = onAccessChange((event, id) => {
    // INITIAL_SESSION and token refresh do not invalidate an unchanged user's draft.
    if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && owner !== id) || event === 'USER_UPDATED') invalidate();
    void check();
  });
  await check();
  return unsubscribe;
}
