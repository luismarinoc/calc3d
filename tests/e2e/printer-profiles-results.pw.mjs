import { signedInTest as test, expect, remoteQuotes, remotePurchases } from './supabase-fixture.mjs';
import { setPrinterCosts } from './printer-fixtures.mjs';

const bytes = async page => [await remoteQuotes(page), await remotePurchases(page)];
const result = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });

test('two installed instances of the same model remain separately selectable without writes', async ({ page }, info) => {
  await page.goto('/');
  const before = await bytes(page);
  const ids = [];
  for (const [name, watts] of [['Taller norte', null], ['Taller sur', '177']]) {
    await page.goto('/settings.html');
    await page.locator('#new-printer').click();
    await page.locator('#printer-name').fill(name);
    if (watts) await page.locator('#printer-watts').fill(watts);
    await page.locator('#save-printer').click();
    await expect(page.locator('#settings-feedback')).toContainText('guardada');
    const { remotePrinterState } = await import('./supabase-fixture.mjs');
    ids.push((await remotePrinterState(page)).printers.at(-1).id);
  }
  await page.goto('/');
  const printer = page.locator('#printerProfile');
  const unchanged = await bytes(page);
  for (const [id, watts, name] of [[ids[0], '130', 'Taller norte'], [ids[1], '177', 'Taller sur']]) {
    await printer.selectOption(id);
    await expect(page.locator('#watts')).toHaveValue(watts);
    await expect(page.locator('#printer-name-current')).toHaveText(name);
    expect(await bytes(page)).toEqual(unchanged);
  }
  expect(ids[0]).not.toBe(ids[1]);
  expect(before).toEqual([[], []]);
  await page.screenshot({ path: info.outputPath('installed-printers.png') });
});

test('new saved quote pins instance and params, legacy copy never invents a matching identity', async ({ page }) => {
  await page.goto('/');
  await page.locator('#save').click();
  await expect(page.locator('#feedback')).toContainText('COT-000001');
  const saved = await bytes(page);
  const record = saved[0][0];
  expect(record.form.printerInstanceId).toBe('demo-printer-p2s');
  expect(record.form.printerName).toBe('Bambu Lab P2S (de ejemplo)');
  expect(record.form.watts).toBe('130');
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printerProfile')).toHaveValue('demo-printer-p2s');
  expect(await bytes(page)).toEqual(saved);
  const variant = structuredClone(record);
  for (const key of ['printerInstanceId', 'printerName', 'printerModelId']) delete variant.form[key];
  variant.form.watts = '173';
  const { remoteForPage } = await import('./supabase-fixture.mjs');
  const remote = remoteForPage(page);
  remote.quotes[0] = { ...remote.quotes[0], form: variant.form };
  await page.reload();
  const previous = await bytes(page);
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printerProfile')).toHaveValue('historical-unassociated');
  await expect(page.locator('#watts')).toHaveValue('173');
  await expect(page.locator('#printer-name-current')).toContainText('Sin perfil instalado');
  expect(await bytes(page)).toEqual(previous);
});

test('reference costs, semantic hierarchy, non-sale expenses and compact bounds', async ({ page }, info) => {
  await page.goto('/');
  await setPrinterCosts(page, { electricityPricePerKwh: 230 });
  for (const [id, value] of Object.entries({ purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0' })) await page.locator(`#${id}`).fill(value);
  await expect(result(page, 'Costo total')).toContainText('7.725');
  await expect(result(page, 'Precio final estimado')).toContainText('15.450');
  await expect(result(page, 'Costo total')).toHaveClass(/cost-total/);
  await expect(result(page, 'Precio final estimado')).toHaveClass(/sale-total/);
  const style = await result(page, 'Precio final estimado').evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, font: parseFloat(getComputedStyle(element.querySelector('strong')).fontSize) }));
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.font).toBeGreaterThan(18);
  const before = await bytes(page);
  for (const [purpose, label] of [['gift', 'Costo de regalo estimado'], ['internal', 'Gasto interno estimado']]) {
    await page.locator('#purpose').selectOption(purpose);
    await expect(result(page, label)).toHaveClass(/expense-total/);
    await expect(result(page, 'Precio final estimado')).toHaveCount(0);
    await expect(result(page, 'Ganancia estimada')).toHaveCount(0);
    expect(await bytes(page)).toEqual(before);
  }
  if (info.project.name === 'chromium-desktop') {
    await page.locator('#purpose').selectOption('sale');
    const measurements = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }));
    expect(measurements.height).toBeLessThanOrEqual(800);
    expect(measurements.width).toBeLessThanOrEqual(1280);
    for (const id of ['printerProfile', 'errorPercent', 'save']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThanOrEqual(800);
    }
    expect((await page.locator('.result').boundingBox()).y + (await page.locator('.result').boundingBox()).height).toBeLessThanOrEqual(800);
  } else {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    await page.locator('#extraProductionCost').scrollIntoViewIfNeeded();
    await expect(page.locator('#extraProductionCost')).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('result-hierarchy.png') });
});
