import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"]) test(`reset ignores a legacy parent position and keeps 1 px gaps ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto(`/tests/fixtures/page-widget.html?panels&native-sidebar&locale=${locale}`);
  await page.evaluate(() => (window as any).setWidgetState({ contextPosition: { x: 620, y: 130 } }));
  const grip = page.getByRole("button", { name: locale === "ru" ? "Переместить все панели" : "Move all panels", exact: true });
  await grip.focus(); await grip.press("Shift+ArrowRight"); await grip.press("Shift+ArrowDown");
  await page.getByRole("button", { name: locale === "ru" ? "Сбросить расположение панелей" : "Reset panel layout", exact: true }).click();
  const geometry = () => page.locator(".dr-widget-dock,.dr-widget-tile:not([hidden])").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  await expect.poll(async () => (await geometry()).every(rect => Math.abs(rect.x - 272) < 1)).toBe(true);
  const rects = await geometry();
  const titleBottom = await page.locator(".native-chat-title").evaluate(node => node.getBoundingClientRect().bottom);
  expect(rects[0].y).toBeCloseTo(Math.max(48, titleBottom + 8), 0);
  for (let i = 1; i < rects.length; i++) expect(rects[i].top - rects[i - 1].bottom).toBeCloseTo(1, 0);
  const scene = page.locator('[data-widget="scene"] > .scene-controls'); expect((await scene.boundingBox())!.y).toBeCloseTo(rects.at(-1).y, 0);
  await page.evaluate(() => (window as any).toggleNativeSidebar());
  await expect.poll(async () => (await geometry()).every(rect => Math.abs(rect.x - 8) < 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("reset-sidebar-hidden.png") });
});

for (const locale of ["ru", "en"]) for (const width of [360, 1500]) test(`connected memory matches the deck and fills available height ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/page-widget.html?panels&locale=${locale}${width > 1000 ? "&native-sidebar" : ""}`);
  await page.locator('[data-widget="memory"] > button').click();
  await page.evaluate(() => (window as any).setWidgetState({ selection: { estimatedTokens: 2000, omittedCount: 43, entries: Array.from({ length: 40 }, (_, i) => ({ entry: { id: String(i), title: "Очень_длинное_название_записи_без_пробелов_".repeat(3), content: "A long memory about the current story. ".repeat(7), activation: "always" }, score: 10, reasons: ["always"], estimatedTokens: 50 })) } }));
  const memory = page.locator(".dr-connected-memory"), meter = page.locator(".dr-chat-meter");
  await expect(memory).toBeVisible();
  await expect.poll(async () => (await memory.boundingBox())!.width).toBeCloseTo((await meter.boundingBox())!.width, 0);
  const rect = (await memory.boundingBox())!; expect(rect.y + rect.height).toBeCloseTo(892, 0); expect(rect.x + rect.width).toBeLessThanOrEqual(width - 8);
  expect(await memory.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  // Headless Firefox forces every scrollbar-width to none (even inline !important).
  // Check the declared rule there; normal Firefox was also probed and reports thin.
  expect(await memory.evaluate(node => [...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule instanceof CSSStyleRule && rule.selectorText.includes(".dr-root") && node.matches(rule.selectorText) && rule.style.scrollbarWidth === "thin")))).toBe(true);
  expect(await memory.evaluate(node => getComputedStyle(node).scrollbarColor)).toContain("rgba(0, 0, 0, 0)");
  await memory.focus(); await memory.press("End");
  // Native keyboard scrolling is animated in Chromium; wait for End to finish
  // before sending the opposite direction instead of racing its first frame.
  await expect.poll(() => memory.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(1);
  await expect(memory.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true })).toBeInViewport();
  await expect(memory).toBeFocused(); await memory.press("Home"); await expect.poll(() => memory.evaluate(node => node.scrollTop)).toBeLessThan(1);
  const axe = await new AxeBuilder({ page }).include(".dr-connected-memory").withTags(["wcag2a", "wcag2aa"]).analyze(); expect(axe.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("connected-memory.png") });
  if (width > 1000) { await page.evaluate(() => (window as any).toggleNativeSidebar()); await expect.poll(async () => (await memory.boundingBox())!.x).toBeCloseTo(8, 0); }
});

for (const locale of ["ru", "en"]) for (const width of [360, 1280]) test(`branded dropdown stays inside the viewport and preserves editor keyboard UX ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: locale === "ru" ? "В сцене" : "In scene", exact: true }).click();
  const mood = dialog.getByRole("combobox", { name: locale === "ru" ? "Настроение" : "Mood", exact: true }); const before = await mood.inputValue();
  await mood.click(); const menu = dialog.getByRole("listbox"); await expect(menu).toBeVisible(); await expect(mood).toBeFocused();
  await mood.press("End"); expect(await mood.inputValue()).toBe(before); await mood.press("Escape"); await expect(menu).toHaveCount(0); await expect(dialog).toBeVisible(); expect(await mood.inputValue()).toBe(before);
  await mood.press("ArrowDown"); await mood.press("Home"); await mood.press("ArrowDown"); await mood.press("Enter"); await expect(mood).toHaveValue("happy");
  await mood.click(); const rect = (await menu.boundingBox())!; expect(rect.x).toBeGreaterThanOrEqual(8); expect(rect.x + rect.width).toBeLessThanOrEqual(width - 8); expect(rect.y).toBeGreaterThanOrEqual(8); expect(rect.y + rect.height).toBeLessThanOrEqual(792);
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze(); expect(axe.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("editor-dropdown.png") });
  await mood.press("Escape"); await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
  await expect(dialog.locator("footer [role=status]")).toContainText(locale === "ru" ? "Сохранено" : "Saved");
  expect(await page.evaluate(() => (window as any).saved.state.emotion)).toBe("happy");
});

for (const locale of ["ru", "en"]) test(`long dropdown works inside a shadow root without moving the chat ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 600 }); await page.goto(`/tests/fixtures/select.html?locale=${locale}`);
  const picker = page.getByRole("combobox"); await picker.click(); const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible(); expect((await menu.boundingBox())!.y + (await menu.boundingBox())!.height).toBeLessThan((await picker.boundingBox())!.y);
  await picker.press("End"); await expect(menu.getByRole("option", { selected: true })).toContainText("99"); expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => menu.evaluate(node => node.scrollTop)).toBeGreaterThan(100);
  await picker.press("Escape"); await expect(picker).toHaveValue("0"); await picker.press("ArrowDown"); await picker.press("ArrowDown"); await picker.press("Enter"); await expect(picker).toHaveValue("2");
  await picker.click(); await menu.evaluate(node => { node.scrollTop = 50 * 36; });
  const longOption = menu.getByRole("option").filter({ hasText: "long_unbroken_name" }); await longOption.scrollIntoViewIfNeeded();
  expect(await menu.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); await longOption.click(); await expect(picker).toHaveValue("50");
  await picker.click(); await picker.press("End"); await picker.press("Tab"); await expect(picker).toHaveValue("99"); await expect(menu).toHaveCount(0); await expect(page.getByRole("button")).toBeFocused();
  await picker.click(); await picker.press("Home"); await page.mouse.click(350, 20); await expect(picker).toHaveValue("99"); await expect(menu).toHaveCount(0);
  await picker.click(); await picker.press("Home"); await page.screenshot({ path: info.outputPath("shadow-menu-above.png") });
  await picker.press("Escape"); await page.getByRole("button").click(); await expect(picker).toBeDisabled();
});
