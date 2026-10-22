import { test, expect } from './supabase-fixture.mjs';

const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

async function paint(page) {
  return page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    const bounds = selector => document.querySelector(selector).getBoundingClientRect();
    // Read rendered sRGB pixels so OKLCH and rgb computed colors use the same contrast calculation.
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d');
    const luminance = value => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
        const x = channel / 255;
        return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
      }).reduce((sum, x, index) => sum + x * [.2126, .7152, .0722][index], 0);
    };
    return {
      canvas: style('body').backgroundColor,
      panel: style('.auth-card').backgroundColor,
      input: style('#email').backgroundColor,
      text: style('body').color,
      muted: style('.subtle').color,
      primary: style('#google-login').backgroundColor,
      primaryText: style('#google-login').color,
      headingSize: parseFloat(style('#login-heading').fontSize),
      bodySize: parseFloat(style('body').fontSize),
      top: bounds('.auth-top').bottom,
      heading: bounds('#login-heading').top,
      card: bounds('.auth-card').toJSON(),
      button: bounds('#google-login').toJSON(),
      overflow: document.documentElement.scrollWidth > innerWidth,
      contrast: {
        canvas: [luminance(style('body').color), luminance(style('body').backgroundColor)],
        muted: [luminance(style('.subtle').color), luminance(style('.auth-card').backgroundColor)],
        button: [luminance(style('#google-login').color), luminance(style('#google-login').backgroundColor)],
        input: luminance(style('#email').backgroundColor),
      },
    };
  });
}

test('logged-out entry is a dark, legible workshop surface with clear primary action', async ({ page }, info) => {
  await page.goto('/login.html');
  await expect(page.locator('#login-status')).toHaveText('Inicia sesión para continuar.');
  await expect(page.locator('#google-login')).toBeVisible();
  await expect(page.locator('#denied-actions')).toBeHidden();
  const colors = await paint(page);
  console.log(`BEFORE/AFTER ${info.project.name} ${JSON.stringify(colors)}`);
  await page.screenshot({ path: info.outputPath('login-entry.png'), fullPage: true });
  expect(colors.contrast.canvas[1]).toBeLessThan(.08);
  expect(colors.contrast.muted[1]).toBeLessThan(.13);
  expect(colors.contrast.input).toBeLessThan(.16);
  for (const pair of [colors.contrast.canvas, colors.contrast.muted, colors.contrast.button]) expect(contrast(...pair)).toBeGreaterThanOrEqual(4.5);
  expect(colors.headingSize / colors.bodySize).toBeGreaterThanOrEqual(2.25);
  expect(colors.heading - colors.top).toBeGreaterThan(60);
  expect(colors.button.height).toBeGreaterThanOrEqual(44);
  expect(colors.card.width).toBeLessThanOrEqual(650);
  expect(colors.overflow).toBe(false);
  await page.locator('#google-login').focus();
  expect(await page.locator('#google-login').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.getByText('Entrar con correo y contraseña').click();
  await expect(page.locator('#password-form')).toBeVisible();
  expect(await page.locator('#email').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#denied-actions')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('narrow entry keeps Google, optional password and brand reachable without sideways scrolling', async ({ page }, info) => {
  if (info.project.name === 'chromium-desktop') await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/login.html');
  await expect(page.locator('#login-status')).toHaveText('Inicia sesión para continuar.');
  await page.getByText('Entrar con correo y contraseña').click();
  const colors = await paint(page);
  console.log(`NARROW ${info.project.name} ${JSON.stringify(colors)}`);
  await page.screenshot({ path: info.outputPath('login-phone.png'), fullPage: true });
  expect(colors.contrast.canvas[1]).toBeLessThan(.08);
  expect(colors.overflow).toBe(false);
  expect(colors.card.left).toBeGreaterThanOrEqual(0);
  expect(colors.card.right).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  expect(colors.button.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#google-login')).toBeVisible();
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#denied-actions')).toBeHidden();
  await page.locator('#email').focus();
  expect(await page.locator('#email').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
});
