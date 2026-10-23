import { test, expect, signIn, remoteQuotes, remoteRows } from './supabase-fixture.mjs';

const material = page => page.locator('#result-content .result-row').filter({ has: page.getByText('Material', { exact: true }) });

test('S1-S3: owned presentation prices drafts, while saved copies keep their original material', async ({ page, remote }) => {
  await signIn(page, { withProfile: false });
  await expect(page.locator('#spoolId option')).toHaveCount(0);
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#spool-info a[href="./settings.html"]')).toHaveText('Configurar bobinas');
  expect(await remoteQuotes(page)).toEqual([]);
  expect(remote.number).toBe(0);
  remote.brands = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_id: remote.user.id,
    name: 'Marca propia', normalized_name: 'marca propia', aliases: ['marca propia'], color: '#123456',
    revision: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }];
  await page.goto('/settings.html');
  await expect(page.locator('#save-spool')).toBeEnabled();
  await page.locator('#spool-name').fill('PETG 1 kg');
  await page.locator('#spool-material').fill('PETG');
  await page.locator('#spool-brandId').selectOption(remote.brands[0].id);
  await page.locator('#spool-purchasePrice').fill('21900');
  await page.locator('#spool-netWeightGrams').fill('1000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  const [profile] = await remoteRows(page, 'spool_profiles');
  await page.goto('/');
  await expect(page.locator('#spoolId')).toHaveValue(`profile:${profile.id}`);
  await expect(page.locator('#quote-form #purchasePrice, #quote-form #netWeightGrams')).toHaveCount(0);
  await expect(page.locator('#spool-info')).not.toContainText(/precio de adquisición|peso inicial adquirido/i);
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(material(page)).toContainText('1.095');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const saved = await remoteQuotes(page);
  expect(saved[0].input.spool).toEqual({ purchasePrice: 21900, netWeightGrams: 1000 });
  expect(saved[0].form).toMatchObject({ spoolId: `profile:${profile.id}`, purchasePrice: 21900, netWeightGrams: 1000 });
  expect(saved[0].result.breakdown.material).toBe(1095);
  await page.goto('/settings.html');
  await page.locator('#edit-spool').click();
  await page.locator('#spool-purchasePrice').fill('30000');
  await page.locator('#save-spool').click();
  await expect(page.locator('#spool-feedback')).toContainText('guardada');
  await page.goto('/');
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#grams').fill('50');
  await page.locator('#hours').fill('0');
  await page.locator('#minutes').fill('0');
  await expect(material(page)).toContainText('1.500');
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(material(page)).toContainText('1.095');
  await page.locator('#printerProfile').selectOption({ index: 0 });
  await expect(material(page)).toContainText('1.095');
  expect(await remoteQuotes(page)).toEqual(saved);
});
