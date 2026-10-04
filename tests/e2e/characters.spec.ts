import { closeSavedCharacter } from "./character-helpers";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { setEnglish } from "./helpers/settings";

async function expectPortraitRatio(image: Locator, placeholder = true) {
  const bounds = await image.boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(3 / 4, 3);
  await expect(image).toHaveCSS("object-fit", "contain");
  if (placeholder) {
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight)).toBe(3 / 4);
  }
}

for (const locale of ["ru", "en"] as const) test(`request a reviewed permanent character fact ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
  const dialog = page.getByRole("dialog");
  const section = dialog.getByText(locale === "ru" ? "Изменить постоянный факт" : "Correct a lasting fact");
  await section.click();
  const instruction = locale === "ru" ? "У Миры теперь чёрные волосы" : "Mira now has black hair";
  await dialog.getByPlaceholder(locale === "ru" ? "Например: теперь у Элис чёрные волосы вместо рыжих" : "For example: Alice now has black hair instead of red hair").fill(instruction);
  await dialog.getByRole("button", { name: locale === "ru" ? "Попросить DeepSeek" : "Ask DeepSeek" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).factRequest)).toEqual({ entityId: "mira", brief: instruction });
  await expect(dialog).toBeHidden();
});

for (const locale of ["ru", "en"] as const) test(`character settings in the real narrow sidebar ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 850 });
  await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") await setEnglish(page);
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  const enable = page.getByRole("checkbox", { name: locale === "ru" ? "Карточки персонажей" : "Character sheets", exact: true });
  await expect(enable).toBeChecked(); await enable.uncheck(); await enable.check();
  const settings = page.locator(".dr-character-settings");
  await expect(settings.getByRole("textbox")).toBeVisible();
  await expect(settings.getByRole("checkbox")).toHaveCount(2);
  const emotions = ["neutral", ...Array.from({ length: 31 }, (_, i) => `emotion-${i}`)];
  const saveEmotions = settings.getByRole("button", { name: locale === "ru" ? "Сохранить эмоции" : "Save emotions", exact: true });
  await settings.getByRole("textbox").fill(emotions.join("\n")); await saveEmotions.click();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  // This preview intentionally reseeds storage on reload; verify persistence
  // directly and remount the settings section. MV3 tests cover browser reload.
  await expect.poll(() => page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    return (await repository.get("world", "world-a"))?.characterEmotions;
  })).toEqual(emotions);
  await page.getByRole("button", { name: locale === "ru" ? "Память" : "Memory", exact: true }).click();
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  await expect(settings.getByRole("textbox")).toHaveValue(emotions.join("\n"));
  await settings.getByRole("textbox").fill([...emotions, "extra"].join("\n")); await saveEmotions.click();
  await expect(settings.getByRole("alert")).toContainText("32");
  await settings.getByRole("textbox").fill(emotions.join("\n")); await saveEmotions.click();
  expect((await new AxeBuilder({ page }).include(".dr-character-settings").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await settings.screenshot({ path: info.outputPath(`character-settings-${locale}.png`) });
  const stored = await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings);
  expect(stored.characterSheetsEnabled).toBe(true);
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 360, 760, 900, 1280]) {
  test(`character sheet, sprites and editing ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await expect(page.locator(".dr-character-row img")).toHaveCount(0);
    await page.getByRole("button", { name: locale === "ru" ? "Открыть галерею персонажей" : "Open character gallery" }).click();
    await expectPortraitRatio(page.locator(".dr-character-gallery-card img").first());
    await expectPortraitRatio(page.locator(".dr-character-gallery-card img").last());
    await page.keyboard.press("Escape");
    expect((await new AxeBuilder({ page }).include(".dr-characters").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox(); expect(bounds!.x).toBeGreaterThan(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width); expect(bounds!.height).toBeLessThan(850);
    await expect(dialog.getByLabel(locale === "ru" ? "Имя" : "Name", { exact: true })).toBeFocused();
    await dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing").fill("Green coat");
    await dialog.getByLabel(locale === "ru" ? "Ближайшая цель" : "Current goal").fill("Find the key");
    const preview = dialog.locator(".dr-character-portrait-editor img");
    await preview.scrollIntoViewIfNeeded();
    const previewBounds = await preview.boundingBox();
    expect(previewBounds!.width).toBeGreaterThanOrEqual(176); expect(previewBounds!.height).toBeGreaterThanOrEqual(220);
    await expectPortraitRatio(preview);
    await page.screenshot({ path: info.outputPath(`sheet-${locale}-${width}.png`) });
    expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character" });
    await save.focus(); await page.keyboard.press("Tab"); await expect(dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).first()).toBeFocused();
    await save.click(); await closeSavedCharacter(dialog, locale); await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ name: "Mira", sheet: { appearance: "Green coat" }, state: { goal: "Find the key" }, worldId: "w", chatId: "a", base: "v" });
    const avatars = page.locator(".dr-cast-portrait"); await expect(avatars).toHaveCount(2);
    const castImage = await avatars.first().locator("img").boundingBox();
    expect(castImage!.width).toBeGreaterThanOrEqual(120);
    // Small viewports use 120px floating portraits, still exactly 3:4.
    expect(castImage!.height + 0.01).toBeGreaterThanOrEqual(160);
    await expectPortraitRatio(avatars.first().locator("img"));
    await expectPortraitRatio(avatars.last().locator("img"));
    const choicesHeight = (await page.locator("[data-deeprole-choices-host] section").boundingBox())!.height;
    const sprites = page.getByRole("checkbox", { name: locale === "ru" ? "Портреты рядом с вариантами ответа" : "Portraits beside reply options", exact: true });
    await sprites.uncheck(); await expect(avatars).toHaveCount(0);
    expect((await page.locator("[data-deeprole-choices-host] section").boundingBox())!.height).toBeLessThanOrEqual(choicesHeight + 1);
    await sprites.check(); await expect(avatars).toHaveCount(2);
    await expect(page.locator("[data-deeprole-choices-host] .dr-cast-portrait")).toHaveCount(0);
    await expect(page.locator("[data-deeprole-portrait-layer]")).toHaveCSS("position", "fixed");
    if (width >= 760) expect(castImage!.width).toBeGreaterThanOrEqual(190);
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.evaluate(() => (window as any).syncPortraits(["hero"])); await expect(avatars).toHaveCount(1); await expect(avatars).toHaveAccessibleName(/Noah/);
    await avatars.click(); await expect(dialog).toBeVisible(); await expect(dialog.getByLabel(locale === "ru" ? "Мой главный герой" : "My protagonist")).toBeChecked();
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await page.evaluate(() => (window as any).syncPortraits()); await page.screenshot({ path: info.outputPath(`portraits-${locale}-${width}.png`), fullPage: true });
    await page.locator("[data-deeprole-choices-host]").screenshot({ path: info.outputPath(`scene-${locale}-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("upload fallback, failed save keeps draft, custom emotions validation", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en");
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({ name: "test.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t open");
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8; canvas.getContext("2d")!.fillRect(0, 0, 8, 8); return canvas.toDataURL("image/png").split(",")[1]!; });
  await dialog.locator("input[type=file]").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(dialog.locator(".dr-character-portrait-editor img")).toHaveAttribute("src", /^data:image\/(webp|png);base64,/);
  await expectPortraitRatio(dialog.locator(".dr-character-portrait-editor img"), false);
  await page.evaluate(() => { (window as any).rejectSave = true; });
  await dialog.getByLabel("Name", { exact: true }).fill("Mira edited"); await dialog.getByRole("button", { name: "Save character" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t reach storage"); await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Mira edited");
  await page.evaluate(() => { (window as any).rejectSave = false; }); await dialog.getByRole("button", { name: "Save character" }).click(); await closeSavedCharacter(dialog);
  await page.getByLabel("Portrait emotions", { exact: true }).fill("happy"); await page.getByRole("button", { name: "Save emotions" }).click(); await expect(page.getByRole("alert")).toContainText("Keep neutral");
  await page.getByLabel("Portrait emotions", { exact: true }).fill("neutral\nFocused"); await page.getByRole("button", { name: "Save emotions" }).click();
  expect(await page.evaluate(() => (window as any).settings.characterEmotions)).toEqual(["neutral", "Focused"]);
});

for (const count of [1, 40]) test(`portrait grid stays usable with ${count} characters`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/tests/fixtures/characters.html?count=${count}`);
  if (count === 40) await page.getByRole("button", { name: "All · 40", exact: true }).click();
  await page.getByRole("button", { name: "Open character gallery", exact: true }).click();
  const tiles = page.locator(".dr-character-gallery-card"); await expect(tiles).toHaveCount(count);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const list = page.locator(".dr-character-gallery-grid");
  if (count === 1) {
    const image = await tiles.locator("img").boundingBox(); expect(image!.width).toBeGreaterThanOrEqual(120); expect(image!.height).toBeGreaterThan(160);
    await expectPortraitRatio(tiles.locator("img"));
    await tiles.getByRole("button", { name: /Edit character:/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } else {
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await tiles.last().getByRole("button").scrollIntoViewIfNeeded(); await tiles.last().getByRole("button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
});
