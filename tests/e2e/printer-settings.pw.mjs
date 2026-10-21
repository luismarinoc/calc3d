import { test, expect } from '@playwright/test';
const quotesKey = 'calc3d.demo.quotes.v1';
const settingsKey = 'calc3d.printer.settings.v1';
const stored = (page, key) => page.evaluate((key) => localStorage.getItem(key), key);
const fields = { watts: '87', electricityPricePerKwh: '231', replacementCost: '198000', replacementLifetimeHours: '3600' };
async function configure(page, name, values = fields) {
  await page.goto('/settings.html');
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill(name);
  for (const [key, value] of Object.entries(values)) await page.locator(`#printer-${key}`).fill(value);
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  const state = JSON.parse(await stored(page, settingsKey));
  const printer = state.printers.at(-1);
  await page.locator('#active-printer').selectOption(printer.id);
  await page.locator('#activate-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('activa');
  return printer;
}
test('S2: choosing non-active installed A saves its snapshot while B stays active', async ({ page }) => {
  const a = await configure(page, 'A seleccionada', { watts: '77', electricityPricePerKwh: '231', replacementCost: '198000', replacementLifetimeHours: '3600' });
  const b = await configure(page, 'B activa');
  expect(a.modelId).toBe(b.modelId);
  await page.goto('/');
  await page.locator('#title').fill('Cotización previa de B');
  await page.locator('#save').click();
  const prior = JSON.parse(await stored(page, quotesKey))[0];
  await page.locator('#printerProfile').selectOption(a.id);
  await expect(page.locator('#printerProfile')).toHaveValue(a.id);
  await expect(page.locator('#watts')).toHaveValue('77');
  await page.locator('#title').fill('Cotización de A sin cambiar la activa');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000002');
  const quotes = JSON.parse(await stored(page, quotesKey));
  expect(quotes).toHaveLength(2);
  expect(quotes[1]).toEqual(prior);
  expect(quotes[0].form).toMatchObject({ printerInstanceId: a.id, printerName: a.name,
    printerModelId: a.modelId, watts: '77', electricityPricePerKwh: '231',
    replacementCost: '198000', replacementLifetimeHours: '3600' });
  expect(quotes[0].input.watts).toBe(77);
  expect(JSON.parse(await stored(page, settingsKey)).activeId).toBe(b.id);
});

test('S4: compact aligned controls without redundant data-used note', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Configuración · Impresoras' })).toBeVisible();
  await expect(page.locator('#printer-name-current')).toBeHidden();
  await expect(page.getByText('Datos usados:', { exact: false })).toHaveCount(0);
  await expect(page.locator('#printerProfile')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'chromium-desktop') {
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
      const heading = await page.locator('#material-heading').boundingBox();
      const spoolLabel = await page.locator('label[for="spoolId"]').boundingBox();
      expect(spoolLabel.y - (heading.y + heading.height), 'Material heading near bobina').toBeGreaterThanOrEqual(0);
      expect(spoolLabel.y - (heading.y + heading.height), 'Material heading near bobina').toBeLessThanOrEqual(20);
      for (const id of ['spoolId', 'errorPercent', 'surchargeValue']) {
        const input = page.locator(`#${id}`);
        const control = await input.boundingBox();
        const label = page.locator(`label[for="${id}"]`);
        const gap = await label.evaluate((element, id) => {
          const range = document.createRange();
          range.selectNodeContents(element.firstChild);
          return document.getElementById(id).getBoundingClientRect().top - range.getBoundingClientRect().bottom;
        }, id);
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(gap).toBeGreaterThanOrEqual(4);
        expect(gap).toBeLessThanOrEqual(8);
      }
      for (const ids of [['spoolId', 'errorPercent'], ['purchasePrice', 'netWeightGrams', 'extraProductionCost', 'surchargeValue']]) {
        const bottoms = await Promise.all(ids.map(async id => {
          const box = await page.locator(`#${id}`).boundingBox(); return box.y + box.height;
        }));
        expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(width === 1280 ? 800 : 900);
      await page.screenshot({ path: info.outputPath(`compact-${width}.png`), fullPage: true });
    }
  } else {
    for (const id of ['printerProfile', 'spoolId', 'grams', 'save']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await page.screenshot({ path: info.outputPath(`compact-${info.project.name}.png`), fullPage: true });
  }
});

test('S1-S3: diez copias de A, B activo, edición posterior y copia histórica inmutable', async ({ page }, testInfo) => {
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
  const tenBytes = await stored(page, quotesKey);
  const b = await configure(page, 'Impresora B', { watts: '0', electricityPricePerKwh: '0', replacementCost: '0', replacementLifetimeHours: '5000' });
  await page.goto('/');
  await expect(page.locator('#printerProfile')).toHaveValue(b.id);
  await page.locator('#title').fill('B 1');
  await page.locator('#save').click();
  const records = JSON.parse(await stored(page, quotesKey));
  expect(records).toHaveLength(11);
  expect(records.slice(1).map((record) => record.form.printerInstanceId)).toEqual(Array(10).fill(a.id));
  for (const record of records.slice(1)) {
    expect(record.form.printerName).toBe('Impresora A');
    expect(record.form.printerModelId).toBe(a.modelId);
    for (const [key, value] of Object.entries(fields)) expect(record.form[key]).toBe(value);
    expect(record.input.watts).toBe(87);
    expect(record.result.totalCost).toBeGreaterThan(0);
  }
  expect(records[0].form.printerInstanceId).toBe(b.id);
  expect(records[0].form.printerName).toBe('Impresora B');
  expect(records[0].input.watts).toBe(0);
  await page.goto('/settings.html');
  await page.locator('#active-printer').selectOption(a.id);
  await page.locator('#edit-printer').click();
  await page.locator('#printer-name').fill('A renombrada');
  await page.locator('#printer-watts').fill('190');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('guardada');
  await page.goto('/');
  expect(JSON.parse(await stored(page, quotesKey))).toEqual(records);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await expect(page.locator('.history-item').last()).toContainText('Impresora A');
  await page.locator('.history-item').last().getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printer-name-current')).toContainText('Impresora A');
  await expect(page.locator('#printerProfile')).toHaveValue(a.id);
  await expect(page.locator('#watts')).toHaveValue('87');
  expect(JSON.parse(await stored(page, quotesKey))).toEqual(records);
  await page.reload();
  await expect(page.locator('#printer-name-current')).toContainText('Impresora B');
  await page.screenshot({ path: testInfo.outputPath('draft-after-reload.png'), fullPage: true });
  expect(JSON.parse(tenBytes)).toHaveLength(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('S1/S2: denied configuration read disables new saves without modifying quote bytes', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw Error('denied');
      return original.call(this, name);
    };
  }, settingsKey);
  await page.goto('/');
  await expect(page.locator('#form-error')).toContainText('La configuración de impresoras no se puede leer');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await stored(page, quotesKey)).toBeNull();
  await page.goto('/settings.html');
  await expect(page.locator('#settings-error')).toContainText('no se puede leer');
  await expect(page.locator('#save-printer')).toBeDisabled();
  expect(await stored(page, quotesKey)).toBeNull();
});

test('S1/S2: invalid configuration cannot write, corrupt settings cannot save quotes; legacy stays unassociated', async ({ page }, testInfo) => {
  await page.goto('/settings.html');
  const before = await stored(page, settingsKey);
  await page.locator('#new-printer').click();
  await page.locator('#printer-name').fill('Vacía');
  await page.locator('#printer-watts').fill('');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('Potencia');
  expect(await stored(page, settingsKey)).toBe(before);
  await page.locator('#printer-watts').fill('0');
  await page.locator('#printer-replacementLifetimeHours').fill('0');
  await page.locator('#save-printer').click();
  await expect(page.locator('#settings-feedback')).toContainText('Vida útil');
  expect(await stored(page, settingsKey)).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true });
  await page.goto('/');
  await page.locator('#save').click();
  const previous = JSON.parse(await stored(page, quotesKey));
  const legacy = structuredClone(previous[0]);
  delete legacy.form.printerInstanceId;
  delete legacy.form.printerName;
  delete legacy.form.printerModelId;
  legacy.id = 'legacy-copy'; legacy.number = 'COT-000002';
  legacy.form.watts = '7'; legacy.form.electricityPricePerKwh = '3';
  await page.evaluate(([key, rows]) => localStorage.setItem(key, JSON.stringify(rows)), [quotesKey, [legacy, ...previous]]);
  await page.evaluate((key) => localStorage.setItem(key, '{bad'), settingsKey);
  await page.reload();
  await expect(page.locator('#save')).toBeDisabled();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.locator('.history-item').first().getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printer-name-current')).toContainText('Sin perfil instalado');
  await expect(page.locator('#watts')).toHaveValue('7');
  await expect(page.locator('#save')).toBeDisabled();
  expect(await stored(page, settingsKey)).toBe('{bad');
  expect(JSON.parse(await stored(page, quotesKey))).toEqual([legacy, ...previous]);
});
