import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("side panel meets the automated WCAG 2.2 AA baseline", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.locator(".play-view")).toBeVisible();
  // Assess the finished UI, not a random frame of its entrance fade.
  await page.locator(".play-view").evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
});

test("keyboard focus is visible and reduced-motion preference is respected", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.getByText("DeepRole", { exact: true }).first()).toBeVisible();
  await page.locator(".app-header strong").click();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");
  const animation = await page.locator(".play-view").evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
});

test("tutorial preset dialog meets the automated WCAG 2.2 AA baseline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await page.locator(".lore-list-options > summary").click();
  await page.getByRole("button", { name: "Посмотреть пример", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Учебный пресет" })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
});

test("the in-page context indicator has no automated WCAG AA violations", async ({ page }, testInfo) => {
  await page.goto("/tests/fixtures/page-widget.html");
  await expect(page.getByRole("button", { name: "Открыть меню DeepRole", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeVisible();
  await expect(page.locator(".dr-alert")).toHaveCount(0);
  const contextBox = await page.getByRole("button", { name: /^Контекст/ }).boundingBox();
  expect(contextBox?.x).toBeGreaterThanOrEqual(200);
  expect(contextBox?.y).toBeLessThan(150); // Includes the panel-layout toolbar.
  await page.screenshot({ path: testInfo.outputPath("deeprole-header-context.png"), fullPage: true });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
});

test("the context indicator can be moved anywhere without opening it", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/tests/fixtures/page-widget.html");
  const indicator = page.getByRole("button", { name: /^Контекст/ });
  const before = await indicator.boundingBox();
  expect(before).not.toBeNull();
  const grip = page.locator('[data-widget="memory"] .dr-widget-move');
  const handle = (await grip.boundingBox())!;
  await grip.hover();
  await page.mouse.down();
  await page.mouse.move(700, 500, { steps: 8 });
  await page.mouse.up();
  const after = await indicator.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x + 700 - handle.x - handle.width / 2, 0);
  expect(after!.y).toBeCloseTo(before!.y + 500 - handle.y - handle.height / 2, 0);
  await expect(page.locator(".dr-panel")).toHaveCount(0);
  const saved = await page.evaluate(() => (window as any).savedWidgetLayout.positions.memory);
  const tile = (await page.locator('[data-widget="memory"]').boundingBox())!;
  expect(saved?.x).toBeCloseTo(tile.x / 1000, 2);
  expect(saved?.y).toBeCloseTo(tile.y / 700, 2);
});

test("the DeepRole menu stays anchored, lets DeepSeek controls receive clicks, and closes only by X or Escape", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tests/fixtures/page-widget.html");
  const launcher = page.locator(".dr-launcher");
  await expect(launcher).toHaveAccessibleName("Открыть меню DeepRole");
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".dr-menu-drawer")).toHaveCount(0);
  const widthBefore = await page.evaluate(() => document.documentElement.clientWidth);
  const positionBefore = await launcher.boundingBox();
  await launcher.click();
  await expect(page.locator(".dr-menu-drawer iframe")).toBeVisible();
  await expect(page.locator(".dr-launcher")).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(widthBefore);
  await page.screenshot({ path: testInfo.outputPath("deeprole-overlay-menu.png"), fullPage: true });
  const box = await launcher.boundingBox();
  const drawerBox = await page.locator(".dr-menu-drawer").boundingBox();
  expect(box).not.toBeNull();
  expect(drawerBox).not.toBeNull();
  expect(positionBefore).not.toBeNull();
  // Firefox can report fractional coordinates during the click transition;
  // keep the anchoring check strict without requiring identical float bits.
  for (const dimension of ["x", "y", "width", "height"] as const) {
    expect(box![dimension]).toBeCloseTo(positionBefore![dimension], 1);
  }
  expect(box?.y ?? 100).toBeLessThan(40);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(drawerBox?.x ?? 0);
  await page.locator("#underlying-chat-control").click();
  await expect(page.locator("body")).toHaveAttribute("data-chat-control-clicked", "true");
  await expect(page.locator(".dr-menu-drawer")).toBeVisible();
  await page.frameLocator(".dr-menu-drawer iframe").getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".dr-menu-drawer")).toHaveCount(0);
  await expect(page.locator(".dr-launcher")).toHaveAttribute("aria-expanded", "false");
  await launcher.click();
  await page.frameLocator(".dr-menu-drawer iframe").getByRole("button", { name: "Игра", exact: true }).press("Escape");
  await expect(page.locator(".dr-menu-drawer")).toHaveCount(0);
  await launcher.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".dr-menu-drawer")).toHaveCount(0);
  await launcher.click();
  await page.locator("#underlying-chat-control").click();
  await expect(page.locator(".dr-menu-drawer")).toBeVisible();
});
