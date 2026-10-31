import { signedInTest as test, expect } from './supabase-fixture.mjs';
test('late catalog results remain reachable when scrolling the ready mobile layout', async ({ page, remote }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const stored = JSON.stringify([remote.profiles, remote.quotes, remote.number]);
  let release;
  remote.holdProfiles = new Promise(resolve => { release = resolve; });
  const title = page.locator('#title');
  const measure = () => page.evaluate(() => {
    const r = document.querySelector('#title').getBoundingClientRect();
    return { titleTop: r.top, titleBottom: r.bottom, scrollY, height: innerHeight,
      resultHeight: document.querySelector('#result-content').getBoundingClientRect().height };
  });
  try {
    await page.goto('/');
    await expect(page.locator('#result-content')).toBeEmpty();
    await expect(title).toBeVisible();
    await title.scrollIntoViewIfNeeded();
    const before = await measure();
    release(); remote.holdProfiles = null;
    await expect(page.locator('#result-content')).not.toBeEmpty();
    const after = await measure();
    console.log('DELAYED_RESULTS_GEOMETRY', JSON.stringify({ before, after }));
    expect(before.resultHeight).toBe(0);
    expect(after.resultHeight).toBeGreaterThan(0);
    // Reproduce the late expansion, then measure only after the final layout is ready.
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(JSON.stringify([remote.profiles, remote.quotes, remote.number])).toBe(stored);
    expect(remote.calls.filter(call => /\/rpc\/calc3d_(save|archive)/.test(call.pathname))).toHaveLength(0);
  } finally { release(); remote.holdProfiles = null; }
});
