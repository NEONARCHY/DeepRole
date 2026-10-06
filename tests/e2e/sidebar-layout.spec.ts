import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const adaptive of [false, true]) test(`all floating panels follow the native sidebar ${locale} adaptive=${adaptive}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels&native-sidebar&locale=${locale}${adaptive ? "&adaptive" : ""}`);
  const panels = page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])");
  const geometry = () => panels.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
  await expect.poll(async () => Math.min(...(await geometry()).map(r => r.x))).toBeCloseTo(272, 0);
  const initial = await geometry();
  const beforeStorage = await page.evaluate(() => localStorage.getItem("deeprole.widgetLayout.v1"));
  const samples = await page.evaluate(async () => {
    const result: { boundary: number; left: number }[] = [];
    (window as any).toggleNativeSidebar();
    const started = performance.now();
    while (performance.now() - started < 520) {
      await new Promise(requestAnimationFrame);
      const sidebar = document.querySelector(".native-sidebar")!.getBoundingClientRect();
      result.push({ boundary: Math.max(8, sidebar.right + 8), left: document.querySelector(".dr-widget-dock")!.getBoundingClientRect().left });
    }
    return result;
  });
  await expect.poll(async () => Math.min(...(await geometry()).map(r => r.x))).toBeCloseTo(8, 0);
  const closed = await geometry();
  for (let i = 0; i < initial.length; i++) { expect(closed[i]!.x).toBeCloseTo(initial[i]!.x - 264, 0); expect(closed[i]!.y).toBeCloseTo(initial[i]!.y, 0); }
  expect(new Set(samples.map(sample => Math.round(sample.left))).size).toBeGreaterThan(5);
  // At most a frame behind the native transition; no delayed 350 ms scan or final jump.
  // Our sampling callback can precede the layout callback in the same RAF batch.
  expect(Math.max(...samples.map((sample, i) => Math.min(Math.abs(sample.left - sample.boundary), Math.abs(sample.left - (samples[i - 1]?.boundary ?? initial[0]!.x)))))).toBeLessThan(6);
  expect(await page.evaluate(() => localStorage.getItem("deeprole.widgetLayout.v1"))).toBe(beforeStorage);
  await page.screenshot({ path: info.outputPath("panels-sidebar-hidden.png") });
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await geometry())[0]!.x).toBeCloseTo(initial[0]!.x, 0);
  await expect.poll(geometry).toEqual(initial);
  // A manually shifted panel keeps its offset after either direction and a reload.
  const meter = page.locator('[data-widget="meter"]');
  await meter.focus(); await meter.press("ArrowRight");
  const manual = (await meter.boundingBox())!;
  const saved = await page.evaluate(() => localStorage.getItem("deeprole.widgetLayout.v1"));
  expect(JSON.parse(saved!).anchorX).toBeCloseTo(272 / 1500, 6);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await meter.boundingBox())!.x).toBeCloseTo(manual.x - 264, 0);
  expect(await page.evaluate(() => localStorage.getItem("deeprole.widgetLayout.v1"))).toBe(saved);
  await page.reload();
  await expect.poll(async () => (await meter.boundingBox())!.x).toBeCloseTo(manual.x - 264, 0);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await meter.boundingBox())!.x).toBeCloseTo(manual.x, 0);
  await page.screenshot({ path: info.outputPath("panels-sidebar-restored.png") });
});

for (const locale of ["ru", "en"]) test(`compact dock and minimized panels follow sidebar without overlaps ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`/tests/fixtures/page-widget.html?panels&native-sidebar&adaptive&locale=${locale}`);
  const dock = page.locator(".dr-widget-dock");
  await expect(page.locator(".dr-widget-deck")).toHaveAttribute("data-compact", "true");
  await expect.poll(async () => (await dock.boundingBox())!.x).toBeCloseTo(272, 0);
  await page.locator('[data-restore-widget="characters"]').click();
  const character = page.locator('[data-widget="characters"]'); await expect(character).toBeVisible();
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await dock.boundingBox())!.x).toBeCloseTo(8, 0);
  await expect.poll(async () => (await character.boundingBox())!.x).toBeCloseTo(8, 0);
  const cards = await page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])").evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  expect(cards[1].top).toBeGreaterThanOrEqual(cards[0].bottom);
  expect(Math.max(...cards.map(card => card.right))).toBeLessThanOrEqual(640);
  await page.screenshot({ path: info.outputPath("compact-sidebar-hidden.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await dock.boundingBox())!.x).toBeCloseTo(272, 0);
  await page.screenshot({ path: info.outputPath("compact-sidebar-restored.png") });
});

test("legacy saved coordinates shift together without being rewritten", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  const legacy = { minimized: [], together: false, positions: Object.fromEntries(["dock", "meter", "memory", "choices", "characters", "scene"].map((id, i) => [id, { x: 272 / 1500, y: [70, 108, 200, 250, 300, 710][i]! / 950 }])) };
  await page.addInitScript(value => { if (!localStorage.getItem("deeprole.widgetLayout.v1")) localStorage.setItem("deeprole.widgetLayout.v1", JSON.stringify(value)); }, legacy);
  await page.goto("/tests/fixtures/page-widget.html?panels&native-sidebar&locale=en");
  const panels = page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])");
  const xs = () => panels.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().x));
  await expect.poll(xs).toEqual([272, 272, 272, 272, 272, 272]);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(xs).toEqual([8, 8, 8, 8, 8, 8]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("deeprole.widgetLayout.v1")!))).toEqual(legacy);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(xs).toEqual([272, 272, 272, 272, 272, 272]);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(xs).toEqual([8, 8, 8, 8, 8, 8]);
  await page.getByRole("button", { name: "Move panels together", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("deeprole.widgetLayout.v1")!).anchorX)).toBeCloseTo(272 / 1500, 6);
  await page.reload();
  await expect.poll(xs).toEqual([8, 8, 8, 8, 8, 8]);
});

test("sidebar animation can cross the adaptive breakpoint and be reversed", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 950 });
  await page.goto("/tests/fixtures/page-widget.html?panels&native-sidebar&adaptive&locale=en");
  const deck = page.locator(".dr-widget-deck");
  await expect(deck).toHaveAttribute("data-compact", "true");
  await page.evaluate(async () => {
    (window as any).toggleNativeSidebar();
    for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
    (window as any).toggleNativeSidebar();
  });
  await expect.poll(async () => (await page.locator(".dr-widget-dock").boundingBox())!.x).toBeCloseTo(272, 0);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect(deck).not.toHaveAttribute("data-compact", "true");
  await expect.poll(async () => (await page.locator(".dr-widget-dock").boundingBox())!.x).toBeCloseTo(8, 0);
  await expect(page.locator(".dr-widget-tile:visible")).toHaveCount(5);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect(deck).toHaveAttribute("data-compact", "true");
  await expect.poll(async () => (await page.locator(".dr-widget-dock").boundingBox())!.x).toBeCloseTo(272, 0);
  expect(await page.evaluate(() => localStorage.getItem("deeprole.widgetLayout.v1"))).toBeNull();
});
