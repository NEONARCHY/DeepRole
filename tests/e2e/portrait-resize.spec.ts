import { expect, test, type Locator, type Page } from "@playwright/test";

async function stretch(page: Page, widget: Locator, dy: number) {
  await widget.hover();
  const handle = (await widget.locator(".dr-cast-resize").boundingBox())!;
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  const right = page.viewportSize()!.width - 4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Never drag outside the page: Firefox stops delivering input there. A pinned
  // portrait near the composer can grow horizontally before keyboard resizing.
  await page.mouse.move(Math.min(right, x + dy * .75), y, { steps: 12 });
  await page.mouse.up();
}

for (const locale of ["ru", "en"]) for (const pinned of [false, true]) for (const adaptive of [false, true]) {
  test(`manual portrait fills the viewport and survives synchronization ${locale} pinned=${pinned} adaptive=${adaptive}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1800, height: 960 });
    await page.goto(`/tests/fixtures/adaptive-scene.html?resize&locale=${locale}${pinned ? "&pinned" : ""}`);
    await page.waitForFunction(() => !!(window as any).setAdaptive);
    await page.evaluate(({ adaptive, pinned }) => { (window as any).setAdaptive(adaptive); (window as any).setPortraitPins(pinned); }, { adaptive, pinned });
    const widget = page.locator('.dr-cast-widget[data-character-id="1"]');
    await expect(widget.locator("img")).toHaveAttribute("src", /data:image/);
    const original = await page.evaluate(() => (window as any).getCastSnapshot());
    await page.locator("textarea").fill("Unsent draft.");
    const before = (await widget.boundingBox())!;
    await stretch(page, widget, 440);
    await expect.poll(async () => (await widget.boundingBox())!.width).toBeGreaterThan(360);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("poses") ?? "null")?.positions["1"]?.manualSize)).toBe(true);
    const stretched = (await widget.boundingBox())!;
    expect(stretched.width).toBeGreaterThan(before.width + 100);
    // Fixture synchronizes every 250 ms, like repeated scene updates in the real client.
    await expect.poll(async () => { await page.waitForTimeout(600); return (await widget.boundingBox())!.width; }).toBeCloseTo(stretched.width, 0);
    await widget.locator(".dr-cast-resize").focus();
    for (let step = 0; step < 50; step++) await page.keyboard.press("Shift+ArrowDown");
    const large = (await widget.boundingBox())!;
    expect(large.height).toBeGreaterThan(925);
    expect(large.height).toBeLessThanOrEqual(945);
    expect(large.y).toBeGreaterThanOrEqual(7);
    expect(large.y + large.height).toBeLessThanOrEqual(953);
    expect(large.width).toBeGreaterThan(600);
    await expect(widget.locator(".dr-cast-resize")).toBeInViewport();
    const saved = await page.evaluate(() => localStorage.getItem("poses"));
    await widget.screenshot({ path: info.outputPath("viewport-height-portrait.png") });
    await page.reload();
    await expect.poll(async () => (await widget.boundingBox())?.width).toBeCloseTo(large.width, 0);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect.poll(async () => (await widget.boundingBox())!.width).toBeLessThanOrEqual(304);
    const narrow = (await widget.boundingBox())!;
    expect(narrow.x).toBeGreaterThanOrEqual(7); expect(narrow.x + narrow.width).toBeLessThanOrEqual(313);
    expect(narrow.y + narrow.height).toBeLessThanOrEqual(793);
    await expect(widget.locator(".dr-cast-resize")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("poses"))).toBe(saved);
    await page.setViewportSize({ width: 1800, height: 960 });
    await expect.poll(async () => (await widget.boundingBox())!.width).toBeCloseTo(large.width, 0);
    await page.mouse.move(1400, 200); await page.mouse.wheel(0, 500);
    await expect.poll(async () => (await widget.boundingBox())!.width).toBeCloseTo(large.width, 0);
    expect(await page.evaluate(() => (window as any).getCastSnapshot())).toEqual(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

for (const locale of ["ru", "en"]) test(`portrait resize cancels, rolls back failed saves and resets cleanly ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 960 });
  await page.goto(`/tests/fixtures/adaptive-scene.html?resize&locale=${locale}`);
  const widget = page.locator('.dr-cast-widget[data-character-id="1"]');
  await expect(widget).toBeVisible(); await widget.hover();
  const original = (await widget.boundingBox())!;
  const handle = (await widget.locator(".dr-cast-resize").boundingBox())!;
  await page.mouse.move(handle.x + 22, handle.y + 22); await page.mouse.down();
  await page.mouse.move(handle.x + 240, handle.y + 22, { steps: 8 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(async () => (await widget.boundingBox())!.width).toBeCloseTo(original.width, 0);
  expect(await page.evaluate(() => localStorage.getItem("poses"))).toBe(null);
  await page.evaluate(() => (window as any).rejectPortraitLayout = true);
  await stretch(page, widget, 440);
  await expect.poll(async () => (await widget.boundingBox())!.width).toBeCloseTo(original.width, 0);
  expect(await page.evaluate(() => localStorage.getItem("poses"))).toBe(null);
  await page.evaluate(() => { (window as any).rejectPortraitLayout = false; (window as any).delayPortraitLayout = 400; });
  await stretch(page, widget, 440);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("poses") ?? "null")?.positions["1"]?.manualSize)).toBe(true);
  await expect.poll(async () => (await widget.boundingBox())!.width).toBeGreaterThan(360);
  await page.evaluate(() => (window as any).setAdaptive(false));
  const reset = page.getByRole("button", { name: locale === "ru" ? "Сбросить расстановку" : "Reset layout", exact: true });
  await expect(reset).toBeVisible(); await reset.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("poses") ?? "null")?.positions)).toEqual({});
  await expect.poll(async () => (await widget.boundingBox())!.width).toBeLessThanOrEqual(192);
  await expect(page.locator(".dr-cast-manual-frame .dr-cast-widget")).toHaveCount(0);
});

test("enlarging the hero keeps automatic bystanders in their lane and new poses in the same scope", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 960 });
  await page.goto("/tests/fixtures/adaptive-scene.html?resize&pinned");
  const hero = page.locator('.dr-cast-widget[data-character-id="0"]');
  await expect(hero).toBeVisible(); await stretch(page, hero, 440);
  await expect(page.locator('.dr-cast-manual-frame .dr-cast-widget[data-character-id="0"]')).toBeVisible();
  await expect.poll(async () => (await hero.boundingBox())!.width).toBeGreaterThan(360);
  const lane = page.locator(".dr-cast-frame");
  await expect(lane.locator(".dr-cast-widget")).toHaveCount(3);
  for (const portrait of await lane.locator(".dr-cast-widget").all()) {
    const rect = (await portrait.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(7); expect(rect.x + rect.width).toBeLessThanOrEqual(1793);
  }
  const before = await page.evaluate(() => localStorage.getItem("poses"));
  await hero.locator(".dr-cast-move").focus(); await hero.locator(".dr-cast-move").press("Shift+ArrowDown");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("poses"))).not.toBe(before);
  const moved = (await hero.boundingBox())!;
  await page.reload();
  await expect.poll(async () => (await hero.boundingBox())!.width).toBeCloseTo(moved.width, 0);
});
