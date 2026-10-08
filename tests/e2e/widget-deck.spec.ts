import { test, expect } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) test(`portrait visibility lives beside panel controls ${locale} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const dock = page.locator(".dr-widget-deck-tools");
  const hide = dock.getByRole("button", { name: locale === "ru" ? "Скрыть портреты персонажей" : "Hide character portraits" });
  await expect(hide).toBeVisible();
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  await hide.click();
  const show = dock.getByRole("button", { name: locale === "ru" ? "Показать портреты персонажей" : "Show character portraits" });
  await expect(show).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => (window as Window & { portraitsVisible?: boolean }).portraitsVisible)).toBe(false);
  await show.click();
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as Window & { portraitsVisible?: boolean }).portraitsVisible)).toBe(true);
  const box = (await dock.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(width);
});

test("legacy overlaps, pointer collisions and tiny viewport have safe spacing", async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.addInitScript(() => localStorage.setItem("deeprole.widgetLayout.v1", JSON.stringify({ minimized: [], together: false, positions: Object.fromEntries(["dock", "meter", "memory", "characters", "scene", "choices"].map(id => [id, { x: .1, y: .1 }])) })));
  await page.goto("/tests/fixtures/page-widget.html?panels=1&locale=en");
  const overlaps = () => page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])").evaluateAll(nodes => {
    const rects = nodes.map(n => n.getBoundingClientRect());
    return rects.flatMap((a, i) => rects.slice(i + 1).filter(b => a.left < b.right + .5 && a.right + .5 > b.left && a.top < b.bottom + .5 && a.bottom + .5 > b.top)).length;
  });
  await expect(page.locator(".dr-widget-tile")).toHaveCount(5); await expect.poll(overlaps).toBe(0);
  const panel = page.locator('[data-widget="characters"]'); await panel.hover();
  const source = (await panel.boundingBox())!, target = (await page.locator('[data-widget="meter"]').boundingBox())!;
  await page.mouse.move(source.x + 45, source.y + 12); await page.mouse.down(); await page.mouse.move(target.x + 8, target.y + 8, { steps: 8 }); await page.mouse.up();
  await expect.poll(overlaps).toBe(0);
  await panel.hover(); await panel.locator(".dr-widget-tools button").last().click(); await page.locator('[data-restore-widget="characters"]').click();
  await expect.poll(overlaps).toBe(0); await page.screenshot({ path: info.outputPath("safe-panels.png") });
  await page.setViewportSize({ width: 320, height: 400 });
  await expect(page.locator(".dr-widget-deck")).toHaveAttribute("data-overflow", "true"); await expect.poll(overlaps).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("safe-panels-small.png") });
  await page.setViewportSize({ width: 1100, height: 900 }); await expect(page.locator(".dr-widget-deck")).not.toHaveAttribute("data-overflow", "true"); await expect.poll(overlaps).toBe(0);
});

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) test(`independent panels and minimized dock ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const tiles = page.locator(".dr-widget-tile"); await expect(tiles).toHaveCount(5);
  expect((await page.locator(".dr-characters").boundingBox())!.width).toBeLessThanOrEqual(288);
  const dock = (await page.locator(".dr-widget-dock").boundingBox())!, firstTile = (await tiles.first().boundingBox())!;
  expect(firstTile.y - dock.y - dock.height).toBeCloseTo(1, 0);
  await page.screenshot({ path: info.outputPath(`panels-${locale}-${width}.png`) });
  const memory = page.locator('[data-widget="memory"]'); const meter = page.locator('[data-widget="meter"]');
  const before = (await memory.boundingBox())!, meterBefore = (await meter.boundingBox())!;
  await memory.focus(); await memory.press("ArrowRight");
  expect((await memory.boundingBox())!.x).toBeCloseTo(before.x + 8, 0);
  expect((await meter.boundingBox())!.x).toBeCloseTo(meterBefore.x, 0);
  await page.getByRole("button", { name: locale === "ru" ? "Перемещать панели вместе" : "Move panels together", exact: true }).click();
  // Vertical movement has room even on the 320px screen.
  const oldY = (await meter.boundingBox())!.y;
  await memory.press("ArrowDown"); expect((await meter.boundingBox())!.y).toBeCloseTo(oldY + 8, 0);
  for (const id of ["meter", "memory", "choices", "characters", "scene"]) {
    const tile = page.locator(`[data-widget="${id}"]`); await tile.hover(); await tile.locator(".dr-widget-tools button").last().click();
  }
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
  const tile = page.locator('[data-widget="characters"]');
  const before = (await tile.boundingBox())!, handle = (await tile.boundingBox())!;
  await page.mouse.move(handle.x + 45, handle.y + 12); await page.mouse.down(); await page.mouse.move(handle.x + 305, handle.y + 42, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await tile.boundingBox())!.x).toBeCloseTo(before.x + 260, 0);
  const moved = (await tile.boundingBox())!, nextHandle = (await tile.boundingBox())!;
  await page.mouse.move(nextHandle.x + 45, nextHandle.y + 12); await page.mouse.down(); await page.mouse.move(nextHandle.x + 105, nextHandle.y + 62); await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await tile.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.evaluate(() => { (window as any).rejectLayout = true; }); await tile.focus(); await tile.press("ArrowRight");
  await expect(page.getByRole("alert")).toContainText("Couldn’t save"); expect((await tile.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.setViewportSize({ width: 320, height: 600 });
  await expect.poll(async () => { const b = (await tile.boundingBox())!; return b.x + b.width; }).toBeLessThanOrEqual(320);
});

for (const locale of ["ru", "en"]) test(`panel button clicks still work and can also drag ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const panel = page.locator('[data-widget="memory"]'), button = panel.locator(".dr-pill");
  await expect(panel.locator(".dr-widget-move")).toHaveCount(0);
  await button.click(); await expect(button).toHaveAttribute("aria-expanded", "true");
  await button.click(); await expect(button).toHaveAttribute("aria-expanded", "false");
  const before = (await panel.boundingBox())!, source = (await button.boundingBox())!;
  await page.mouse.move(source.x + 15, source.y + 15); await page.mouse.down();
  await page.mouse.move(source.x + 215, source.y + 45, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThan(before.x + 100);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click(); await expect(button).toHaveAttribute("aria-expanded", "true");
});

test("late initialization fits the panel stack back inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 }); await page.goto("/tests/fixtures/page-widget.html?panels=1&locale=en");
  await page.evaluate(() => (window as any).setWidgetState({ pageReady: false, contextPosition: { x: 16, y: 400 } }));
  await expect(page.locator(".dr-widget-deck")).toHaveCount(0);
  await page.evaluate(() => (window as any).setWidgetState({ pageReady: true }));
  await expect.poll(async () => { const rect = (await page.locator('[data-widget="scene"]').boundingBox())!; return rect.y + rect.height; }).toBeLessThanOrEqual(650);
});

test("saved panels stay under the chat title when the sidebar takes space", async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.addInitScript(() => localStorage.setItem("deeprole.widgetLayout.v1", JSON.stringify({ minimized: [], together: false, positions: { dock: { x: .11, y: .1 }, meter: { x: .11, y: .15 }, memory: { x: .11, y: .25 }, characters: { x: .11, y: .34 }, scene: { x: .11, y: .7 } } })));
  await page.goto("/tests/fixtures/page-widget.html?panels=1&locale=ru");
  await page.evaluate(() => {
    const title = document.createElement("div"); title.className = "chat-title"; title.textContent = "История"; title.style.cssText = "position:fixed;left:280px;top:20px;width:120px;height:28px"; document.body.append(title);
    const composer = document.createElement("textarea"); composer.style.cssText = "position:fixed;left:560px;bottom:20px;width:500px;height:70px"; document.body.append(composer);
    window.dispatchEvent(new Event("resize"));
  });
  const panels = page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])");
  await expect.poll(async () => Math.min(...await panels.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left)))).toBeGreaterThanOrEqual(280);
  expect(Math.min(...await panels.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top)))).toBeGreaterThanOrEqual(56);
  await page.screenshot({ path: info.outputPath("sidebar-panels-wide.png") });
  await page.setViewportSize({ width: 640, height: 950 });
  await expect.poll(async () => Math.min(...await panels.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left)))).toBeGreaterThanOrEqual(280);
  await expect.poll(async () => Math.max(...await panels.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().right)))).toBeLessThanOrEqual(640);
  await page.screenshot({ path: info.outputPath("sidebar-panels-compressed.png") });
});

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) test(`panel tools reveal only on their own hover ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const tiles = page.locator(".dr-widget-tile"), tools = page.locator(".dr-widget-tools");
  await expect(tiles).toHaveCount(5);
  const rects = () => tiles.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
  const before = await rects();
  await page.mouse.move(width - 1, 949);
  for (const toolbar of await tools.all()) { await expect(toolbar).toHaveCSS("opacity", "0"); await expect(toolbar).toHaveCSS("pointer-events", "none"); }
  const allGrip = page.locator(".dr-widget-deck-tools>.dr-widget-move");
  await expect(allGrip).toBeVisible(); await expect(allGrip).toHaveCSS("opacity", "1");
  await expect(page.locator(".dr-widget-tile .dr-widget-move")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`panels-idle-${locale}-${width}.png`) });
  for (let i = 0; i < 5; i++) {
    await tiles.nth(i).hover();
    for (let j = 0; j < 5; j++) await expect(tools.nth(j)).toHaveCSS("opacity", i === j ? "1" : "0");
    await expect(allGrip).toHaveCSS("opacity", "1");
  }
  expect(await rects()).toEqual(before);
  const panel = page.locator('[data-widget="characters"]'); await panel.hover();
  await page.screenshot({ path: info.outputPath(`panel-hover-${locale}-${width}.png`) });
  await panel.locator(".dr-widget-tools button").last().click();
  const restore = page.locator('[data-restore-widget="characters"]'); await expect(restore).toBeVisible();
  await page.mouse.move(width - 1, 949); await expect(restore).toHaveCSS("opacity", "1");
  await restore.click(); await expect(panel).toBeVisible();
  // A mouse click can leave focus behind; that alone must not keep tools showing.
  await page.mouse.move(width - 1, 949); await expect(panel.locator(".dr-widget-tools")).toHaveCSS("opacity", "0");
  await page.locator(".dr-widget-dock").hover(); await expect(allGrip).toHaveCSS("opacity", "1");
  await page.mouse.move(width - 1, 949); await expect(allGrip).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab"); await panel.focus();
  await expect(panel).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(panel.locator(".dr-widget-tools")).toHaveCSS("transition-duration", "0s");
});

test("touch panels keep move and minimize controls available", async ({ browser }, info) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 850 } });
  try {
    const page = await context.newPage(); await page.goto("http://127.0.0.1:4173/tests/fixtures/page-widget.html?panels=1&locale=ru");
    expect(await page.evaluate(() => matchMedia("(hover:hover) and (pointer:fine)").matches)).toBe(false);
    const panel = page.locator('[data-widget="characters"]');
    await expect(panel.locator(".dr-widget-tools")).toHaveCSS("opacity", "1");
    await expect(page.locator(".dr-widget-deck-tools>.dr-widget-move")).toHaveCSS("opacity", "1");
    await panel.locator(".dr-widget-tools button").last().tap();
    await page.locator('[data-restore-widget="characters"]').tap(); await expect(panel).toBeVisible();
    await page.screenshot({ path: info.outputPath("touch-panels.png") });
  } finally { await context.close(); }
});
