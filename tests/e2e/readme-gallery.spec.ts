import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { setEnglish } from "./helpers/settings";
import { characterTab } from "./character-helpers";
import { emotionPolicyText } from "../../src/core/emotion-policy-i18n";
import { emotionOptionLabel } from "../../src/core/characters";
import { progressText } from "../../src/core/progress-i18n";
import { relationshipText } from "../../src/core/relationship-i18n";
import { mapText } from "../../src/core/map-i18n";

type Locale = "ru" | "en";

// Public documentation uses real components and synthetic, non-personal lore.
// Keep shadows in the crop, without capturing unrelated fixture controls.
async function capture(page: Page, locator: Locator, info: TestInfo, name: string, padding = 12) {
  await expect(locator).toBeVisible();
  await locator.evaluate(node => node.scrollIntoView({ block: "nearest" }));
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  const x = Math.max(0, box!.x - padding), y = Math.max(0, box!.y - padding);
  await page.screenshot({
    path: info.outputPath(name),
    clip: { x, y, width: Math.min(viewport.width - x, box!.width + padding * 2), height: Math.min(viewport.height - y, box!.height + padding * 2) },
    animations: "disabled",
  });
}

async function sidepanel(page: Page, locale: Locale) {
  await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") await setEnglish(page);
}

for (const locale of ["en", "ru"] as const) {
  test(`README scene and options ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1400, height: 820 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}&pins`);
    await expect(page.locator(".dr-character-row")).toHaveCount(2);
    await page.evaluate(locale => {
      document.querySelector("h1")?.remove();
      Object.assign((document.querySelector("#app") as HTMLElement).style, { position: "absolute", left: "-10000px" });
      Object.assign((document.querySelector("#conversation") as HTMLElement).style, { width: "690px", maxWidth: "690px", margin: "70px auto 0", padding: "0" });
      const cast = (window as any).getCast();
      (window as any).setCast({ scene: { ...cast.scene, partnerIds: ["mira"], states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, condition: locale === "ru" ? "В безопасности" : "Safe", stats: [{ label: locale === "ru" ? "Силы" : "Energy", value: locale === "ru" ? "Отдохнула" : "Rested" }] } } } });
    }, locale);
    const choices = page.locator("[data-deeprole-choices-host] section");
    await choices.getByRole("button", { name: locale === "ru" ? "Закрепить оба портрета" : "Pin both portraits", exact: true }).click();
    await choices.getByRole("button", { name: locale === "ru" ? "Закрепить варианты на экране" : "Pin options on screen", exact: true }).click();
    await expect(page.locator("[data-deeprole-portrait-layer] .dr-cast-widget")).toHaveCount(2);
    await expect(choices).toContainText(locale === "ru" ? "Ваш ход" : "Your move");
    await capture(page, choices, info, `choices-${locale}.png`);
    const sceneBox = await page.locator("[data-deeprole-choices-host] section, [data-deeprole-portrait-layer] .dr-cast-widget").evaluateAll(nodes => {
      const boxes = nodes.map(node => node.getBoundingClientRect());
      const x = Math.min(...boxes.map(box => box.left)) - 12, y = Math.min(...boxes.map(box => box.top)) - 12;
      const bottom = Math.max(...boxes.map(box => box.bottom));
      // Keep the actual scene inside the viewport; only crop decorative padding.
      return { x, y, width: Math.min(innerWidth, Math.max(...boxes.map(box => box.right)) + 12) - x, height: Math.min(innerHeight, bottom + 12) - y, bottom };
    });
    expect(sceneBox.bottom).toBeLessThanOrEqual(820);
    expect(sceneBox.y + sceneBox.height).toBeLessThanOrEqual(820);
    await page.screenshot({ path: info.outputPath(`portraits-${locale}.png`), clip: sceneBox, animations: "disabled" });
  });

  test(`README image library and personal emotions ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 960, height: 1000 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await expect(page.locator(".dr-character-row")).toHaveCount(2);
    // Render the project's own vector silhouettes as local sample PNG files.
    const samples = await page.evaluate(async () => {
      const { silhouetteSource } = await import("/src/core/characters.ts" as string);
      const result: string[] = [];
      for (const gender of ["female", "neutral", "male"]) {
        const image = new Image(); image.src = silhouetteSource(gender); await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 256;
        canvas.getContext("2d")!.drawImage(image, 0, 0, 192, 256);
        result.push(canvas.toDataURL("image/png").split(",")[1]!);
      }
      const cast = (window as any).getCast();
      (window as any).setCast({ entities: cast.entities.map((person: any) => person.id === "mira" ? { ...person, characterSheet: { ...person.characterSheet, appearance: "" } } : person) });
      return result;
    });
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const dialog = page.getByRole("dialog");
    await characterTab(dialog, "images", locale);
    const library = dialog.locator(".dr-portrait-library");
    await library.locator("input[type=file]").setInputFiles(samples.map((data, i) => ({ name: `sample-${i + 1}.png`, mimeType: "image/png", buffer: Buffer.from(data, "base64") })));
    await expect(library.locator(".dr-library-image[aria-pressed=true]")).toHaveCount(3);
    await library.locator(".dr-library-emotions summary").click();
    await library.getByRole("checkbox", { name: emotionOptionLabel(locale, "surprised"), exact: true }).check();
    await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(node => node.clientWidth));
    await capture(page, dialog, info, `images-${locale}.png`);
    await library.getByRole("button", { name: locale === "ru" ? "Назначить эмоции" : "Assign to emotion", exact: true }).click();
    await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
    await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
    await characterTab(dialog, "profile", locale);
    const policy = dialog.locator(".dr-emotion-policy");
    await policy.locator("summary").first().click();
    await policy.getByRole("switch", { name: emotionPolicyText(locale, "allow", { emotion: emotionOptionLabel(locale, "angry") }), exact: true }).uncheck();
    await expect(policy.getByRole("switch").first()).toBeDisabled();
    await capture(page, policy, info, `emotions-${locale}.png`, 0);
  });

  test(`README relationships and new world ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 960, height: 960 });
    await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`);
    const t = (key: Parameters<typeof relationshipText>[1]) => relationshipText(locale, key);
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: t("title"), exact: true }).click();
    await dialog.getByLabel(t("boundaries"), { exact: true }).fill(locale === "ru" ? "Ценит честность. Доверяет поступкам, а не обещаниям. Не любит давление." : "Values honesty. Trusts actions, not promises. Dislikes pressure.");
    await expect(dialog.getByRole("region", { name: t("current"), exact: true }).getByLabel(t("trust"), { exact: true })).toHaveValue("65");
    await dialog.locator(".dr-character-editor-body").evaluate(node => { node.scrollTop = 0; });
    await capture(page, dialog, info, `relationships-${locale}.png`);
    // The relationship draft is deliberately not committed.
    page.once("dialog", prompt => prompt.accept());
    await dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).last().click();
    await sidepanel(page, locale);
    await page.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true }).click();
    await page.getByRole("button", { name: locale === "ru" ? "Открыть карту мира" : "Open world map", exact: true }).click();
    const workspace = page.getByRole("dialog", { name: locale === "ru" ? "Карта мира" : "World map", exact: true });
    await workspace.getByRole("button", { name: locale === "ru" ? "Развернуть на весь экран" : "Expand to full screen", exact: true }).click();
    await workspace.getByRole("button", { name: mapText(locale, "emptyWorld"), exact: true }).click();
    const form = page.locator(".lm-create-dialog");
    await form.getByLabel(locale === "ru" ? "Название" : "Name", { exact: true }).fill(locale === "ru" ? "Тихая гавань" : "Quiet harbor");
    await form.locator("summary").filter({ hasText: t("setupTitle") }).click();
    await form.getByLabel(t("heroName"), { exact: true }).fill(locale === "ru" ? "Леон" : "Leon");
    await form.getByRole("button", { name: t("addPerson"), exact: true }).click();
    await form.getByLabel(`${t("personName")} 1`, { exact: true }).fill(locale === "ru" ? "Мира" : "Mira");
    await form.getByLabel(t("preset"), { exact: true }).selectOption("friend");
    await expect(form.getByLabel(t("trust"), { exact: true })).toHaveValue("65");
    await form.evaluate(node => { node.scrollTop = 0; });
    await expect(form).toHaveJSProperty("scrollWidth", await form.evaluate(node => node.clientWidth));
    await capture(page, form, info, `new-world-${locale}.png`);
  });

  test(`README characteristics and consequences ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 960, height: 960 });
    await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`);
    const t = (key: Parameters<typeof progressText>[1]) => progressText(locale, key);
    await page.locator(".dr-character-row").filter({ hasText: "Leon" }).click();
    const dialog = page.getByRole("dialog");
    await characterTab(dialog, "scene", locale);
    await dialog.getByRole("button", { name: t("starter"), exact: true }).click();
    await expect(dialog.locator(".dr-attribute-editor")).toBeVisible();
    await dialog.locator(".dr-attribute-editor").evaluate(node => node.scrollIntoView({ block: "start" }));
    await capture(page, dialog, info, `characteristics-${locale}.png`);
    await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
    await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
    await dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).last().click();
    const quote = locale === "ru" ? "Мира поблагодарила Леона за сдержанное обещание." : "Mira thanked Leon for keeping his promise.";
    await page.evaluate(({ locale, quote }) => (window as any).playEvent({ quote, reason: locale === "ru" ? "Она ценит сдержанные обещания" : "She values kept promises" }, quote), { locale, quote });
    await expect(page.locator(".dr-turn-feedback")).toContainText(locale === "ru" ? "Доверие +3" : "Trust +3");
    await page.locator(".dr-turn-feedback").getByText(t("evidence"), { exact: true }).click();
    await capture(page, page.locator(".dr-characters"), info, `progress-${locale}.png`);
  });

  test(`README world map ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await sidepanel(page, locale);
    await page.evaluate(async locale => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const now = Date.now();
      await repository.put("world", { id: "demo", name: locale === "ru" ? "Обсерватория" : "The Observatory", description: "", color: "#9bbfc9", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now });
      const entries = locale === "ru" ? [["Мира — хранительница", "Мира охраняет обсерваторию."], ["Латунный ключ", "Ключ открывает северную дверь."], ["Сумерки", "Ворота города закрываются на закате."], ["Правило обсерватории", "Не входите в башню в одиночку."]] : [["Mira — keeper", "Mira protects the observatory."], ["The brass key", "The key opens the north door."], ["Nightfall", "The city gates close at dusk."], ["Observatory rule", "Do not enter the tower alone."]];
      for (const [i, [title, content]] of entries.entries()) await repository.put("entry", { id: `demo-${i}`, worldId: "demo", bookId: null, title, content, mapCategory: ["characters", "locations", "timeline", "rules"][i], keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: now, updatedAt: now });
    }, locale);
    await page.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true }).click();
    await page.getByRole("button", { name: locale === "ru" ? /^Библиотека мира:/ : /^World library:/ }).click();
    await page.getByRole("menuitemradio", { name: locale === "ru" ? "Обсерватория" : "The Observatory", exact: true }).click();
    await page.getByRole("button", { name: locale === "ru" ? "Открыть карту мира" : "Open world map", exact: true }).click();
    const map = page.getByRole("dialog", { name: locale === "ru" ? "Карта мира" : "World map", exact: true });
    await map.getByRole("button", { name: locale === "ru" ? "Развернуть на весь экран" : "Expand to full screen", exact: true }).click();
    await expect(map.locator(".lm-node.node-entry")).toHaveCount(4);
    await expect.poll(async () => (await map.boundingBox())?.height).toBe(900);
    await map.getByRole("button", { name: mapText(locale, "overview"), exact: true }).click();
    await capture(page, map, info, `map-${locale}.png`, 0);
  });

  test(`README memory and approved changes ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 960, height: 900 });
    await page.goto(`/tests/fixtures/page-widget.html?assistant=1&locale=${locale}`);
    await page.evaluate(locale => {
      document.querySelector("#underlying-chat-control")?.remove();
      const entry = { id: "m1", bookId: null, title: locale === "ru" ? "Клятва Миры" : "Mira's oath", content: locale === "ru" ? "Мира останется в городе до рассвета." : "Mira will stay in town until sunrise.", keywords: ["Mira"], activation: "smart", priority: "high", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
      (window as any).setWidgetState({ contextPosition: { x: 24, y: 24 }, proposals: [{ id: "batch", worldId: null, bookId: null, chatId: "chat", focusIds: [], requestType: "memory-analysis", createdAt: 1, updatedAt: 1, items: [{ id: "c", title: entry.title, content: locale === "ru" ? "Теперь обещание действует до полудня." : "The promise now expires at noon.", keywords: [], activation: "smart", priority: "normal", bookId: null, selected: true, targetEntryId: entry.id, expectedEntry: entry }] }] });
    }, locale);
    await page.getByRole("button", { name: locale === "ru" ? "Проверить изменения" : "Review changes", exact: true }).click();
    const review = page.getByRole("region", { name: locale === "ru" ? "Проверить изменения" : "Review changes", exact: true });
    await review.locator(".dr-proposal-summary").click();
    await review.getByRole("checkbox").check();
    await expect(review.getByRole("button", { name: locale === "ru" ? "Сохранить выбранное · 1" : "Save selected changes · 1", exact: true })).toBeVisible();
    await capture(page, page.locator(".dr-panel").filter({ has: review }), info, `review-${locale}.png`, 0);
    await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
    await page.evaluate(locale => {
      document.querySelector("#underlying-chat-control")?.remove();
      const rows = locale === "ru" ? [["Правила истории", "Сохраняйте медленный темп. Не описывайте действия за героя.", "always"], ["Мира — хранительница", "Мира охраняет обсерваторию и ценит честность.", "smart"], ["Латунный ключ", "Ключ открывает северную дверь башни.", "manual"], ["Последняя сцена", "Герой вернул письмо. Мира согласилась помочь.", "smart"]] : [["Story rules", "Keep a slow pace. Do not decide the protagonist's actions.", "always"], ["Mira — keeper", "Mira protects the observatory and values honesty.", "smart"], ["The brass key", "The key opens the tower's north door.", "manual"], ["Last scene", "The protagonist returned the letter. Mira agreed to help.", "smart"]];
      const selected = rows.map(([title, content, activation], i) => ({ entry: { id: `m-${i}`, worldId: "w", bookId: null, title, content, activation, keywords: [], priority: "high", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 }, score: 12, reasons: ["keyword"], estimatedTokens: 50, manuallySelected: activation === "manual" }));
      (window as any).setWidgetState({ selection: { entries: selected, estimatedTokens: 200, omittedCount: 0 }, availableEntries: selected.map(item => item.entry) });
    }, locale);
    await page.locator('[data-widget="memory"]>button').click();
    const memory = page.getByRole("region", { name: locale === "ru" ? "Подключённая память" : "Selected memory", exact: true });
    await expect(memory).toBeVisible();
    await expect(memory).toHaveJSProperty("scrollWidth", await memory.evaluate(node => node.clientWidth));
    await capture(page, memory, info, `memory-${locale}.png`, 0);
  });

  test(`README panel settings and continuation ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 460, height: 980 });
    await sidepanel(page, locale);
    await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
    const card = page.locator(".settings-card").filter({ hasText: locale === "ru" ? "Панели и сцена" : "Panels and scene" });
    await expect(card.getByRole("slider")).toHaveValue("224");
    await capture(page, card, info, `settings-${locale}.png`);
    await page.getByRole("button", { name: locale === "ru" ? "Игра" : "Play", exact: true }).click();
    const continuation = page.locator(".play-continuation");
    await continuation.locator(":scope > summary").click();
    await expect(continuation.getByRole("button", { name: locale === "ru" ? "Продолжить в новом чате" : "Continue in a new chat", exact: true })).toBeEnabled();
    const hero = continuation.locator(".handoff-hero");
    await hero.evaluate(node => node.scrollIntoView({ block: "start" }));
    await capture(page, hero, info, `continuation-${locale}.png`);
  });

  test(`README context warning ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto(`/tests/fixtures/context-warning.html?locale=${locale}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: locale === "ru" ? "Продолжить в новом чате" : "Continue in a new chat", exact: true })).toBeEnabled();
    await capture(page, dialog, info, `warning-${locale}.png`, 24);
  });
}
