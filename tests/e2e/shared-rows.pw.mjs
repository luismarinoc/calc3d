import { signedInTest as test, expect } from './supabase-fixture.mjs';

const rows = [
  [['title'], ['hours', 'minutes'], ['multiplierPreset']],
  [['purpose', 'client-toggle'], ['printerProfile'], ['discountType', 'discountValue']],
  [['spoolId'], ['errorPercent'], []],
  [['purchasePrice', 'netWeightGrams'], ['extraProductionCost'], ['surchargeType', 'surchargeValue']],
];

async function geometry(page) {
  const box = async id => page.locator(`#${id}`).boundingBox();
  for (const group of rows) {
    const boxes = (await Promise.all(group.flat().map(box)));
    for (const control of boxes) expect(control.height).toBeGreaterThanOrEqual(44);
    for (const [index, control] of boxes.entries()) {
      if (!index) continue;
      const first = boxes[0];
      const delta = group.flat()[index] === 'client-toggle'
        ? Math.abs(control.y + control.height - first.y - first.height)
        : Math.abs(control.y - first.y);
      expect(delta, `${group.flat().join(', ')} control baseline`).toBeLessThanOrEqual(1);
    }
    // Wrapped captions and the material heading can start at different heights;
    // controls still share a baseline and every caption retains its own close gap.
  }
  const [a, b, c] = await Promise.all(['#title', '.time-pair', '#multiplierPreset'].map(selector => page.locator(selector).boundingBox()));
  expect(a.width, 'equal desktop columns').toBeCloseTo(b.width, 0);
  expect(a.width, 'equal desktop columns').toBeCloseTo(c.width, 0);
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(c.x).toBeGreaterThan(b.x + b.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
}

test('Material and bobina remain below Trabajo in the first column at wide widths', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  const stylesheets = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/src/styles.css')) stylesheets.push(response.status());
  });
  await page.goto('/');
  for (const width of [1280, 1440, 1575]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    const [work, title, purpose, material, spool, bobina, discount] = await Promise.all([
      '#work-heading', '#title', '#purpose', '#material-heading', '#spoolId', 'label[for="spoolId"]', '#discountType',
    ].map((selector) => page.locator(selector).boundingBox()));
    const placement = await page.locator('.material-start').evaluate((element) => ({
      column: getComputedStyle(element).gridColumnStart,
      row: getComputedStyle(element).gridRowStart,
      stylesheet: document.querySelector('link[rel="stylesheet"]').href,
    }));
    console.log(`${width}px Material placement`, { work, title, purpose, material, spool, discount, placement, stylesheets });
    await page.screenshot({ path: info.outputPath(`material-${width}.png`), fullPage: true });
    expect(Math.abs(material.x - title.x), `${width}px Material in Trabajo column`).toBeLessThanOrEqual(2);
    expect(Math.abs(spool.x - title.x), `${width}px bobina in Trabajo column`).toBeLessThanOrEqual(2);
    expect(Math.abs(bobina.x - purpose.x), `${width}px bobina below purpose`).toBeLessThanOrEqual(2);
    expect(material.y).toBeGreaterThan(work.y + work.height);
    expect(material.y).toBeGreaterThan(purpose.y + purpose.height);
    expect(spool.y).toBeGreaterThan(material.y + material.height);
    expect(spool.x + spool.width).toBeLessThan(discount.x);
    expect(placement.column).toBe('1');
    expect(placement.row).toBe('4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  expect(stylesheets).toContain(200);
});

test('each visible desktop caption hugs its own control', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/');
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    for (const id of rows.flat(2).filter(id => id !== 'client-toggle')) {
      const gap = await page.locator(`label[for="${id}"]`).evaluate((label, controlId) => {
        const text = label.firstChild;
        const range = document.createRange();
        range.selectNodeContents(text);
        return document.getElementById(controlId).getBoundingClientRect().top - range.getBoundingClientRect().bottom;
      }, id);
      expect(gap, `${width}px ${id} caption-to-control gap`).toBeGreaterThanOrEqual(4);
      expect(gap, `${width}px ${id} caption-to-control gap`).toBeLessThanOrEqual(8);
    }
  }
});

test('real shared horizontal rows align desktop controls and captions', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-desktop');
  await page.goto('/');
  // Avoid measuring one control before and another after authenticated data mounts.
  await expect(page.locator('#spoolId option')).toHaveCount(2);
  await geometry(page);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 900 });
    await geometry(page);
    for (const id of ['extraProductionCost', 'save']) await expect(page.locator(`#${id}`)).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(page.viewportSize().height);
    await page.screenshot({ path: info.outputPath(`shared-${width}.png`) });
  }
  await page.locator('#multiplierPreset').selectOption('custom');
  await expect(page.locator('#customMultiplier')).toBeVisible();
  await expect(page.locator('#discountType')).toBeInViewport();
  await page.locator('#client-toggle').click();
  await expect(page.locator('#client-name')).toBeVisible();
  await expect(page.locator('#client-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#purpose').selectOption('gift');
  await expect(page.locator('#commercial')).toHaveAttribute('disabled', '');
  await expect(page.locator('#multiplierPreset')).toBeDisabled();
  await expect(page.locator('#discountType')).toBeDisabled();
  await expect(page.locator('#save')).toBeVisible();
});

test('responsive layout keeps every field reachable without horizontal overflow', async ({ page }, info) => {
  test.skip(info.project.name === 'chromium-desktop');
  await page.goto('/');
  for (const id of ['title', 'spoolId', 'grams', 'hours', 'extraProductionCost', 'multiplierPreset', 'save']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await page.screenshot({ path: info.outputPath(`shared-${info.project.name}.png`), fullPage: true });
});
