import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { selfieImageKey } from "../../src/core/selfies";
import { characterTab, closeSavedCharacter } from "./character-helpers";

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test(`ready selfie library reuse and two-method explanation ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await expect(page.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible();
  const sources = await page.evaluate(() => Array.from({ length: 28 }, (_, i) => {
    const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = `hsl(${i * 17},45%,45%)`; ctx.fillRect(0, 0, 120, 160);
    ctx.fillStyle = "#fff"; ctx.font = "24px system-ui"; ctx.fillText(String(i + 1), 20, 90);
    return canvas.toDataURL("image/png");
  }));
  await page.evaluate(({ sources, referenceKey }) => {
    const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((person: any) => person.id === "mira" ? { ...person, characterSheet: { ...person.characterSheet,
      sprites: { neutral: [sources[0]], happy: sources.slice(1, 3) }, portraitLibrary: sources.slice(3),
      imageGeneration: { canonical: "Original face", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey },
      selfieCategories: [{ id: "regular", name: "Regular", description: "At home", default: true, minTrust: 40, minAffinity: 30, images: [sources[0]] }],
    } } : person) });
  }, { sources, referenceKey: selfieImageKey(sources[0]!) });
  const before = await page.evaluate(() => (window as any).getCast());
  const ui = locale === "ru" ? { pick: "Выбрать из библиотеки", more: "Показать ещё", add: "Добавить выбранные", remove: "Убрать фото из подборки", save: "Сохранить персонажа", cancel: "Отменить выбор" } : { pick: "Choose from library", more: "Show more", add: "Add selected", remove: "Remove photo from collection", save: "Save character", cancel: "Cancel selection" };
  const open = async () => { await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); await characterTab(page.locator(".dr-character-dialog"), "images", locale); };
  await open(); const editor = page.locator(".dr-character-dialog"), categories = editor.locator(".dr-selfie-categories");
  const methods = editor.locator(".dr-selfie-methods");
  await expect(methods).toContainText(locale === "ru" ? "без генерации ИИ" : "no AI image generation");
  await expect(methods).toContainText(locale === "ru" ? "Новое фото · генерация ИИ" : "New photo · AI image generation");
  await expect(methods).toContainText(locale === "ru" ? "Вы сами просите фото" : "You request a photo yourself");
  await editor.locator(".dr-selfie-collections>summary").click();
  const opener = categories.getByRole("button", { name: ui.pick, exact: true }); await opener.click();
  const picker = categories.locator(".dr-selfie-library-picker"), tiles = picker.locator(".dr-selfie-library-grid button");
  await expect(tiles).toHaveCount(24); await tiles.first().click(); await tiles.first().press("Escape");
  await expect(picker).toHaveCount(0); await expect(editor).toBeVisible(); await expect(opener).toBeFocused();
  await expect(categories.locator(".dr-selfie-thumbnails img")).toHaveCount(1);
  await opener.click(); await expect(picker.getByRole("button", { name: ui.add + " · 0", exact: true })).toBeDisabled();
  await tiles.first().focus(); await tiles.first().press("Space"); await expect(tiles.first()).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: ui.more + " · 24/28", exact: true }).click();
  await expect(tiles).toHaveCount(28); await expect(tiles.nth(25)).toBeDisabled();
  await tiles.last().click(); await expect(picker.getByRole("button", { name: ui.add + " · 2", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await picker.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`selfie-library-${locale}-${width}.png`) });
  await picker.getByRole("button", { name: ui.add + " · 2", exact: true }).click();
  await expect(picker).toHaveCount(0); await expect(opener).toBeFocused();
  await expect(categories.locator(".dr-selfie-thumbnails img")).toHaveCount(3);
  // Removing a collection assignment leaves the source available for reuse.
  await categories.getByRole("button", { name: ui.remove + " 2", exact: true }).click();
  await opener.click(); await expect(tiles.first()).toBeEnabled(); await tiles.first().click();
  await picker.getByRole("button", { name: ui.add + " · 1", exact: true }).click();
  await editor.getByRole("button", { name: ui.save, exact: true }).click(); await closeSavedCharacter(editor, locale);
  const after = await page.evaluate(() => (window as any).getCast());
  const original = before.entities.find((e: any) => e.id === "mira"), saved = after.entities.find((e: any) => e.id === "mira");
  expect(saved.characterSheet.selfieCategories[0].images).toEqual([sources[0], sources[2], sources[3]]);
  expect(saved).toEqual({ ...original, updatedAt: saved.updatedAt, characterSheet: { ...original.characterSheet, selfieCategories: [{ ...original.characterSheet.selfieCategories[0], images: saved.characterSheet.selfieCategories[0].images }] } });
  expect(after.entities.find((e: any) => e.id === "hero")).toEqual(before.entities.find((e: any) => e.id === "hero"));
  expect(after.scene.states).toEqual(before.scene.states);
  expect(await page.evaluate(() => (window as any).textRequests ?? [])).toEqual([]);
  expect(await page.evaluate(() => (window as any).selfieRequested)).toBeUndefined();
  await open(); await editor.locator(".dr-selfie-collections>summary").click(); await expect(categories.locator(".dr-selfie-thumbnails img")).toHaveCount(3);
  await opener.click(); await picker.getByRole("button", { name: ui.more + " · 24/28", exact: true }).click();
  await expect(picker.locator("[data-added]")).toHaveCount(3);
  await picker.getByRole("button", { name: ui.cancel, exact: true }).click(); await expect(picker).toHaveCount(0);
});

for (const locale of ["ru", "en"] as const) test(`empty selfie library is explained without creating images ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const editor = page.locator(".dr-character-dialog");
  await characterTab(editor, "images", locale); await editor.locator(".dr-selfie-collections>summary").click();
  const categories = editor.locator(".dr-selfie-categories");
  await categories.getByRole("button", { name: locale === "ru" ? "Добавить категорию" : "Add category", exact: true }).click();
  await categories.getByRole("button", { name: locale === "ru" ? "Выбрать из библиотеки" : "Choose from library", exact: true }).click();
  const picker = categories.locator(".dr-selfie-library-picker");
  await expect(picker).toContainText(locale === "ru" ? "В библиотеке этого персонажа пока нет фото" : "This character’s library has no photos yet");
  await expect(picker.locator("img")).toHaveCount(0);
  await picker.getByRole("button", { name: locale === "ru" ? "Отменить выбор" : "Cancel selection", exact: true }).click();
  await expect(picker).toHaveCount(0); await expect(editor).toBeVisible();
});
