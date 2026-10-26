import { createClient } from '@supabase/supabase-js';
import { validatePublicConfig } from './config.mjs';
import { createAccessService } from './access.mjs';

const { url, key } = validatePublicConfig({
  SUPABASE_URL: import.meta.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY,
});
export const client = createClient(url, key, { auth: {
  flowType: 'pkce', detectSessionInUrl: true, autoRefreshToken: true, persistSession: true,
} });
export const accessService = createAccessService(client);
export const getAuthenticatedClient = async () => {
  const result = await accessService.requireAccess();
  return result.access?.allowed ? result.client : null;
};

const destinations = new Set(['/', '/index.html', '/purchases.html', '/settings.html', '/users.html']);
export function loginDestination(pathname = window.location.pathname) {
  return destinations.has(pathname) ? `/login.html?next=${encodeURIComponent(pathname)}` : '/login.html';
}
export async function requireAccess(options = {}) {
  const result = Object.keys(options).length ? await accessService.requireAccess(options) : await accessService.admitOnLogin();
  if (!result.session || !result.access?.allowed) window.location.assign(loginDestination());
  return result;
}
export function onAccessChange(callback) {
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    // Supabase holds its auth lock during the callback: never await another SDK call here.
    setTimeout(() => callback(event, session?.user?.id), 0);
  });
  const focus = () => callback();
  const visible = () => { if (!document.hidden) callback(); };
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visible);
  return () => {
    subscription.unsubscribe();
    window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visible);
  };
}
