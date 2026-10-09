import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterTab, closeSavedCharacter } from "./character-helpers";
import { emotionOptionLabel } from "../../src/core/characters";
import { emotionPolicyText } from "../../src/core/emotion-policy-i18n";
import { DEFAULT_EMOTIONS, EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test("quick emotion switches detach all images and preserve other assignments " + locale + " " + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto("/tests/fixtures/characters.html?locale=" + locale);
  const images = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160; const ctx = canvas.getContext("2d")!;
    const images = ["#455d6c", "#956b82", "#747eab"].map(color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 120, 160); return canvas.toDataURL(); });
    const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((person: any) => person.id === "mira" ? { ...person, characterSheet: { ...person.characterSheet, sprites: { neutral: images[0], happy: [images[1], images[2]], sad: [images[2]] } } } : person) }); return images;
  });
  const hero = await page.evaluate(() => (window as any).getCast().entities.find((p: any) => p.id === "hero"));
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await characterTab(dialog, "images", locale);
  const policy = dialog.locator('[data-editor-section="images"] .dr-emotion-policy'), library = dialog.locator(".dr-portrait-library");
  const happy = policy.getByRole("switch", { name: emotionPolicyText(locale, "allow", { emotion: emotionOptionLabel(locale, "happy") }), exact: true });
  await expect(happy).toBeVisible(); await expect(happy).toBeChecked();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(2);
  await happy.focus(); await happy.press("Space"); await expect(happy).not.toBeChecked();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: new RegExp(locale === "ru" ? "Загрузить сразу" : "Upload directly") })).toBeDisabled();
  await expect(library.locator("select option[value=happy]")).toHaveCount(0);
  await library.getByRole("button", { name: new RegExp(locale === "ru" ? "^Без эмоции" : "^Unassigned") }).click();
  await expect(library.locator(".dr-library-image")).toHaveCount(1);
  expect(await library.locator(".dr-library-image img").getAttribute("src")).toBe(images[1]);
  const audit = await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa"]).analyze(); expect(audit.violations).toEqual([]);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await policy.evaluate(node => node.scrollIntoView({ block: "start" })); await page.screenshot({ path: info.outputPath("emotion-switches.png") });
  const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true });
  await save.click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  const saved = await page.evaluate(() => (window as any).getCast().entities.find((p: any) => p.id === "mira"));
  expect(saved.characterSheet.sprites).toEqual({ neutral: images[0], sad: [images[2]] }); expect(saved.characterSheet.portraitLibrary).toEqual([images[1]]);
  expect(await page.evaluate(() => (window as any).getCast().entities.find((p: any) => p.id === "hero"))).toEqual(hero);
  await happy.check(); await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(0);
  await save.click(); await expect(dialog.locator("footer [role=status]")).toBeVisible(); await closeSavedCharacter(dialog, locale);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); await characterTab(dialog, "images", locale);
  const preview = dialog.getByLabel(locale === "ru" ? "Эмоция портрета" : "Portrait emotion", { exact: true }); await preview.selectOption("happy");
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).getCast().entities.find((p: any) => p.id === "mira").characterSheet.blockedEmotions)).toBeUndefined();
});

for (const locale of ["ru", "en"] as const) for (const scope of ["world", "global"] as const) test("removing an emotion in real settings detaches its portraits " + locale + " " + scope, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await expect(page.getByRole("button", { name: "Настройки", exact: true })).toBeVisible();
  const images = await page.evaluate(async ({ locale, scope, emotions, sheet, state }) => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const world: any = await repository.get("world", "world-a");
    if (scope === "world") await repository.put("world", { ...world, characterEmotions: emotions });
    const other: any = await repository.get("world", "world-b");
    await repository.put("world", { ...other, characterEmotions: emotions });
    const c = document.createElement("canvas"); c.width = 24; c.height = 32; const ctx = c.getContext("2d")!;
    const images = ["#7896ab", "#97637b"].map(color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 24, 32); return c.toDataURL(); });
    for (const worldId of ["world-a", "world-b"]) await repository.put("entity", {
      id: "mira-" + worldId, worldId, kind: "character", name: "Mira", description: "Original facts", aliases: [], memberIds: [],
      characterSheet: { ...sheet, sprites: { neutral: images[0], happy: images[1] } }, createdAt: 1, updatedAt: 1,
    });
    await repository.put("binding", {
      id: "binding:emotion", chatId: "emotion", chatUrl: "https://chat.deepseek.com/a/chat/s/emotion", worldId: "world-a", bookId: null,
      messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1,
      characterScenes: { "world-a": { revision: "original", presentIds: ["mira-world-a"], states: { "mira-world-a": { ...state, emotion: "happy", goal: "Keep the goal" } }, updatedAt: 1 } },
    });
    if (scope === "global") (window as any).setPageState({ scene: { worldId: null, focusIds: [], bookId: null } });
    const area = (window as any).chrome.storage.local, settings = (await area.get("deeprole_settings")).deeprole_settings;
    await area.set({ deeprole_settings: { ...settings, locale, characterEmotions: emotions } }); return images;
  }, { locale, scope, emotions: DEFAULT_EMOTIONS, sheet: EMPTY_CHARACTER, state: EMPTY_STATUS });
  await page.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
  await page.getByRole("button", { name: locale === "ru" ? "Персонажи" : "Characters", exact: true }).click();
  const settings = page.locator(".dr-character-settings");
  await settings.getByRole("button", { name: (locale === "ru" ? "Убрать из списка" : "Remove from list") + ": happy", exact: true }).click();
  const save = settings.getByRole("button", { name: locale === "ru" ? "Сохранить эмоции" : "Save emotions", exact: true });
  await save.click(); await expect(settings.getByRole("status").last()).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  const stored = await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string); const rows: any[] = await repository.rawRecords();
    return { person: rows.find(row => row.kind === "entity" && row.id === "mira-world-a").data, other: rows.find(row => row.kind === "entity" && row.id === "mira-world-b").data, scene: rows.find(row => row.kind === "binding" && row.id === "binding:emotion").data.characterScenes["world-a"] };
  });
  expect(stored.person.characterSheet.sprites).toEqual({ neutral: images[0] }); expect(stored.person.characterSheet.portraitLibrary).toEqual([images[1]]);
  expect(stored.other.characterSheet.sprites).toEqual({ neutral: images[0], happy: images[1] });
  expect(stored.scene.states["mira-world-a"]).toMatchObject({ emotion: "neutral", goal: "Keep the goal" }); expect(stored.person.description).toBe("Original facts");
  await settings.getByLabel(locale === "ru" ? "Название новой эмоции" : "New emotion name", { exact: true }).fill("happy");
  await settings.getByRole("button", { name: locale === "ru" ? "Добавить эмоцию" : "Add emotion", exact: true }).click(); await save.click();
  await expect(settings.getByRole("status").last()).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); const person: any = await repository.get("entity", "mira-world-a"); return person.characterSheet.sprites.happy; })).toBeUndefined();
});
