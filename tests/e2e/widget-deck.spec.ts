import { test, expect } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) test(`independent panels and minimized dock ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const tiles = page.locator(".dr-widget-tile"); await expect(tiles).toHaveCount(5);
  expect((await page.locator(".dr-characters").boundingBox())!.width).toBeLessThanOrEqual(288);
  await page.screenshot({ path: info.outputPath(`panels-${locale}-${width}.png`) });
  const memory = page.locator('[data-widget="memory"]'); const meter = page.locator('[data-widget="meter"]');
  const before = (await memory.boundingBox())!, meterBefore = (await meter.boundingBox())!;
  const grip = memory.locator(".dr-widget-move");
  await grip.focus(); await grip.press("ArrowRight");
  expect((await memory.boundingBox())!.x).toBeCloseTo(before.x + 8, 0);
  expect((await meter.boundingBox())!.x).toBeCloseTo(meterBefore.x, 0);
  await page.getByRole("button", { name: locale === "ru" ? "Перемещать панели вместе" : "Move panels together", exact: true }).click();
  // Vertical movement has room even on the 320px screen.
  const oldY = (await meter.boundingBox())!.y;
  await grip.press("ArrowDown"); expect((await meter.boundingBox())!.y).toBeCloseTo(oldY + 8, 0);
  for (const id of ["meter", "memory", "choices", "characters", "scene"]) await page.locator(`[data-widget="${id}"] .dr-widget-tools button`).last().click();
  const buttons = page.locator("[data-restore-widget]"); await expect(buttons).toHaveCount(5);
  const boxes = await buttons.evaluateAll(nodes => nodes.map(n => ({ y: n.getBoundingClientRect().y, right: n.getBoundingClientRect().right })));
  expect(new Set(boxes.map(b => b.y)).size).toBe(1); expect(Math.max(...boxes.map(b => b.right))).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath(`dock-${locale}-${width}.png`) });
  await page.reload(); await expect(buttons).toHaveCount(5);
  await page.locator('[data-restore-widget="characters"]').click(); await expect(page.locator(".dr-characters")).toBeVisible();
  await page.locator(".dr-character-row").click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: locale === "ru" ? "Сбросить расположение панелей" : "Reset panel layout" }).click();
  await expect(buttons).toHaveCount(0); await expect(page.locator('[data-widget]:visible')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("panel pointer drag, cancel, failed persistence and viewport clamp", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 }); await page.goto("/tests/fixtures/page-widget.html?panels=1&locale=en");
  const tile = page.locator('[data-widget="characters"]'), grip = tile.locator(".dr-widget-move");
  const before = (await tile.boundingBox())!, handle = (await grip.boundingBox())!;
  await page.mouse.move(handle.x + 10, handle.y + 10); await page.mouse.down(); await page.mouse.move(handle.x + 270, handle.y + 40, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await tile.boundingBox())!.x).toBeCloseTo(before.x + 260, 0);
  const moved = (await tile.boundingBox())!, nextHandle = (await grip.boundingBox())!;
  await page.mouse.move(nextHandle.x + 10, nextHandle.y + 10); await page.mouse.down(); await page.mouse.move(nextHandle.x + 70, nextHandle.y + 60); await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await tile.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.evaluate(() => { (window as any).rejectLayout = true; }); await grip.press("ArrowRight");
  await expect(page.getByRole("alert")).toContainText("Couldn’t save"); expect((await tile.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.setViewportSize({ width: 320, height: 600 });
  await expect.poll(async () => { const b = (await tile.boundingBox())!; return b.x + b.width; }).toBeLessThanOrEqual(320);
});

test("late initialization fits the panel stack back inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 }); await page.goto("/tests/fixtures/page-widget.html?panels=1&locale=en");
  await page.evaluate(() => (window as any).setWidgetState({ pageReady: false, contextPosition: { x: 16, y: 400 } }));
  await expect(page.locator(".dr-widget-deck")).toHaveCount(0);
  await page.evaluate(() => (window as any).setWidgetState({ pageReady: true }));
  await expect.poll(async () => { const rect = (await page.locator('[data-widget="scene"]').boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(650);
});
