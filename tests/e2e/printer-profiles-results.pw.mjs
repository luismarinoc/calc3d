import { test, expect } from '@playwright/test';

const keys = ['calc3d.demo.quotes.v1', 'calc3d.demo.purchases.v1', 'calc3d.demo.prints.v1'];
const bytes = (page) => page.evaluate((names) => names.map((key) => localStorage.getItem(key)), keys);
const result = (page, label) => page.locator('#result-content .result-row').filter({ has: page.getByText(label, { exact: true }) });
const examples = { a1: 95, 'a1-mini': 45, p1p: 80, p1s: 100, 'x1-carbon': 120, p2s: 130, h2s: 210 };

test('profiles fill estimates; manual edits choose custom without saving', async ({ page }, info) => {
  await page.goto('/');
  const before = await bytes(page);
  const model = page.locator('#printerProfile');
  const power = page.locator('#watts');
  await expect(model).toHaveValue('p2s');
  await expect(power).toHaveValue('130');
  for (const [id, watts] of Object.entries(examples)) {
    await model.selectOption(id);
    await expect(power).toHaveValue(String(watts));
    expect(await bytes(page)).toEqual(before);
  }
  await power.fill('177');
  await expect(model).toHaveValue('custom');
  await model.selectOption('custom');
  await expect(power).toHaveValue('177');
  expect(await bytes(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath('printer-profile.png') });
});

test('saved profile copies preserve power; old and disagreeing forms reopen custom without changing bytes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#save').click();
  const saved = await bytes(page);
  const record = JSON.parse(saved[0])[0];
  expect(record.form.printerProfile).toBe('p2s');
  expect(record.form.watts).toBe('130');
  await page.reload();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Abrir copia' }).click();
  await expect(page.locator('#printerProfile')).toHaveValue('p2s');
  await expect(page.locator('#watts')).toHaveValue('130');
  expect(await bytes(page)).toEqual(saved);
  for (const [profile, watts] of [[undefined, '173'], ['p2s', '171']]) {
    const variant = structuredClone(record);
    if (profile === undefined) delete variant.form.printerProfile;
    else variant.form.printerProfile = profile;
    variant.form.watts = watts;
    await page.evaluate((value) => localStorage.setItem('calc3d.demo.quotes.v1', JSON.stringify([value])), variant);
    await page.reload();
    const before = await bytes(page);
    await expect(page.locator('#printerProfile')).toHaveValue('p2s');
    await page.getByRole('tab', { name: 'Historial' }).click();
    await page.getByRole('button', { name: 'Abrir copia' }).click();
    await expect(page.locator('#printerProfile')).toHaveValue('custom');
    await expect(page.locator('#watts')).toHaveValue(watts);
    expect(await bytes(page)).toEqual(before);
  }
});

test('reference costs, semantic hierarchy, non-sale expenses and compact bounds', async ({ page }, info) => {
  await page.goto('/');
  for (const [id, value] of Object.entries({ purchasePrice: '22000', netWeightGrams: '1000', grams: '294', hours: '11', minutes: '0', electricityPricePerKwh: '230' })) await page.locator(`#${id}`).fill(value);
  await expect(result(page, 'Costo total')).toContainText('7.724,94');
  await expect(result(page, 'Precio final estimado')).toContainText('15.449,88');
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
    for (const id of ['printerProfile', 'watts', 'replacementLifetimeHours', 'errorPercent', 'save']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThanOrEqual(800);
    }
    expect((await page.locator('.result').boundingBox()).y + (await page.locator('.result').boundingBox()).height).toBeLessThanOrEqual(800);
  } else {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
    await page.locator('details summary').click();
    await page.locator('#extraProductionCost').scrollIntoViewIfNeeded();
    await expect(page.locator('#extraProductionCost')).toBeInViewport();
  }
  await page.screenshot({ path: info.outputPath('result-hierarchy.png') });
});
