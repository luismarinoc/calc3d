import { test, expect } from './supabase-fixture.mjs';

test('confirmed pending fake invitation admits only after claim and fresh access check', async ({ page, remote }) => {
  remote.allowed = false;
  remote.pending = true;
  await page.goto('/login.html');
  await page.getByText('Entrar con correo y contraseña').click();
  await page.getByLabel('Correo', { exact: true }).fill('member@example.test');
  await page.getByLabel('Contraseña').fill('fake-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.account-nav')).toBeVisible();
  const calls = remote.calls.map(({ pathname }) => pathname);
  const claim = calls.indexOf('/rest/v1/rpc/calc3d_claim_invitation');
  expect(claim).toBeGreaterThan(0);
  expect(calls.slice(0, claim)).toContain('/rest/v1/rpc/calc3d_access_status');
  expect(calls.slice(claim + 1)).toContain('/rest/v1/rpc/calc3d_access_status');
  expect(remote.pending).toBe(false);
});
