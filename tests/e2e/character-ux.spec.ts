import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterTab } from "./character-helpers";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) test(`clear character image workflow ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing", { exact: true }).fill("Green coat");
  const profile = dialog.getByRole("tab", { name: locale === "ru" ? "Анкета" : "Profile", exact: true });
  await profile.focus(); await profile.press("ArrowRight"); await expect(dialog.getByRole("tab", { selected: true })).toHaveText(locale === "ru" ? "В сцене" : "In scene");
  await dialog.getByLabel(locale === "ru" ? "Ближайшая цель" : "Current goal", { exact: true }).fill("Find the blue key");
  await characterTab(dialog, "images", locale);
  await expect(dialog.locator(".dr-portrait-library")).toBeVisible();
  await dialog.locator("summary").filter({ hasText: locale === "ru" ? "Добавить эмоцию" : "Add emotion" }).click();
  const newEmotion = dialog.getByLabel(locale === "ru" ? "Название новой эмоции" : "New emotion name");
  await newEmotion.fill("Focused"); await newEmotion.press("Enter");
  await expect(dialog.getByLabel(locale === "ru" ? "Эмоция портрета" : "Portrait emotion", { exact: true })).toHaveValue("Focused");
  await expect(page.locator(".dr-emotion-list")).toContainText("Focused");
  await newEmotion.fill("Focused"); await newEmotion.press("Enter"); await expect(dialog.locator(".dr-new-emotion [role=alert]")).toBeVisible();
  await newEmotion.fill("New mood"); await page.evaluate(() => { (window as any).rejectEmotion = true; }); await newEmotion.press("Enter");
  await expect(dialog.locator(".dr-new-emotion [role=alert]")).toContainText(locale === "ru" ? "не изменены" : "unchanged");
  expect(await page.evaluate(() => (window as any).settings.characterEmotions.includes("New mood"))).toBe(false);
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 24; c.height = 32; c.getContext("2d")!.fillRect(0, 0, 24, 32); return c.toDataURL("image/png").split(",")[1]!; });
  const library = dialog.locator(".dr-portrait-library");
  await library.locator("input[type=file]").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(library.locator('.dr-library-image[aria-pressed=true]')).toHaveCount(1);
  await library.getByRole("button", { name: locale === "ru" ? "Назначить эмоции" : "Assign to emotion", exact: true }).click();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(1);
  const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }); await save.click();
  await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved"); await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ sheet: { appearance: "Green coat", sprites: { Focused: expect.anything() } }, state: { goal: "Find the blue key", emotion: "happy" } });
  await characterTab(dialog, "profile", locale); await expect(dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing", { exact: true })).toHaveValue("Green coat");
  await characterTab(dialog, "images", locale);
  await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(el => el.clientWidth));
  expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`character-images-${locale}-${width}.png`) });
});

test("saving reveals an invalid field in another tab without losing the draft", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en"); await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Appearance and clothing", { exact: true }).fill("Red coat"); await characterTab(dialog, "scene"); await dialog.getByRole("button", { name: "Add stat", exact: true }).click();
  await characterTab(dialog, "images"); await dialog.getByRole("button", { name: "Save character" }).click();
  await expect(dialog.getByRole("tab", { name: "In scene" })).toHaveAttribute("aria-selected", "true"); await expect(dialog.getByLabel("Label 2", { exact: true })).toBeFocused();
  await dialog.getByLabel("Label 2", { exact: true }).fill("Focus"); await dialog.getByRole("button", { name: "Save character" }).click();
  await expect(dialog.locator("footer [role=status]")).toHaveText("Saved"); expect(await page.evaluate(() => (window as any).saved.sheet.appearance)).toBe("Red coat");
});

for (const locale of ["ru", "en"] as const) test(`character settings are discoverable and world-scoped ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto("/tests/fixtures/sidepanel.html?world=1"); await page.getByRole("button", { name: "Настройки", exact: true }).click(); if (locale === "en") await setEnglish(page);
  await page.getByRole("button", { name: locale === "ru" ? "Персонажи" : "Characters", exact: true }).click();
  const settings = page.locator(".dr-character-settings"); await expect(settings.locator("textarea")).toBeHidden(); await expect(settings.locator(".dr-emotion-list")).toBeVisible();
  await settings.getByLabel(locale === "ru" ? "Название новой эмоции" : "New emotion name").fill("Focused"); await settings.getByRole("button", { name: locale === "ru" ? "Добавить эмоцию" : "Add emotion", exact: true }).click();
  await settings.getByRole("button", { name: locale === "ru" ? "Сохранить эмоции" : "Save emotions", exact: true }).click(); await expect(settings.getByRole("status").last()).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.get("world", "world-a"))?.characterEmotions.includes("Focused"); })).toBe(true);
  expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.characterEmotions?.includes("Focused") ?? false)).toBe(false);
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  await expect(page.getByRole("slider", { name: locale === "ru" ? "Ширина всех панелей" : "Width of all panels" })).toBeVisible();
});

for (const locale of ["ru", "en"] as const) test(`all floating panels share a persistent width ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 }); await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
  const widths = () => page.locator(".dr-widget-tile>:not(.dr-widget-tools)").evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().width));
  await expect.poll(widths).toEqual([224, 224, 224, 224, 224]);
  await page.getByRole("button", { name: locale === "ru" ? "Ширина всех панелей" : "Width of all panels", exact: true }).click();
  const range = page.getByRole("slider"); await range.focus(); await range.press("End"); await expect.poll(widths).toEqual([360, 360, 360, 360, 360]);
  await range.press("Escape"); await expect(range).toBeHidden(); await page.reload(); await expect.poll(widths).toEqual([360, 360, 360, 360, 360]);
  await page.evaluate(() => (window as any).setWidgetState({ adaptiveLayout: true })); await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.locator(".dr-widget-deck")).toHaveAttribute("data-compact", "true");
  await page.locator('[data-restore-widget="characters"]').click(); const rect = await page.locator('[data-widget="characters"]').boundingBox(); expect(rect!.x + rect!.width).toBeLessThanOrEqual(360);
  await page.setViewportSize({ width: 1280, height: 950 }); await expect.poll(widths).toEqual([360, 360, 360, 360, 360]);
});
