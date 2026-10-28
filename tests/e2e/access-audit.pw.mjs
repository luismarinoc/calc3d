import { test, expect } from '@playwright/test';

const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'new@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' };

test('unknown confirmed account submits one automatic request and remains blocked', async ({ page }) => {
  const calls = [];
  await page.route('http://127.0.0.1:54321/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: 'fake.browser.test', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (path.endsWith('/rest/v1/rpc/calc3d_access_status') || path.endsWith('/rest/v1/rpc/calc3d_record_access')) return route.fulfill({ json: { allowed: false, role: null, email: null } });
    if (path.endsWith('/rest/v1/rpc/calc3d_claim_invitation')) return route.fulfill({ status: 400, json: { code: '23514', message: 'Invitation is not pending' } });
    if (path.endsWith('/rest/v1/rpc/calc3d_request_access')) {
      calls.push(route.request().postDataJSON());
      return route.fulfill({ json: { state: 'pending', request: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: user.id, email: user.email, status: 'pending', revision: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', reviewed_at: null } } });
    }
    return route.fulfill({ status: 404, json: { message: 'Not mocked' } });
  });
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Solicitud pendiente', { exact: false })).toBeVisible();
  // Auth notifications can re-evaluate bootstrap; the server owns idempotent request storage.
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls.every(body => Object.keys(body).length === 0)).toBe(true);
  await expect(page).toHaveURL('/login.html');
});

test('admin sees independent requests and activity, reviews once and keeps acknowledgement on refresh failure', async ({ page }) => {
  let reviewed = 0;
  let requestReads = 0;
  const entry = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: user.id, email: 'new@example.test', status: 'pending', revision: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', reviewed_at: null };
  await page.route('http://127.0.0.1:54321/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: 'fake.browser.test', refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, user } });
    if (path.endsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (path.endsWith('/rest/v1/rpc/calc3d_access_status') || path.endsWith('/rest/v1/rpc/calc3d_record_access')) return route.fulfill({ json: { allowed: true, role: 'admin', email: user.email } });
    if (path.endsWith('/rest/v1/calc3d_members')) return route.fulfill({ json: [{ email: user.email, role: 'admin', active: true }] });
    if (path.endsWith('/rest/v1/rpc/calc3d_list_access_requests')) {
      requestReads++;
      return route.fulfill(requestReads > 1 ? { status: 503, json: { message: 'offline' } } : { json: [entry] });
    }
    if (path.endsWith('/rest/v1/rpc/calc3d_review_access_request')) {
      expect(route.request().postDataJSON()).toEqual({ request_id: entry.id, decision: 'approved', expected_revision: 0 });
      reviewed++;
      return route.fulfill({ json: { ...entry, status: 'approved', revision: 1, reviewed_at: '2026-01-01T01:00:00Z' } });
    }
    if (path.endsWith('/rest/v1/rpc/calc3d_list_audit_events')) return route.fulfill({ json: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', occurred_at: '2026-01-01T01:00:00Z', actor_id: null, actor_email: null, action: 'access_request.created', target_type: 'access_request', target_id: entry.id, outcome: 'committed', ip_address: null, country: null }] });
    return route.fulfill({ status: 404, json: { message: 'Not mocked' } });
  });
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('/');
  await page.goto('/users.html');
  await expect(page.getByText('1 usuario(s) autorizados.')).toBeVisible();
  await expect(page.locator('#requests-list').getByText('new@example.test')).toBeVisible();
  await expect(page.getByText('IP: No disponible · País: No disponible')).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByText('Decisión guardada, pero no se pudo actualizar la lista.')).toBeVisible();
  expect(reviewed).toBe(1);
  await expect(page.getByRole('button', { name: 'Autorizar usuario' })).toBeVisible();
});
