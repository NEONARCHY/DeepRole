import { setEnglish } from "./helpers/settings";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const patterns = ["Правила_мира", "Правила_чата", "Принцип_темп", "Мира_тело", "Мира_характер", "Мира_мысли", "Мира_внешность", "Комната", "Сцена_встречи", "Неделя", "Фетиши", "Заметка"];
const sample = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [patterns[i % patterns.length] + "_" + i, { value: "  Original test lore " + i + "\nkept intact.  ", importance: "called" }]));
async function openMap(page: Page) {
  await page.setViewportSize({ width: 1320, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Обсерватория.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
  await page.getByRole("button", { name: "Подтвердить импорт", exact: true }).click();
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  return page.getByRole("dialog", { name: "Карта мира", exact: true });
}
async function find(page: Page, title: string) {
  const map = page.getByRole("dialog", { name: "Карта мира", exact: true });
  const connecting = await map.locator(".lm-notice").count() > 0;
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill(title.replaceAll("_", " "));
  await map.locator(".lm-results").getByRole("button", { name: title.replaceAll("_", " "), exact: true }).click();
  if (!connecting) { await expect(map.locator(".lm-memory-editor")).toBeVisible(); await map.getByText("Дополнительные действия", { exact: true }).click(); }
  return map.locator('.lm-node.node-entry[aria-pressed="true"]');
}
async function records(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/storage/repository.ts";
    const { repository } = await import(path);
    return repository.rawRecords();
  });
}

test("map actions have delayed hover help without question-mark badges", async ({ page }, testInfo) => {
  const map = await openMap(page);
  await expect(map).toHaveClass(/is-full/);
  await expect(map).toHaveAttribute("aria-modal", "true");
  await expect(map.locator(".lm-tools .dr-help")).toHaveCount(0);
  await expect(map.locator(".lm-node-wrap .dr-help")).toHaveCount(0);
  const zoom = map.getByRole("button", { name: "Приблизить", exact: true });
  await expect(zoom).not.toHaveAttribute("title", /.+/);
  const help = page.getByRole("tooltip");
  await zoom.hover();
  await page.waitForTimeout(650);
  await expect(help).toHaveCount(0);
  await expect(help).toBeVisible();
  await expect(help).toContainText("Приблизить");
  await help.hover();
  await page.waitForTimeout(250);
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(map).toBeVisible();
  const scale = await map.locator(".lm-tools output").textContent();
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(zoom).toBeFocused();
  await expect(help).toBeVisible();
  await zoom.click();
  await expect(help).toHaveCount(0);
  await expect(map.locator(".lm-tools output")).not.toHaveText(scale!);
  await page.screenshot({ path: testInfo.outputPath("map-without-help-badges.png") });
  const accessibility = await new AxeBuilder({ page }).include(".dr-loremap").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("map autosave supports undo, redo and a confirmed, undoable session reset", async ({ page }) => {
  const map = await openMap(page);
  const opening = await records(page);
  const world = () => records(page).then((rows: any[]) => rows.find((r) => r.kind === "world").data);
  const undo = map.getByRole("button", { name: "Отменить", exact: true });
  const redo = map.getByRole("button", { name: "Повторить", exact: true });
  const reset = map.getByRole("button", { name: "Сбросить", exact: true });
  await expect(undo).toBeDisabled(); await expect(redo).toBeDisabled(); await expect(reset).toBeDisabled();
  const location = map.locator('[data-lore-id="branch:locations"]');
  await location.focus(); await location.press("Alt+ArrowRight"); await expect(undo).toBeEnabled();
  const moved = (await world()).mapLayout.positions;
  await location.press("Control+z"); await expect(redo).toBeEnabled(); expect((await world()).mapLayout.positions).toEqual({});
  await map.locator(".lm-viewport").focus(); await page.keyboard.press("Control+Shift+z"); await expect(undo).toBeEnabled(); expect((await world()).mapLayout.positions).toEqual(moved);
  const search = map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true });
  await search.fill("Мира"); await search.press("Control+z"); expect((await world()).mapLayout.positions).toEqual(moved); await search.fill("");
  await map.getByRole("button", { name: "Добавить ветвь", exact: true }).click();
  const branch = map.getByRole("region", { name: "Добавить ветвь", exact: true });
  await branch.getByRole("textbox", { name: "Название ветви", exact: true }).fill("Путь домой");
  await branch.getByRole("button", { name: "Добавить", exact: true }).click(); await expect(branch).toHaveCount(0); await expect(undo).toBeEnabled();
  await find(page, "Заметка_11"); await map.getByRole("combobox", { name: "Раздел карты", exact: true }).selectOption("body"); await expect(undo).toBeEnabled();
  await map.getByRole("button", { name: "Связать запись", exact: true }).click(); await find(page, "Комната_7");
  const connection = map.getByRole("region", { name: "Связь записей", exact: true });
  await connection.getByRole("textbox", { name: "Что их связывает?", exact: true }).fill("возможный путь");
  await connection.getByRole("button", { name: "Сохранить связь", exact: true }).click(); await expect(connection).toHaveCount(0); await expect(undo).toBeEnabled();
  const changed = await records(page);
  const source = (rows: any[]) => rows.find((r) => r.kind === "entry" && r.data.title === "Заметка_11").data;
  expect(source(changed).links[0].label).toBe("возможный путь");
  await map.locator(".lm-viewport").focus(); await page.keyboard.press("Control+z"); await expect(redo).toBeEnabled(); expect(source(await records(page)).links).toBeUndefined();
  await page.keyboard.press("Control+Shift+z"); await expect(undo).toBeEnabled(); expect(source(await records(page)).links).toEqual(source(changed).links);
  const beforeCancel = await records(page);
  page.once("dialog", (dialog) => dialog.dismiss()); await reset.click(); expect(await records(page)).toEqual(beforeCancel);
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("при открытии"); void dialog.accept(); });
  await reset.click(); await expect(reset).toBeDisabled();
  expect((await world()).mapLayout).toEqual({ positions: {}, expandedIds: [], customCategories: [] });
  const resetRecords = (await records(page)).filter((r: any) => r.kind === "entry").map((r: any) => ({ ...r, data: { ...r.data, updatedAt: 1 } }));
  expect(resetRecords).toEqual(opening.filter((r: any) => r.kind === "entry").map((r: any) => ({ ...r, data: { ...r.data, updatedAt: 1 } })));
  await undo.click(); await expect(reset).toBeEnabled(); expect((await world()).mapLayout.positions).toEqual(moved); expect(source(await records(page)).links).toEqual(source(changed).links);
  await map.getByRole("button", { name: "Закрыть карту", exact: true }).click(); await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  await expect(undo).toBeDisabled(); await expect(reset).toBeDisabled();
});

test("map drafts survive undo and reset only after confirmation", async ({ page }) => {
  const map = await openMap(page);
  const location = map.locator('[data-lore-id="branch:locations"]');
  await location.focus(); await location.press("Alt+ArrowRight"); await expect(map.getByRole("button", { name: "Отменить", exact: true })).toBeEnabled();
  await map.getByRole("button", { name: "Добавить ветвь", exact: true }).click();
  const branch = map.getByRole("region", { name: "Добавить ветвь", exact: true });
  const name = branch.getByRole("textbox", { name: "Название ветви", exact: true }); await name.fill("Черновик");
  await map.getByRole("button", { name: "Отменить", exact: true }).click(); await expect(name).toHaveValue("Черновик");
  const reset = map.getByRole("button", { name: "Сбросить", exact: true }); await expect(reset).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss()); await reset.click(); await expect(name).toHaveValue("Черновик");
  page.once("dialog", (dialog) => dialog.accept()); await reset.click(); await expect(branch).toHaveCount(0); await expect(reset).toBeDisabled();
});

test("map help and popovers remain usable in a narrow browser panel", async ({ page }, testInfo) => {
  const map = await openMap(page); await page.setViewportSize({ width: 420, height: 800 });
  const tools = map.locator(".lm-tools"); const bounds = (await tools.boundingBox())!;
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("Мира");
  const results = (await map.locator(".lm-results").boundingBox())!;
  expect(results.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("");
  await map.getByRole("button", { name: "Добавить ветвь", exact: true }).click();
  const form = (await map.getByRole("region", { name: "Добавить ветвь", exact: true }).boundingBox())!;
  expect(form.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  expect(form.x + form.width).toBeLessThanOrEqual(420);
  await page.screenshot({ path: testInfo.outputPath("narrow-map-tools.png") });
});

test("opening or reopening the map reveals every nested branch without rewriting lore", async ({ page }) => {
  const map = await openMap(page);
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(60);
  await expect(map.locator('.lm-node[aria-expanded="false"]')).toHaveCount(0);
  const original = (await records(page)).filter((row: any) => row.kind === "entry");
  const characters = map.locator('[data-lore-id="branch:characters"]');
  await characters.dblclick();
  await expect(characters).toHaveAttribute("aria-expanded", "false");
  await map.getByRole("button", { name: "Закрыть карту", exact: true }).click();
  await page.evaluate(async () => {
    const path = "/src/storage/repository.ts";
    const { repository } = await import(path);
    const [world] = await repository.list("world");
    await repository.put("world", { ...world, mapLayout: { positions: {}, expandedIds: ["branch:characters"], customCategories: [] } });
  });
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(60);
  await expect(map.locator('.lm-node[aria-expanded="false"]')).toHaveCount(0);
  expect((await records(page)).filter((row: any) => row.kind === "entry")).toEqual(original);
});

test("branch toggles and breadcrumb selection do not move or zoom the camera", async ({ page }) => {
  const map = await openMap(page);
  const camera = () => map.locator(".lm-space").evaluate((element) => (element as HTMLElement).style.transform);
  const rules = map.locator('[data-lore-id="branch:rules"]');
  const characters = map.locator('[data-lore-id="branch:characters"]');
  await expect(rules).toHaveAttribute("aria-expanded", "true");
  await map.locator(".lm-viewport").focus();
  await page.keyboard.press("ArrowRight");
  const before = await camera();
  const position = await rules.locator("..").getAttribute("style");
  await rules.click();
  await expect(rules).toHaveAttribute("aria-expanded", "true");
  expect(await camera()).toBe(before);
  await rules.dblclick();
  await expect(rules).toHaveAttribute("aria-expanded", "false");
  expect(await camera()).toBe(before);
  await rules.dblclick();
  await expect(rules).toHaveAttribute("aria-expanded", "true");
  expect(await camera()).toBe(before);
  expect(await rules.locator("..").getAttribute("style")).toBe(position);
  await expect(characters).toHaveAttribute("aria-expanded", "true");
  await rules.dblclick();
  await expect(rules).toHaveAttribute("aria-expanded", "false");
  expect(await camera()).toBe(before);
  await rules.focus(); await page.keyboard.press("Enter");
  await expect(rules).toHaveAttribute("aria-expanded", "false");
  await rules.press("Alt+Enter");
  await expect(rules).toHaveAttribute("aria-expanded", "true");
  expect(await camera()).toBe(before);
  const viewCenter = () => map.locator(".lm-viewport").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const matrix = new DOMMatrix(getComputedStyle(element.querySelector(".lm-space")!).transform);
    return { x: (rect.width / 2 - matrix.e) / matrix.a, y: (rect.height / 2 - matrix.f) / matrix.a, zoom: matrix.a };
  });
  const view = await viewCenter();
  await page.setViewportSize({ width: 1120, height: 780 });
  await expect.poll(async () => {
    const current = await viewCenter();
    return Math.max(Math.abs(current.x - view.x), Math.abs(current.y - view.y), Math.abs(current.zoom - view.zoom));
  }).toBeLessThan(0.05); // CSSOM rounds large translations; this is < 0.03 screen px.
  expect((await viewCenter()).zoom).toBe(view.zoom);
  const resized = await camera();
  await map.locator(".lm-breadcrumb").getByText("Обсерватория", { exact: true }).click();
  expect(await camera()).toBe(resized);
});

test("60 records form a radial overview, draggable branches persist, and lore stays unchanged", async ({ page }, testInfo) => {
  const map = await openMap(page);
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(60);
  const primary = map.locator('.lm-node[data-lore-parent^="world:"]');
  await expect(primary).toHaveCount(10);
  const canvas = (await map.locator(".lm-viewport").boundingBox())!;
  const root = (await map.locator(".lm-node.node-world").boundingBox())!;
  expect(Math.abs(root.x + root.width / 2 - canvas.x - canvas.width / 2)).toBeLessThan(2);
  expect(Math.abs(root.y + root.height / 2 - canvas.y - canvas.height / 2)).toBeLessThan(2);
  const orbit = await primary.evaluateAll((elements) => elements.map((element) => { const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  const origin = { x: root.x + root.width / 2, y: root.y + root.height / 2 };
  const radius = Math.hypot(orbit[0]!.x - origin.x, orbit[0]!.y - origin.y);
  for (const point of orbit) {
    expect(Math.abs(Math.hypot(point.x - origin.x, point.y - origin.y) - radius)).toBeLessThan(1);
    expect(orbit.some((other) => Math.abs(other.x - (2 * origin.x - point.x)) < 1 && Math.abs(other.y - point.y) < 1)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("radial-world-overview.png") });
  await page.setViewportSize({ width: 920, height: 720 });
  await map.getByRole("button", { name: "Обзор", exact: true }).click();
  await expect.poll(async () => primary.evaluateAll((elements) => {
    const canvas = document.querySelector(".lm-viewport")!.getBoundingClientRect();
    return elements.every((element) => { const r = element.getBoundingClientRect(); return r.x >= canvas.x && r.right <= canvas.right && r.y >= canvas.y && r.bottom <= canvas.bottom; });
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("compact-world-overview.png") });
  await page.setViewportSize({ width: 1320, height: 900 });
  const before = await records(page);
  const location = map.locator('[data-lore-id="branch:locations"]');
  const bounds = (await location.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 40, { steps: 8 }); await page.mouse.up();
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  const changed = await records(page);
  const positions = changed.find((r: any) => r.kind === "world").data.mapLayout.positions;
  expect(positions["branch:locations"]).toBeTruthy();
  await map.getByRole("button", { name: "Закрыть карту", exact: true }).click();
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  const restoredX = await map.locator('[data-lore-id="branch:locations"]').locator("..").evaluate((element) => parseFloat((element as HTMLElement).style.left));
  expect(restoredX).toBeCloseTo(positions["branch:locations"].x, 1);
  const node = await find(page, "Мира_тело_3");
  await node.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  await page.screenshot({ path: testInfo.outputPath("character-body-branch.png") });
  const after = await records(page);
  const strings = (rows: any[]) => rows.filter((r) => r.kind === "entry").map((r) => [r.id, r.data.title, r.data.content, r.data.source]);
  expect(strings(after)).toEqual(strings(before));
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);
  await map.getByText("Дополнительно", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await map.getByRole("button", { name: "Вернуть расположение", exact: true }).click();
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(60);
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  expect((await records(page)).find((r: any) => r.kind === "world").data.mapLayout.positions).toEqual({});
});

test("custom branches, manual categorization and confirmed connections are editable on the map", async ({ page }) => {
  const map = await openMap(page);
  await map.getByRole("button", { name: "Добавить ветвь", exact: true }).click();
  const branchForm = map.getByRole("region", { name: "Добавить ветвь", exact: true });
  await branchForm.getByRole("textbox", { name: "Название ветви", exact: true }).fill("Секреты обсерватории");
  await branchForm.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(map.locator(".lm-details h3")).toHaveText("Секреты обсерватории");
  await find(page, "Мира_тело_3");
  await map.getByRole("combobox", { name: "Раздел карты", exact: true }).selectOption({ label: "Секреты обсерватории" });
  await expect(map.locator(".lm-recognition")).toContainText("Выбрано вручную");
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  await map.getByRole("button", { name: "Связать запись", exact: true }).click();
  await find(page, "Комната_7");
  const connectionForm = map.getByRole("region", { name: "Связь записей", exact: true });
  await connectionForm.getByRole("textbox", { name: "Что их связывает?", exact: true }).fill("возможный следующий эпизод");
  await connectionForm.getByRole("combobox", { name: "Как использовать связь", exact: true }).selectOption("context");
  await connectionForm.getByRole("button", { name: "Сохранить связь", exact: true }).click();
  await expect(connectionForm).toHaveCount(0);
  await expect(map.locator(".lm-connections")).toContainText("возможный следующий эпизод");
  await map.getByRole("button", { name: "Показать соседей", exact: true }).click();
  await expect(map.locator(".edge-context")).toHaveCount(1);
  await map.getByRole("button", { name: "Изменить связь", exact: true }).click();
  await connectionForm.getByRole("textbox", { name: "Что их связывает?", exact: true }).fill("только ссылка для будущего");
  await connectionForm.getByRole("combobox", { name: "Как использовать связь", exact: true }).selectOption("reference");
  await connectionForm.getByRole("button", { name: "Сохранить связь", exact: true }).click();
  await expect(connectionForm).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await map.getByRole("button", { name: "Убрать связь", exact: true }).click();
  await expect(map.locator(".lm-connections article")).toHaveCount(0);
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("Секреты обсерватории");
  await map.locator(".lm-results").getByRole("button", { name: "Секреты обсерватории", exact: true }).click();
  await map.getByText("Настройки ветви", { exact: true }).click();
  await map.getByRole("button", { name: "Переименовать ветвь", exact: true }).click();
  await map.getByRole("textbox", { name: "Название ветви", exact: true }).fill("Личные заметки");
  await map.getByRole("button", { name: "Сохранить название", exact: true }).click();
  await expect(map.locator(".lm-details h3")).toHaveText("Личные заметки");
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  page.once("dialog", (dialog) => dialog.accept());
  await map.getByRole("button", { name: "Удалить свою ветвь", exact: true }).click();
  await expect(map.locator(".lm-details h3")).toHaveText("Обсерватория");
  const rows = await records(page);
  const entries = rows.filter((r: any) => r.kind === "entry" && r.data.worldId);
  expect(entries).toHaveLength(60);
  for (const row of entries) expect(row.data.content).toBe(sample[row.data.title]!.value);
});

test("name clusters are suggestions until explicitly confirmed as a character", async ({ page }) => {
  const map = await openMap(page);
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("Мира");
  await map.locator(".lm-results").getByRole("button", { name: "Мира", exact: true }).click();
  await expect(map.locator(".lm-inference")).toBeVisible();
  await map.locator(".lm-inference > summary").click();
  expect((await records(page)).filter((r: any) => r.kind === "entity")).toEqual([]);
  await map.getByRole("textbox", { name: "Имя персонажа", exact: true }).fill("Мира");
  await map.getByRole("button", { name: "Создать персонажа · 20", exact: true }).click();
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  const rows = await records(page);
  expect(rows.filter((r: any) => r.kind === "entity")).toHaveLength(1);
  const linked = rows.filter((r: any) => r.kind === "entry" && r.data.entityIds?.length);
  expect(linked).toHaveLength(20);
  for (const row of linked) expect(row.data.content).toBe(sample[row.data.title]!.value);
});

test("ports draw confirmed connections and manual overlap never changes a category", async ({ page }, testInfo) => {
  const map = await openMap(page);
  await find(page, "Мира_тело_3");
  await map.getByRole("button", { name: "Закрыть окошко", exact: true }).click();
  for (let i = 0; i < 7; i++) await map.getByRole("button", { name: "Отдалить", exact: true }).click();
  const source = map.locator('.lm-node.node-entry[aria-label="Мира тело 3"]');
  const target = map.locator('.lm-node.node-entry[aria-label="Мира тело 15"]');
  const port = map.getByRole("button", { name: "Связать запись: Мира тело 3", exact: true });
  const from = (await port.boundingBox())!; const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 }); await page.mouse.up();
  const form = map.getByRole("region", { name: "Связь записей", exact: true });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "Что их связывает?", exact: true }).fill("сведения об одном персонаже");
  await form.getByRole("button", { name: "Сохранить связь", exact: true }).click();
  await expect(form).toHaveCount(0);
  const category = map.locator('[data-lore-id="branch:locations"]');
  const sourceBox = (await source.boundingBox())!; const categoryBox = (await category.boundingBox())!;
  const viewport = (await map.locator(".lm-viewport").boundingBox())!;
  const midpoint = { x: (sourceBox.x + sourceBox.width / 2 + categoryBox.x + categoryBox.width / 2) / 2, y: (sourceBox.y + sourceBox.height / 2 + categoryBox.y + categoryBox.height / 2) / 2 };
  const delta = { x: viewport.x + viewport.width / 2 - midpoint.x, y: viewport.y + viewport.height / 2 - midpoint.y };
  // Stay inside the browser window. The former top-left route ended above y=0,
  // where Firefox cannot deliver pointerup reliably through automation.
  const panStart = await page.evaluate(({ viewport, delta }) => {
    for (let y = viewport.y + 12; y < viewport.y + viewport.height - 12; y += 32) for (let x = viewport.x + 12; x < viewport.x + viewport.width - 12; x += 32) {
      if (x + delta.x < viewport.x + 8 || x + delta.x > viewport.x + viewport.width - 8 || y + delta.y < viewport.y + 8 || y + delta.y > viewport.y + viewport.height - 8) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest(".lm-viewport") && !hit.closest("button")) return { x, y };
    }
    throw new Error("No unobstructed pan route inside the viewport");
  }, { viewport, delta });
  await page.mouse.move(panStart.x, panStart.y); await page.mouse.down({ button: "middle" });
  await page.mouse.move(panStart.x + delta.x, panStart.y + delta.y, { steps: 10 }); await page.mouse.up({ button: "middle" });
  await map.locator(".lm-header h2").hover(); await expect(page.getByRole("tooltip")).toHaveCount(0);
  const a = (await source.boundingBox())!; const b = (await category.boundingBox())!;
  await page.screenshot({ path: testInfo.outputPath("before-drop.png") });
  const hits = await page.evaluate(({ a, b }) => [a, b].map((rect) => document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button")?.getAttribute("data-lore-id")), { a, b });
  expect(hits).toEqual([await source.getAttribute("data-lore-id"), "branch:locations"]);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 }); await page.mouse.up();
  await find(page, "Мира_тело_3");
  await expect(map.getByRole("combobox", { name: "Раздел карты", exact: true })).toHaveValue("");
  await expect(map.locator(".lm-save")).toHaveText("Сохранено");
  const rows = await records(page);
  const record = rows.find((r: any) => r.kind === "entry" && r.data.title === "Мира_тело_3").data;
  expect(record.content).toBe(sample["Мира_тело_3"]!.value);
  expect(record.links[0].label).toBe("сведения об одном персонаже");
  expect(record.mapCategory).toBeUndefined();
});

test("English UI and varied English title conventions work without Russian interface labels", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await setEnglish(page);
  await page.getByRole("button", { name: "Lore", exact: true }).click();
  await page.getByRole("button", { name: "Import existing lore", exact: true }).click();
  const data = { "MiraBody": { value: "Original body description.", importance: "called" }, "Character: Mira — Appearance": { value: "Original appearance.", importance: "called" }, "WritingStyle": { value: "Original writing preferences.", importance: "always" }, "DialogueFormat": { value: "Original chat format.", importance: "always" } };
  await page.getByLabel("Choose JSON", { exact: true }).setInputFiles({ name: "Observatory.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await page.getByRole("button", { name: "Confirm import", exact: true }).click();
  await page.getByRole("button", { name: "Open world map", exact: true }).click();
  const map = page.getByRole("dialog", { name: "World map", exact: true });
  await expect(map).toHaveClass(/is-full/);
  await expect(map.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(map.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
  await expect(map.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await map.getByRole("button", { name: "Zoom in", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Arrows pan");
  expect(await page.getByRole("tooltip").innerText()).not.toMatch(/[а-яё]/iu);
  await page.mouse.move(1, 1); await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(4);
  await expect(map.locator('.lm-node[aria-expanded="false"]')).toHaveCount(0);
  await expect(map.locator('[data-lore-id="branch:rules"]')).toHaveAccessibleName("Rules & settings");
  const camera = await map.locator(".lm-space").evaluate((element) => (element as HTMLElement).style.transform);
  await map.locator('[data-lore-id="branch:rules"]').click();
  expect(await map.locator(".lm-space").evaluate((element) => (element as HTMLElement).style.transform)).toBe(camera);
  await map.getByRole("textbox", { name: "Find a record or branch…", exact: true }).fill("MiraBody");
  await map.locator(".lm-results").getByRole("button", { name: "MiraBody", exact: true }).click();
  await map.getByText("More actions", { exact: true }).click();
  await expect(map.locator(".lm-recognition")).toContainText("From title · Body");
  await expect(map.locator(".lm-memory-editor textarea")).toHaveValue("Original body description.");
  await page.screenshot({ path: testInfo.outputPath("english-world-map.png") });
  const visibleText = await map.innerText();
  expect(visibleText).not.toMatch(/[а-яё]/iu);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);
});
