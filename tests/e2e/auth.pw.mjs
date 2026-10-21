import { test, expect } from '@playwright/test';

const identity = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' };
const token = 'fake.browser.test';
function mockApi(page, { allowed = true, role = 'admin' } = {}) {
  const calls = [];
  page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON?.() ?? {};
    if (url.pathname.endsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, user: identity } });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: identity });
    if (url.pathname.endsWith('/rest/v1/rpc/calc3d_access_status')) return route.fulfill({ json: { allowed, role: allowed ? role : null, email: allowed ? identity.email : null } });
    if (url.pathname.endsWith('/rest/v1/calc3d_members')) return route.fulfill({ json: [{ email: identity.email, role: 'admin', active: true }, { email: 'member@example.test', role: 'member', active: true }] });
    if (url.pathname.endsWith('/rest/v1/rpc/calc3d_invite_user') || url.pathname.endsWith('/rest/v1/rpc/calc3d_set_user_active')) {
      calls.push([url.pathname.split('/').pop(), body]);
      return route.fulfill({ json: { email: body.invited_email ?? body.member_email, role: 'member', active: body.enabled ?? true } });
    }
    return route.fulfill({ status: 404, json: { message: 'Not mocked' } });
  });
  return calls;
}
async function signIn(page, { succeeds = true } = {}) {
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  if (succeeds) await page.waitForURL('/');
}

test('Google starts SDK OAuth with root callback; no real Google consent', async ({ page }) => {
  let authorize;
  await page.route('http://127.0.0.1:54321/auth/v1/authorize**', route => { authorize = new URL(route.request().url()); return route.fulfill({ status: 200, body: 'Mock OAuth' }); });
  await page.goto('/login.html');
  const callback = new URL('/', page.url()).href;
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect.poll(() => authorize?.searchParams.get('redirect_to')).toBe(callback);
  expect(authorize.searchParams.get('provider')).toBe('google');
  expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
});

test('login error and valid but uninvited session cannot enter app', async ({ page }) => {
  await page.route('http://127.0.0.1:54321/auth/v1/token**', route => route.fulfill({ status: 400, json: { message: 'Invalid login credentials' } }));
  await signIn(page, { succeeds: false });
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await page.unrouteAll();
  mockApi(page, { allowed: false });
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Acceso pendiente o desactivado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salir y cambiar de cuenta' })).toBeVisible();
});

test('admin invitation/deactivation via authenticated RPC; cannot deactivate self', async ({ page }) => {
  const calls = mockApi(page);
  await signIn(page);
  await page.goto('/users.html');
  await expect(page.getByText('2 usuario(s) autorizados.')).toBeVisible();
  await expect(page.locator('.member').first().getByRole('button', { name: 'Desactivar' })).toBeDisabled();
  await page.getByLabel('Correo electrónico').fill('new@example.test');
  await page.getByRole('button', { name: 'Autorizar usuario' }).click();
  await expect.poll(() => calls.length).toBe(1);
  await page.locator('.member').nth(1).getByRole('button', { name: 'Desactivar' }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls).toEqual([['calc3d_invite_user', { invited_email: 'new@example.test' }], ['calc3d_set_user_active', { member_email: 'member@example.test', enabled: false }]]);
});

test('member cannot fetch or change Users list', async ({ page }) => {
  const calls = mockApi(page, { role: 'member' });
  await signIn(page);
  await page.goto('/users.html');
  await expect(page.getByText('Solo administradores pueden consultar Usuarios.')).toBeVisible();
  await expect(page.locator('#admin-content')).toBeHidden();
  expect(calls).toEqual([]);
});
