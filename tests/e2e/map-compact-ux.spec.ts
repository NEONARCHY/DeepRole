import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const [width, height] of [[320, 600], [420, 600], [760, 600], [1024, 600], [1024, 480]]) test(`scene settings do not consume the split canvas (${locale}, ${width}x${height})`, async ({ page }, info) => {
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.setViewportSize({ width: width!, height: height! });
  await page.goto("/tests/fixtures/sidepanel.html?world");
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    await repository.mergeRecords([
      { kind: "entry", id: "scene-rule", data: { id: "scene-rule", worldId: "world-a", bookId: null, title: "Tower rule", content: "The tower opens at dawn.", keywords: [], activation: "always", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 } },
      { kind: "entry", id: "forest-rule", data: { id: "forest-rule", worldId: "world-b", bookId: null, title: "Forest rule", content: "The path leads north.", keywords: [], activation: "always", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 } },
      ...Array.from({ length: 30 }, (_, i) => ({ kind: "entity" as const, id: `actor-${i}`, data: { id: `actor-${i}`, worldId: "world-a", kind: "character", name: `Actor ${i + 1}`, description: "Neutral test character", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 } })),
    ]);
  });
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
  await page.getByRole("button", { name: l("Открыть карту мира", "Open world map"), exact: true }).click();
  const map = page.getByRole("dialog", { name: l("Карта мира", "World map"), exact: true });
  await map.getByRole("button", { name: l("Два мира рядом", "Two worlds"), exact: true }).click();
  const left = map.locator('[data-map-pane="0"]');
  const canvas = left.locator(".lm-viewport"); const paneBefore = (await left.boundingBox())!.height; const canvasBefore = (await canvas.boundingBox())!.height;
  await left.getByRole("button", { name: /^Сцена|^Scene/ }).click();
  await expect(left.locator(".scene-focus-panel")).toBeVisible();
  await page.screenshot({ path: info.outputPath("scene-settings-open.png") });
  expect((await canvas.boundingBox())!.height).toBeCloseTo(canvasBefore, 0);
  expect((await left.boundingBox())!.height).toBeCloseTo(paneBefore, 0);
  await left.getByRole("combobox", { name: l("Книги мира", "World books"), exact: true }).focus();
  await page.keyboard.press("Escape"); await expect(map).toBeVisible(); await expect(left.locator(".scene-focus-panel")).toHaveCount(0);
  await expect(left.getByRole("button", { name: /^Сцена|^Scene/ })).toBeFocused();
  await left.getByRole("button", { name: /^Сцена|^Scene/ }).click();
  await left.locator(".lm-chat-world").click(); await expect(left.locator(".scene-focus-panel")).toHaveCount(0);
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(170);
  const bounds = (await canvas.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width!);
  for (const control of await left.locator(".lm-map-view-tools button, .lm-map-view-tools output").all()) {
    const zoom = (await control.boundingBox())!;
    for (const action of await left.locator(".lm-history-tools button").all()) { const history = (await action.boundingBox())!; expect(zoom.x + zoom.width <= history.x + 1 || history.x + history.width <= zoom.x + 1 || zoom.y + zoom.height <= history.y + 1 || history.y + history.height <= zoom.y + 1).toBe(true); }
  }
  const paneBounds = (await left.boundingBox())!;
  for (const button of await left.locator(".lm-tools button").all()) { const rect = (await button.boundingBox())!; expect(rect.x).toBeGreaterThanOrEqual(paneBounds.x); expect(rect.x + rect.width).toBeLessThanOrEqual(paneBounds.x + paneBounds.width); }
  await page.screenshot({ path: info.outputPath("split-map.png") });
  const audit = await new AxeBuilder({ page }).include(".dr-map-workspace").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze(); expect(audit.violations).toEqual([]);
});
