import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";
import { menuText } from "../../src/core/menu-i18n";
import { sceneText } from "../../src/core/scene-i18n";
import { experienceText } from "../../src/core/experience-i18n";
import { navigationText } from "../../src/core/navigation-i18n";

test("imports a DeepRole world larger than the old 10 MB limit", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
  const world = { id: "portable-world", name: "Перенесённый мир", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const pack = { format: "deeprole-world", version: 1, records: [{ kind: "world", id: world.id, data: world }] };
  const buffer = Buffer.from(JSON.stringify(pack) + " ".repeat(10_100_000));
  expect(buffer.byteLength).toBeGreaterThan(10_000_000);
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "portable-world.json", mimeType: "application/json", buffer });
  await expect(page.getByText("Распознан мир DeepRole", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Перенесённый мир", exact: true })).toBeVisible();
});

for (const locale of ["ru", "en"] as const) test(`opens a centered lore-import window and previews dropped files (${locale})`, async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  if (locale === "en") {
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await setEnglish(page);
  }
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.getByRole("button", { name: l("Миры", "Worlds"), exact: true }).click();
  await page.getByRole("button", { name: l("Загрузить мир из файла", "Load a world from a file"), exact: true }).click();
  const importDialog = page.getByRole("dialog", { name: l("Добавить из файла", "Add from file"), exact: true });
  await expect(importDialog).toBeVisible();
  await expect(page.locator(".lore-import-backdrop")).toHaveCSS("animation-name", "none");
  await expect(importDialog).toHaveCSS("opacity", "1");
  const panelColor = await importDialog.evaluate(node => getComputedStyle(node).getPropertyValue("--dr-panel").trim());
  await expect(importDialog).toHaveCSS("background-color", await importDialog.evaluate((node, color) => { const probe = document.createElement("span"); probe.style.color = color; node.append(probe); const result = getComputedStyle(probe).color; probe.remove(); return result; }, panelColor));
  const dialogBox = await importDialog.boundingBox(); const viewport = page.viewportSize()!;
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  const dropzone = page.locator(".rp-import-dropzone");
  await expect(dropzone).toContainText(l("Перетащите сюда JSON-файл", "Drop a JSON file here"));
  const transfer = await page.evaluateHandle((json) => { const value = new DataTransfer(); value.items.add(new File([json], "Тестовый мир.json", { type: "application/json" })); return value; }, JSON.stringify({ name: "Тестовый мир", entries: [{ title: "Правило", content: "Сохранить", activation: "always" }] }));
  await dropzone.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(dropzone).toHaveClass(/is-dragging/);
  await dropzone.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByText(l("Распознаны записи JSON", "JSON entries recognized"), { exact: true })).toBeVisible();
  // No transparency phase: the dialog is readable as soon as it opens.
  expect((await new AxeBuilder({ page }).include(".lore-import-modal").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
});

test("imports BDS only after preview, links a profile, and isolates the library", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
  // The file chooser and the drag-and-drop path use the same preview and validation.
  const source = { "  Оригинал  ": { value: "  Текст\nс переносом.  ", importance: "called" }, "Правило": { value: "Сохранить", importance: "always" } };
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Тестовый мир.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
  await expect(page.getByText("2 записей · всегда: 1 · автоподбор: 1 · вручную: 0 · выключено: 0")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить в библиотеку", exact: true })).toBeEnabled();
  await page.locator(".rp-import-preview summary").first().click();
  expect(await page.locator(".rp-import-preview pre").first().textContent()).toBe(source["  Оригинал  "].value);
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Тестовый мир", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Мир и профили", exact: true }).click();
  await page.getByRole("button", { name: "Добавить профиль", exact: true }).click();
  await page.getByRole("textbox", { name: "Название", exact: true }).fill("Мира");
  await page.getByRole("checkbox", { name: /Оригинал/ }).check();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мира", exact: true })).toBeVisible();
  await expect(page.getByText("Связанная память: 1", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("worlds-profiles.png"), fullPage: true });
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await expect(page.getByText("Оригинал", { exact: true })).toBeVisible();
  await expect(page.getByText("Клятва Миры", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Карта мира", exact: true }).click();
  await page.getByRole("button", { name: /^Библиотека мира:/ }).click();
  await page.getByRole("menuitemradio", { name: "Без мира", exact: true }).click();
  await expect(page.getByText("Клятва Миры", { exact: true })).toBeVisible();
  await expect(page.getByText("Оригинал", { exact: true })).toHaveCount(0);
});

test("creates editable worlds and starters without sending anything", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Создать свой мир", exact: true }).click();
  await page.getByRole("textbox", { name: "Название", exact: true }).fill("Новый мир");
  await page.getByRole("button", { name: "Создать мир", exact: true }).click();
  await page.getByRole("button", { name: "Закрыть карту", exact: true }).click();
  await page.getByRole("button", { name: "Мир и профили", exact: true }).click();
  await page.locator('details:has(select[aria-label="Перенести книгу в этот мир"]) > summary').click();
  await page.getByRole("combobox", { name: "Перенести книгу в этот мир", exact: true }).selectOption({ label: "Лунный предел" });
  await expect(page.getByRole("checkbox", { name: "Лунный предел", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Создать заготовку", exact: true }).click();
  await page.getByRole("textbox", { name: "Название", exact: true }).fill("Первая встреча");
  await page.getByRole("textbox", { name: "Первая реплика", exact: true }).fill("Открываю дверь.");
  await page.getByRole("textbox", { name: "Исходное состояние сюжета", exact: true }).fill("Раннее утро.");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Первая встреча", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Подготовить в пустом чате", exact: true }).click();
  await expect(page.getByText("Откройте DeepSeek, чтобы изменить сцену чата.")).toBeVisible();
});

test("world tree edits entry relationships without changing lore", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Древо.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ "Башня": { value: "Исходный текст башни", importance: "always" }, "Дверь": { value: "Исходный текст двери", importance: "called" } })) });
  await expect(page.getByText("Распознана память Better Deepseek (BDS)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  const tower = page.locator(".memory-card").filter({ has: page.getByRole("heading", { name: "Башня", exact: true }) });
  await tower.getByRole("button", { name: "Изменить", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const linksSummary = dialog.locator(".rp-entry-links summary").filter({ hasText: /^Связи с другими записями/ });
  // Let Firefox finish focus-induced scrolling inside the bottom sheet before
  // Playwright calculates the click point. Still one normal, unforced click.
  await linksSummary.focus(); await linksSummary.click();
  await expect(dialog.locator(".rp-entry-links").last()).toHaveAttribute("open", "");
  await dialog.getByRole("checkbox", { name: "Дверь", exact: true }).check();
  await dialog.getByRole("textbox", { name: "Описание связи: Дверь", exact: true }).fill("возможный выход");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await tower.getByRole("button", { name: "Изменить", exact: true }).click();
  await linksSummary.focus(); await linksSummary.click();
  await expect(dialog.getByRole("checkbox", { name: "Дверь", exact: true })).toBeChecked();
  await expect(dialog.getByRole("textbox", { name: "Описание связи: Дверь", exact: true })).toHaveValue("возможный выход");
  await expect(dialog.locator("textarea").first()).toHaveValue("Исходный текст башни");
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Новая запись", exact: true }).click();
  await dialog.locator("input.input").first().fill("Новое событие");
  await dialog.locator("textarea").first().fill("Поздний дождь.");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Новое событие", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("world-tree.png"), fullPage: true });
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("same importer recognizes a DeepRole world and refuses unrelated JSON", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
  const input = page.getByLabel("Выбрать JSON", { exact: true });
  await input.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"format":"deeprole-backup"}') });
  await expect(page.getByRole("alert")).toHaveText("Не удалось прочитать резервную копию");
  await expect(page.getByRole("button", { name: "Сохранить в библиотеку", exact: true })).toHaveCount(0);
  const world = { id: "world", name: "Из DeepRole", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  await input.setInputFiles({ name: "world.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "deeprole-world", version: 1, records: [{ kind: "world", id: world.id, data: world }] })) });
  await expect(page.getByText("Распознан мир DeepRole", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Из DeepRole", exact: true })).toBeVisible();
});

test("RPG map supports window/full-screen, pan, zoom, search and node editing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
  const world = { id: "w", name: "Лунная экспедиция", description: "Только тестовый мир", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const entry = (id: string, title: string, content: string) => ({ id, title, content, entityIds: id === "tower" ? ["character"] : [], worldId: "w", bookId: null, keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 });
  const entries = [ { ...entry("tower", "Северная башня", "Наблюдательная башня у озера."), links: [{ targetId: "door", label: "возможный проход", mode: "context" }] }, entry("door", "Закрытая дверь", "Старинная дверь с печатью."), entry("moon", "Лунный камень", "Светится ночью."), entry("oath", "Клятва", "Сохранить тайну."), entry("lake", "Озеро", "Холодное озеро."), entry("bridge", "Мост", "Соединяет берега.") ];
  const entity = { id: "character", worldId: "w", kind: "character", name: "Проводник", description: "Тестовый персонаж", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 };
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "map.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "deeprole-world", version: 1, records: [{ kind: "world", id: "w", data: world }, { kind: "entity", id: entity.id, data: entity }, ...entries.map((data) => ({ kind: "entry", id: data.id, data }))] })) });
  await page.getByRole("button", { name: "Сохранить в библиотеку", exact: true }).click();
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  const map = page.getByRole("dialog", { name: "Карта мира", exact: true });
  await map.getByRole("button", { name: "Развернуть на весь экран", exact: true }).click();
  await expect(map).toHaveClass(/is-full/);
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(6);
  await expect(map.locator(".lm-node.node-world")).toHaveCount(1);
  await expect(map.locator(".edge-context")).toHaveCount(0);
  const before = await map.locator(".lm-space").getAttribute("style");
  const bounds = (await map.locator(".lm-viewport").boundingBox())!;
  await page.mouse.move(bounds.x + 12, bounds.y + 12); await page.mouse.down({ button: "middle" }); await page.mouse.move(bounds.x + 82, bounds.y + 52); await page.mouse.up({ button: "middle" });
  expect(await map.locator(".lm-space").getAttribute("style")).not.toBe(before);
  const zoomBefore = parseInt((await map.locator("output").textContent())!);
  await map.getByRole("button", { name: "Приблизить", exact: true }).click();
  expect(parseInt((await map.locator("output").textContent())!)).toBeGreaterThan(zoomBefore);
  await map.getByRole("button", { name: "Свернуть в окно", exact: true }).click();
  await expect(map).toHaveClass(/is-compact/);
  await map.getByRole("button", { name: "Развернуть на весь экран", exact: true }).click();
  await expect(map).toHaveClass(/is-full/);
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("Северная");
  await map.locator(".lm-results").getByRole("button", { name: "Северная башня", exact: true }).click();
  await expect(map.locator(".lm-details h3")).toHaveText("Северная башня");
  await expect(map.locator(".lm-details")).toContainText("возможный проход");
  await expect(map.locator(".edge-context")).toHaveClass(/is-highlighted/);
  await page.screenshot({ path: testInfo.outputPath("rpg-lore-map.png") });
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await map.getByText("Дополнительные действия", { exact: true }).click();
  await map.getByRole("button", { name: "Все настройки записи", exact: true }).click();
  await expect(map).toHaveCount(0);
  await expect(page.getByRole("dialog").locator("textarea").first()).toHaveValue("Наблюдательная башня у озера.");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(map).toHaveCount(0);
});

for (const locale of ["ru", "en"] as const) test(`imports to the library if the chosen chat switched ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 460 });
  await page.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
  await page.goto("/tests/fixtures/sidepanel.html?world&locale=" + locale);
  const worldPicker = page.getByRole("combobox", { name: locale === "ru" ? "Мир" : "World", exact: true });
  await page.locator(".dr-play-scene > summary").click();
  await expect(worldPicker).toHaveValue("world-a");
  await page.evaluate(() => {
    const tabs = (window as any).chrome.tabs;
    const query = tabs.query;
    tabs.query = async () => (await query()).map((tab: object) => ({ ...tab, title: "Lighthouse archive - DeepSeek" }));
    (window as any).setPageState({});
    (window as any).importSceneCalls = [];
    const send = tabs.sendMessage;
    tabs.sendMessage = async (tabId: number, message: { type: string }) => {
      if (message.type === "DR_SET_SCENE") { (window as any).importSceneCalls.push({ tabId, message }); return { ok: true }; }
      return send(tabId, message);
    };
  });
  await page.getByRole("button", { name: navigationText(locale, "worlds"), exact: true }).click();
  await page.getByRole("button", { name: experienceText(locale, "import"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: sceneText(locale, "importFile"), exact: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
  await dialog.getByLabel(sceneText(locale, "chooseFile"), { exact: true }).setInputFiles({
    name: "alternate-lore.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ name: "Harbor Archive", entries: [{ title: "Archive", content: "A workshop is beside the harbor.", activation: "always" }] })),
  });
  const attach = dialog.getByRole("checkbox", { name: menuText(locale, "attachImport"), exact: true });
  await expect(attach).not.toBeChecked();
  await expect(attach).toHaveAccessibleDescription(sceneText(locale, "importChatName", { chat: "Lighthouse archive" }));
  await attach.press("Space");
  await expect(attach).toBeChecked();
  await expect(attach).toHaveAccessibleDescription(sceneText(locale, "importChatName", { chat: "Lighthouse archive" }) + " · " + menuText(locale, "replaceImportHint"));
  const submit = dialog.getByRole("button", { name: menuText(locale, "importAndAttach"), exact: true });
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await dialog.locator(".modal-body").evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.evaluate(() => {
    (window as any).chrome.tabs.query = async () => [{ id: 2, url: "https://chat.deepseek.com/a/chat/next" }];
    (window as any).setPageState({ chatId: "next", chatUrl: "https://chat.deepseek.com/a/chat/next", scene: { worldId: "world-b", bookId: null, focusIds: [] } });
  });
  await submit.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Harbor Archive", exact: true })).toBeVisible();
  await expect(page.getByText(menuText(locale, "savedNotAttached"), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).importSceneCalls)).toEqual([]);
});
