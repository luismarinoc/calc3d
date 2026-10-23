import { signedInTest as test, expect, remoteQuotes, remotePrinterState } from './supabase-fixture.mjs';

const fields = { watts: '87', electricityPricePerKwh: '231', replacementCost: '198000', replacementLifetimeHours: '3600' };
async function configure(page, name, values = fields) {
  await page.goto('/settings.html');
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill(name);
  for (const [key, value] of Object.entries(values)) await page.locator(`#printer-${key}`).fill(value);
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  const printer = (await remotePrinterState(page)).printers.at(-1);
  await page.locator('#active-printer').selectOption(printer.id);
  await page.locator('#activate-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('activa');
  return printer;
}
test('S2: choosing non-active installed A saves its snapshot while B stays active', async ({ page }) => {
  const a = await configure(page, 'A seleccionada', { ...fields, watts: '77' });
  const b = await configure(page, 'B activa');
  expect(a.modelId).toBe(b.modelId);
  await page.goto('/');
  await page.locator('#title').fill('Cotización previa de B');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const prior = (await remoteQuotes(page))[0];
  await page.locator('#printerProfile').selectOption(a.id);
  await expect(page.locator('#watts')).toHaveValue('77');
  await page.locator('#title').fill('Cotización de A sin cambiar la activa');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000002');
  const quotes = await remoteQuotes(page);
  expect(quotes).toHaveLength(2);
  expect(quotes[1]).toEqual(prior);
  expect(quotes[0].form).toMatchObject({ printerInstanceId: a.id, printerName: a.name,
    printerModelId: a.modelId, watts: '77', electricityPricePerKwh: '231',
    replacementCost: '198000', replacementLifetimeHours: '3600' });
  expect(quotes[0].input.watts).toBe(77);
  expect((await remotePrinterState(page)).activeId).toBe(b.id);
});

test('S4: compact aligned controls without redundant data-used note', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Configuración · Bobinas e impresoras' })).toBeVisible();
  await expect(page.locator('#printer-name-current')).toBeHidden();
  await expect(page.getByText('Datos usados:', { exact: false })).toHaveCount(0);
  await expect(page.locator('#printerProfile')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const visibleControl = id => page.locator(id === 'spoolId' ? '.calculator-spool-picker .spool-picker-trigger' : `#${id}`);
  if (info.project.name === 'chromium-desktop') {
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      const heading = await page.locator('#material-heading').boundingBox();
      const spoolLabel = await page.locator('label[for="spoolId"]').boundingBox();
      expect(spoolLabel.y - (heading.y + heading.height)).toBeGreaterThanOrEqual(0);
      expect(spoolLabel.y - (heading.y + heading.height)).toBeLessThanOrEqual(20);
      for (const id of ['spoolId', 'errorPercent', 'surchargeValue']) {
        const control = await visibleControl(id).boundingBox();
        const gap = await page.locator(`label[for="${id}"]`).evaluate((element, id) => {
          const range = document.createRange();
          range.selectNodeContents(element.firstChild);
          const visible = id === 'spoolId' ? document.querySelector('.calculator-spool-picker .spool-picker-trigger') : document.getElementById(id);
          return visible.getBoundingClientRect().top - range.getBoundingClientRect().bottom;
        }, id);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(gap).toBeGreaterThanOrEqual(4);
        expect(gap).toBeLessThanOrEqual(8);
      }
      // Row 5 aligns grams, production costs and surcharge controls.
      for (const ids of [['spoolId', 'errorPercent'], ['grams', 'extraProductionCost', 'surchargeType', 'surchargeValue']]) {
        const bottoms = await Promise.all(ids.map(async id => {
          const box = await visibleControl(id).boundingBox(); return box.y + box.height;
        }));
        expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(width === 1280 ? 800 : 900);
      await page.screenshot({ path: info.outputPath(`compact-${width}.png`), fullPage: true });
    }
  } else {
    for (const id of ['printerProfile', 'spoolId', 'grams', 'save']) {
      await visibleControl(id).scrollIntoViewIfNeeded();
      await expect(visibleControl(id)).toBeInViewport();
    }
    await page.screenshot({ path: info.outputPath(`compact-${info.project.name}.png`), fullPage: true });
  }
});

test('S1-S3: ten copies of A, B active, subsequent edit and immutable historical copy', async ({ page }, testInfo) => {
  const a = await configure(page, 'Impresora A');
  await page.goto('/');
  await expect(page.locator('#printerProfile')).toHaveValue(a.id);
  await expect(page.locator('#printer-name-current')).toContainText('Impresora A');
  for (const key of Object.keys(fields)) await expect(page.locator(`#${key}`)).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('calculator-1280-or-device.png'), fullPage: true });
  for (let i = 0; i < 10; i++) {
    await page.locator('#title').fill(`A ${i + 1}`);
    await page.locator('#save').click();
    await expect(page.locator('#feedback')).toContainText(`COT-${String(i + 1).padStart(6, '0')}`);
  }
  const ten = await remoteQuotes(page);
  const b = await configure(page, 'Impresora B', { watts: '0', electricityPricePerKwh: '0', replacementCost: '0', replacementLifetimeHours: '5000' });
  await page.goto('/');
  await expect(page.locator('#printerProfile')).toHaveValue(b.id);
  await page.locator('#title').fill('B 1');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000011');
  const records = await remoteQuotes(page);
  expect(records).toHaveLength(11);
  expect(records.slice(1).map(record => record.form.printerInstanceId)).toEqual(Array(10).fill(a.id));
  for (const record of records.slice(1)) {
    expect(record.form.printerName).toBe('Impresora A');
    expect(record.form.printerModelId).toBe(a.modelId);
    for (const [key, value] of Object.entries(fields)) expect(record.form[key]).toBe(value);
    expect(record.input.watts).toBe(87);
    expect(record.result.totalCost).toBeGreaterThan(0);
  }
  expect(records[0].form.printerInstanceId).toBe(b.id);
  expect(records[0].input.watts).toBe(0);
  await page.goto('/settings.html');
  await page.locator('#active-printer').selectOption(a.id);
  await page.locator('#edit-printer').click();
  await page.locator('#printer-name').fill('A renombrada');
  await page.locator('#printer-watts').fill('190');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  await page.goto('/');
  expect(await remoteQuotes(page)).toEqual(records);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item').last()).toContainText('Impresora A');
  await page.locator('.history-item').last().getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printer-name-current')).toContainText('Impresora A');
  await expect(page.locator('#watts')).toHaveValue('87');
  expect(await remoteQuotes(page)).toEqual(records);
  await page.reload();
  await expect(page.locator('#printer-name-current')).toContainText('Impresora B');
  await page.screenshot({ path: testInfo.outputPath('draft-after-reload.png'), fullPage: true });
  expect(ten).toHaveLength(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('S1/S2: denied configuration read disables new saves without modifying quote records', async ({ page, remote }) => {
  const before = await remoteQuotes(page);
  remote.fail = '/rest/v1/calc3d_printer_settings';
  await page.reload();
  await expect(page.locator('#form-error')).toContainText('No se pudieron cargar datos remotos');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await remoteQuotes(page)).toEqual(before);
  await page.goto('/settings.html');
  await expect(page.locator('#settings-error')).toContainText('No se pudo leer la configuración');
  await expect(page.locator('#save-printer')).toBeDisabled();
  expect(await remoteQuotes(page)).toEqual(before);
});

test('S1/S2: invalid configuration and remote conflict never confirm a write; legacy remains unassociated', async ({ page, remote }) => {
  await page.goto('/settings.html');
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill('Vacía');
  await page.locator('#printer-watts').fill('');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('Potencia');
  expect(await remotePrinterState(page)).toBeNull();
  await page.locator('#printer-watts').fill('0');
  await page.locator('#printer-replacementLifetimeHours').fill('0');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('Vida útil');
  expect(await remotePrinterState(page)).toBeNull();
  await page.locator('#printer-replacementLifetimeHours').fill('4320');
  remote.fail = '/rpc/calc3d_save_printers';
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('Network denied');
  expect(await remotePrinterState(page)).toBeNull();
  remote.fail = null;
  await page.goto('/');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const saved = (await remoteQuotes(page))[0];
  const legacy = structuredClone(saved);
  legacy.id = 'legacy-copy'; legacy.number = 'COT-000002';
  for (const key of ['printerInstanceId', 'printerName', 'printerModelId']) delete legacy.form[key];
  legacy.form.watts = '7'; legacy.form.electricityPricePerKwh = '3';
  remote.quotes.unshift({ ...remote.quotes[0], id: legacy.id, number: legacy.number, form: legacy.form });
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.locator('.history-item').first().getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printer-name-current')).toContainText('Sin perfil instalado');
  await expect(page.locator('#watts')).toHaveValue('7');
  expect((await remoteQuotes(page))[0]).toEqual(legacy);
});
