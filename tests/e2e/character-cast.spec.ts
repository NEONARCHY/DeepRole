import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) for (const width of [320, 760]) {
  test(`current cast and searchable roster ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}&count=40`);
    const panel = page.locator(".dr-characters"); const tiles = panel.locator(".dr-character-row");
    const current = panel.getByRole("button", { name: `${locale === "ru" ? "В сцене" : "In scene"} · 2`, exact: true });
    const all = panel.getByRole("button", { name: `${locale === "ru" ? "Все" : "All"} · 40`, exact: true });
    await expect(current).toHaveAttribute("aria-pressed", "true");
    await expect(tiles).toHaveCount(2); await expect(tiles.first()).toContainText("Noah"); await expect(tiles.last()).toContainText("Mira");
    expect((await new AxeBuilder({ page }).include(".dr-characters").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await panel.screenshot({ path: info.outputPath(`cast-${locale}-${width}.png`) });
    await all.click(); await expect(tiles).toHaveCount(40);
    const search = panel.getByRole("searchbox", { name: locale === "ru" ? "Найти персонажа" : "Find a character" });
    await search.fill("character 39"); await expect(tiles).toHaveCount(1); await expect(tiles).toContainText("Character 39");
    await tiles.click(); await expect(page.getByRole("dialog")).toContainText("Character 39");
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(tiles).toBeFocused();
    await search.fill("missing"); await expect(tiles).toHaveCount(0);
    await expect(panel).toContainText(locale === "ru" ? "Персонаж не найден" : "No character found");
    await search.fill("Mira"); await expect(tiles).toHaveCount(1);
    await current.click(); await expect(tiles).toHaveCount(2);
    await all.click(); await expect(search).toHaveValue("Mira");
    expect((await new AxeBuilder({ page }).include(".dr-characters").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const locale of ["ru", "en"] as const) {
  test(`viewing portrait emotions is not an edit ${locale}`, async ({ page }) => {
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const dialog = page.getByRole("dialog");
    const preview = dialog.getByLabel(locale === "ru" ? "Эмоция портрета" : "Portrait emotion", { exact: true });
    await expect(preview).toHaveValue("happy");
    let confirmations = 0;
    page.on("dialog", async event => { confirmations++; await event.dismiss(); });
    await preview.selectOption("angry");
    await expect(dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true })).toHaveValue("happy");
    await dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).first().click();
    await expect(dialog).toHaveCount(0); expect(confirmations).toBe(0);
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    await dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true }).selectOption("sad");
    await dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).first().click();
    await expect(dialog).toBeVisible(); expect(confirmations).toBe(1);
    await expect(dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true })).toHaveValue("sad");
    await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).saved.state.emotion)).toBe("sad");
  });
}

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) {
  test(`known stat highlights stay readable, current and read-only ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    const stats = locale === "ru" ? [{ label: "Энергия", value: "Отдохнула" }, { label: "Доверие", value: "Осторожное" }] : [{ label: "Energy", value: "Rested" }, { label: "Trust", value: "Cautious" }];
    const six = [...stats, ...["Keys", "Clues", "Health", "Focus"].map(label => ({ label, value: "0" }))];
    await page.evaluate(stats => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, stats } } } }); }, six);
    const tile = page.locator(".dr-character-row").filter({ hasText: "Mira" });
    const portrait = page.locator(".dr-cast-portrait.right");
    await expect(tile.locator(".dr-character-highlights>span")).toHaveText(stats.map(stat => `${stat.label}: ${stat.value}`));
    await expect(portrait.locator(".dr-cast-highlights>span")).toHaveText(stats.map(stat => `${stat.label}: ${stat.value}`));
    await expect(portrait).toHaveAccessibleDescription(stats.map(stat => `${stat.label}: ${stat.value}`).join(" "));
    const before = await page.evaluate(() => (window as any).getCast().scene);
    await portrait.focus(); await portrait.press("Enter"); const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".dr-character-stat")).toHaveCount(6);
    await expect(dialog.getByLabel(`${locale === "ru" ? "Значение" : "Value"} 6`, { exact: true })).toHaveValue("0");
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(portrait).toBeFocused();
    expect(await page.evaluate(() => (window as any).getCast().scene)).toEqual(before); expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
    await portrait.scrollIntoViewIfNeeded();
    await page.locator("[data-deeprole-choices-host]").screenshot({ path: info.outputPath(`portrait-stats-${locale}-${width}.png`) });
    await page.locator(".dr-characters").screenshot({ path: info.outputPath(`panel-stats-${locale}-${width}.png`) });
    await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, revision: "2", states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, emotion: "worried", stats: [{ label: "Keys", value: "0" }, { label: "Signal", value: "<img src=x onerror=alert(1)>" }] } } } }); });
    await expect(portrait).toBeFocused(); await expect(portrait.locator("small")).toHaveText(locale === "ru" ? "Тревога" : "Worried");
    await expect(portrait.locator(".dr-cast-highlights>span")).toHaveText(["Keys: 0", "Signal: <img src=x onerror=alert(1)>"]);
    await expect(tile.locator(".dr-character-highlights>span")).toHaveText(["Keys: 0", "Signal: <img src=x onerror=alert(1)>"]);
    await expect(portrait.locator(".dr-cast-highlights img")).toHaveCount(0); await expect(tile.locator(".dr-character-highlights img")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include(".dr-characters").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, revision: "3", states: {} } }); });
    await expect(tile.locator(".dr-character-highlights")).toHaveCount(0); await expect(portrait.locator(".dr-cast-highlights")).toBeHidden();
    await expect(portrait).not.toHaveAttribute("aria-describedby"); await expect(portrait).toBeFocused();
    expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
  });
}

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) {
  test(`manual interlocutor stays clear and editable ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    const partnerName = locale === "ru" ? "Собеседник героя" : "Talking to the protagonist";
    const presentName = locale === "ru" ? "В сцене" : "In the scene";
    const dialog = page.getByRole("dialog"); const tile = page.locator(".dr-character-row").filter({ hasText: "Mira" });
    await tile.click(); const partner = dialog.getByRole("checkbox", { name: partnerName, exact: true });
    await expect(partner).toBeChecked(); await partner.uncheck();
    await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
    expect(await page.evaluate(() => (window as any).saved.interlocutor)).toBe(false);
    await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, partnerId: null, presentIds: ["hero"] } }); });
    await page.locator(".dr-characters").getByRole("button", { name: new RegExp(`^${locale === "ru" ? "Все" : "All"}`) }).click();
    await tile.click(); await expect(partner).not.toBeChecked(); const present = dialog.getByRole("checkbox", { name: presentName, exact: true });
    await expect(present).not.toBeChecked(); await partner.focus(); await partner.press("Space");
    await expect(partner).toBeChecked(); await expect(present).toBeChecked(); await expect(partner).toBeFocused();
    await expect(dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true })).toHaveValue("happy");
    await expect(partner).toHaveAccessibleDescription(/(Портрет справа|Portrait beside)/);
    await present.uncheck(); await expect(partner).not.toBeChecked(); await partner.check();
    await page.evaluate(() => { (window as any).rejectSave = true; });
    const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true });
    await save.click(); await expect(dialog.getByRole("alert")).toBeVisible(); await expect(partner).toBeChecked();
    await page.evaluate(() => { (window as any).rejectSave = false; }); await partner.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`partner-draft-recovery-${locale}-${width}.png`) });
    expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await save.click(); await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ interlocutor: true, present: true, state: { emotion: "happy" }, chatId: "a" });
    await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, partnerId: "mira", presentIds: ["hero", "mira"] } }); });
    await page.locator(".dr-cast-portrait.right").click(); await expect(partner).toBeChecked(); await partner.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`manual-partner-${locale}-${width}.png`) });
    await page.keyboard.press("Escape");
    await page.locator(".dr-character-row").filter({ hasText: "Noah" }).click(); await expect(partner).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: locale === "ru" ? "Мой главный герой" : "My protagonist", exact: true }).uncheck();
    await expect(partner).toBeVisible(); await partner.check();
    await dialog.getByRole("checkbox", { name: locale === "ru" ? "Мой главный герой" : "My protagonist", exact: true }).check();
    await expect(partner).toHaveCount(0); await save.click();
    expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ interlocutor: false, sheet: { protagonist: true } });
  });
}

test("scene, scope and aliases update without leaking the previous roster filter", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en&count=40");
  const panel = page.locator(".dr-characters"); const tiles = panel.locator(".dr-character-row");
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, revision: "2", presentIds: ["extra-9"] } }); });
  await expect(tiles).toHaveCount(2); await expect(tiles.last()).toContainText("Character 9");
  await panel.getByRole("button", { name: "All · 40", exact: true }).click();
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((e: any) => e.id === "mira" ? { ...e, aliases: ["Engineer"] } : e) }); });
  const search = panel.getByRole("searchbox"); await search.fill("  ENGINEER  "); await expect(tiles).toHaveCount(1); await expect(tiles).toContainText("Mira");
  await page.evaluate(() => (window as any).setCast({ chatId: "b", scene: undefined }));
  await expect(search).toHaveCount(0); await expect(tiles).toHaveCount(40); await expect(panel).toContainText("showing everyone");
  await panel.getByRole("button", { name: "All · 40", exact: true }).click(); await search.fill("Mira"); await tiles.click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Unsaved personal draft");
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ worldId: "other", entities: [cast.entities[0]], scene: { ...cast.scene, revision: "3", presentIds: [], states: {}, updatedAt: 3 } }); });
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(search).toHaveCount(0); await expect(tiles).toHaveCount(1); await expect(tiles).toContainText("Noah");
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((e: any) => ({ ...e, characterSheet: { ...e.characterSheet, protagonist: false } })) }); });
  await expect(tiles).toHaveCount(0); await expect(panel).toContainText("No one is in this scene yet");
  await panel.getByRole("button", { name: "All · 1", exact: true }).click(); await expect(tiles).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
});

test("live emotion changes preserve portrait focus and recover corrupt local images", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en");
  const right = page.locator(".dr-cast-portrait.right");
  await expect(right).toBeVisible(); await right.focus();
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ scene: { ...cast.scene, revision: "2", states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, emotion: "worried" } } } }); });
  await expect(right).toBeFocused(); await expect(right.locator("small")).toHaveText("Worried");
  const neutral = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160; canvas.getContext("2d")!.fillRect(0, 0, 120, 160); return canvas.toDataURL("image/png"); });
  await page.evaluate(value => { const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((e: any) => e.id === "mira" ? { ...e, updatedAt: 2, characterSheet: { ...e.characterSheet, sprites: { worried: "data:image/png;base64,AAAA", neutral: value } } } : e) }); }, neutral);
  const tileImage = page.locator(".dr-character-row").filter({ hasText: "Mira" }).locator("img");
  await expect(right).toBeFocused(); await expect(right.locator("img")).toHaveAttribute("src", neutral);
  await expect(tileImage).toHaveAttribute("src", neutral); await expect.poll(() => tileImage.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(160);
  await right.press("Enter");
  const editorImage = page.getByRole("dialog").locator(".dr-character-portrait-editor img"); await editorImage.scrollIntoViewIfNeeded(); await expect(editorImage).toHaveAttribute("src", neutral);
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(right).toBeFocused();
  await page.evaluate(() => { const cast = (window as any).getCast(); (window as any).setCast({ entities: cast.entities.map((e: any) => e.id === "mira" ? { ...e, updatedAt: 3, characterSheet: { ...e.characterSheet, sprites: { worried: "data:image/png;base64,AAAA", neutral: "data:image/png;base64,BBBB" } } } : e) }); });
  await expect(right.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml,/); await expect(tileImage).toHaveAttribute("src", /^data:image\/svg\+xml,/);
  await expect.poll(() => right.locator("img").evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(160);
  expect(await page.evaluate(() => (window as any).getCast().entities.find((e: any) => e.id === "mira").characterSheet.sprites.worried)).toBe("data:image/png;base64,AAAA");
});
