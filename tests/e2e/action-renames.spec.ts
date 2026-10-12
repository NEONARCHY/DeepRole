import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EMPTY_CHARACTER, EMPTY_STATUS, actionOptionLabel } from "../../src/core/characters";

for (const locale of ["ru", "en"] as const) for (const scope of ["world", "global"] as const) for (const width of [320, 1100]) test(`rename existing action and all photos ${locale} ${scope} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await expect(page.getByRole("button", { name: "Настройки", exact: true })).toBeVisible();
  const images = await page.evaluate(async ({ locale, scope, sheet, state }) => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const actions = ["neutral", "happy", "Сидит"];
    for (const id of ["world-a", "world-b"]) {
      const world: any = await repository.get("world", id);
      await repository.put("world", { ...world, characterActions: id === "world-a" && scope === "global" ? undefined : actions });
    }
    const canvas = document.createElement("canvas"); canvas.width = 24; canvas.height = 32;
    const images = ["#879bad", "#ae748b", "#748bae"].map(color => { const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 24, 32); return canvas.toDataURL(); });
    for (const worldId of ["world-a", "world-b"]) await repository.put("entity", { id: "mira-" + worldId, worldId, kind: "character", name: "Mira", description: "Keep original lore and age", aliases: [], memberIds: [], characterSheet: { ...sheet, sprites: { neutral: images[0], happy: images.slice(1) }, initialStatus: { ...state, action: "happy" } }, createdAt: 1, updatedAt: 1 });
    for (const id of ["a", "b"]) await repository.put("binding", { id: "binding:" + id, chatId: id, chatUrl: "https://chat.deepseek.com/a/chat/s/" + id, worldId: "world-a", bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1, characterScenes: { "world-a": { revision: "before", presentIds: ["mira-world-a"], states: { "mira-world-a": { ...state, action: "happy", condition: "Safe", goal: "Keep goal" } }, updatedAt: 1 } } });
    if (scope === "global") (window as any).setPageState({ scene: { worldId: null, focusIds: [], bookId: null } });
    const area = (window as any).chrome.storage.local;
    const stored = (await area.get("deeprole_settings")).deeprole_settings;
    await area.set({ deeprole_settings: { ...stored, locale, characterActions: actions } }); return images;
  }, { locale, scope, sheet: EMPTY_CHARACTER, state: EMPTY_STATUS });
  await page.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
  await page.getByRole("button", { name: locale === "ru" ? "Поведение персонажей" : "Character behaviour", exact: true }).click();
  const settings = page.locator(".dr-character-settings");
  await settings.locator('.dr-action-help').first().locator('summary').click();
  const bulk = settings.getByLabel(locale === "ru" ? "Действия для портретов" : "Portrait actions", { exact: true });
  const localized = [actionOptionLabel(locale,"neutral"),actionOptionLabel(locale,"happy"),"Сидит"].join("\n");
  await expect(bulk).toHaveValue(localized);
  await bulk.fill(localized);
  const rename = (name: string) => settings.getByRole("button", { name: (locale === "ru" ? "Переименовать действие" : "Rename action") + ": " + actionOptionLabel(locale,name), exact: true });
  await expect(rename("neutral")).toHaveCount(0);
  await rename("happy").click();
  const input = settings.getByRole("group", { name: locale === "ru" ? "Переименовать действие" : "Rename action", exact: true }).getByLabel(locale === "ru" ? "Новое название действия" : "Rename to", { exact: true });
  await expect(input).toBeFocused();await expect(input).toHaveValue(actionOptionLabel(locale,"happy"));await input.press("Enter");await expect(input).toHaveCount(0);await rename("happy").click();
  await expect(settings.locator('.dr-action-list')).not.toContainText(' · happy');await expect(settings.locator('.dr-action-list')).not.toContainText(' · neutral');await input.fill("Сидит"); await input.press("Enter");
  await expect(settings.getByRole("alert")).toContainText(locale === "ru" ? "Такое действие уже есть" : "already exists");
  await input.press("Escape"); await expect(input).toHaveCount(0); await expect(rename("happy")).toBeFocused();
  await rename("happy").click(); await input.fill(locale === "ru" ? "Смеётся" : "Laughing");
  await input.press("Enter"); const name = locale === "ru" ? "Смеётся" : "Laughing";
  await expect(rename(name)).toBeVisible(); await expect(rename(name)).toBeFocused();
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); const person: any = await repository.get("entity", "mira-world-a"); return Object.keys(person.characterSheet.sprites); })).toContain("happy");
  expect(await settings.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).include(".dr-character-settings").withTags(["wcag2a", "wcag2aa"]).analyze(); expect(audit.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`rename-${locale}-${scope}-${width}.png`) });
  await settings.getByRole("button", { name: locale === "ru" ? "Сохранить действия" : "Save actions", exact: true }).click();
  await expect(settings.getByRole("status").last()).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  const saved = await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); const all: any[] = await repository.portableRecords(); return { person: all.find(row => row.id === "mira-world-a").data, other: all.find(row => row.id === "mira-world-b").data, states: ["a", "b"].map(id => all.find(row => row.id === "binding:" + id).data.characterScenes["world-a"].states["mira-world-a"]) }; });
  expect(saved.person.characterSheet.sprites).toEqual({ neutral: images[0], [name]: images.slice(1) });
  expect(saved.person.characterSheet.initialStatus.action).toBe(name);
  expect(saved.states).toEqual([0, 1].map(() => ({ ...EMPTY_STATUS, action: name, condition: "Safe", goal: "Keep goal" })));
  expect(saved.other.characterSheet.sprites.happy).toEqual(images.slice(1)); expect(saved.person.description).toBe("Keep original lore and age");
  // A second rename must resolve to the stored original, not a nonexistent intermediate bucket.
  await rename(name).click(); await input.fill(name + "!"); await input.press("Enter");
  await settings.getByRole("button", { name: locale === "ru" ? "Сохранить действия" : "Save actions", exact: true }).click();
  await expect(settings.getByRole("status").last()).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  expect(await page.evaluate(async name => { const { repository } = await import("/src/storage/repository.ts" as string); const person: any = (await repository.portableRecords()).find((row:any)=>row.id==="mira-world-a")!.data; return person.characterSheet.sprites[name]; }, name + "!")).toEqual(images.slice(1));
});
