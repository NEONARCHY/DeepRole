import { expect, test } from "@playwright/test";
import { closeSavedCharacter } from "./character-helpers";

for (const locale of ["ru", "en"]) for (const width of [320, 1100]) test(`shared emotion images and continuous editing ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  const names = ["neutral", "happy", "sad", "screaming", "shouting", "scarry", "смех"];
  await page.getByLabel(locale === "ru" ? "Эмоции для портретов" : "Portrait emotions", { exact: true }).fill(names.join("\n"));
  await page.getByRole("button", { name: locale === "ru" ? "Сохранить эмоции" : "Save emotions", exact: true }).click();
  expect(await page.evaluate(() => (window as any).settings.characterEmotions)).toEqual(names);
  await page.locator(".dr-emotion-help summary").click(); await expect(page.locator(".dr-emotion-help")).toContainText(locale === "ru" ? "не объединяют синонимы" : "do not create aliases");
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  const portraitEmotion = dialog.getByLabel(locale === "ru" ? "Эмоция портрета" : "Portrait emotion", { exact: true });
  await expect(portraitEmotion.locator('option[value="happy"]')).toHaveText(locale === "ru" ? "Радость · happy" : "Happy · happy");
  await expect(portraitEmotion.locator('option[value="смех"]')).toHaveText("смех");
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 120; c.height = 160; const ctx = c.getContext("2d")!; ctx.fillStyle = "#728aa1"; ctx.fillRect(0, 0, 120, 160); return c.toDataURL("image/png").split(",")[1]!; });
  await dialog.locator("input[type=file]").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(1);
  const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true });
  const saved = dialog.locator("footer [role=status]");
  await save.click(); await expect(saved).toHaveText(locale === "ru" ? "Сохранено" : "Saved"); await expect(dialog).toBeVisible();
  await dialog.evaluate(node => { (window as any).sameEditor = node; });
  await dialog.getByRole("button", { name: /^(Библиотека изображений|Image library) ·/ }).click();
  const library = dialog.locator(".dr-portrait-library"); await library.locator(".dr-library-image").click();
  await library.locator("select").selectOption("screaming"); await library.locator(".dr-library-emotions summary").click();
  for (const name of ["shouting", "scarry", "смех"]) await library.getByRole("checkbox", { name, exact: true }).check();
  await page.screenshot({ path: info.outputPath(`shared-emotions-${locale}-${width}.png`) });
  await library.getByRole("button", { name: locale === "ru" ? "Назначить эмоции" : "Assign to emotion", exact: true }).click();
  await save.click(); await expect(saved).toBeVisible();
  expect(await dialog.evaluate(node => node === (window as any).sameEditor)).toBe(true);
  await expect(library).toBeVisible(); await expect(portraitEmotion).toHaveValue("screaming");
  const sprites = await page.evaluate(() => (window as any).saved.sheet.sprites);
  for (const name of ["screaming", "shouting", "scarry", "смех"]) expect(sprites[name]).toEqual(sprites.happy);
  // A live update between saves remains authoritative for fields left untouched.
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, goal: "Reach the observatory" } } } }); });
  await dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing", { exact: true }).fill("Green coat");
  await save.click(); await expect(saved).toBeVisible(); await expect(dialog.getByLabel(locale === "ru" ? "Ближайшая цель" : "Current goal", { exact: true })).toHaveValue("Reach the observatory");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  let confirmations = 0; page.on("dialog", async event => { confirmations++; await event.dismiss(); });
  await closeSavedCharacter(dialog, locale); await expect(dialog).toHaveCount(0); expect(confirmations).toBe(0);
});

test("saving a new character twice keeps the same identity and editor", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en"); await page.getByRole("button", { name: "Add character", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Name", { exact: true }).fill("Jun");
  const save = dialog.getByRole("button", { name: "Save character", exact: true });
  await save.click(); await expect(dialog.locator("footer [role=status]")).toHaveText("Saved");
  await dialog.getByLabel("Appearance and clothing", { exact: true }).fill("Grey coat");
  await save.click(); await expect(dialog.locator("footer [role=status]")).toHaveText("Saved");
  const people = await page.evaluate(() => (window as any).getCast().entities.filter((e: any) => e.name === "Jun"));
  expect(people).toHaveLength(1); expect(people[0].characterSheet.appearance).toBe("Grey coat");
  expect(await page.evaluate(() => (window as any).saved.entityId)).toBe(people[0].id);
  await closeSavedCharacter(dialog);
});

for (const locale of ["ru", "en"]) test(`gallery stays in the editor after saving ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 950 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.getByRole("button", { name: locale === "ru" ? "Открыть галерею персонажей" : "Open character gallery", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: (locale === "ru" ? "Редактировать персонажа" : "Edit character") + ": Mira", exact: true }).click();
  await dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing", { exact: true }).fill("Grey coat");
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
  await expect(dialog.locator("footer [role=status]")).toBeVisible();
  await expect(dialog.locator(".dr-character-editor-view")).toBeVisible(); await expect(dialog.locator(".dr-character-gallery-view")).toBeHidden();
  await closeSavedCharacter(dialog, locale, true); await expect(dialog.locator(".dr-character-gallery-view")).toBeVisible();
});
