import { setEnglish } from "./helpers/settings";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const sample = { entries: [{ title: "Mira_portrait", content: "Mira is 32. Her coat is blue.", keys: ["Mira"], activation: "called" }, { title: "Mira_personality", content: "Mira likes quiet rooms.", activation: "called" }, { title: "Station_location", content: "The station is north of the lake.", activation: "called" }] };
async function rows(page: Page) { return page.evaluate(async () => { const path = "/src/storage/repository.ts"; return (await import(path)).repository.rawRecords(); }); }
async function setup(page: Page, locale: "ru" | "en") {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/tests/fixtures/sidepanel.html");
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click(); await page.getByRole("button", { name: l("Загрузить готовый лор", "Import existing lore"), exact: true }).click();
  await page.getByLabel(l("Выбрать JSON", "Choose JSON"), { exact: true }).setInputFiles({ name: "Observatory.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
  await page.getByRole("button", { name: l("Подтвердить импорт", "Confirm import"), exact: true }).click(); await page.getByRole("button", { name: l("Открыть карту мира", "Open world map"), exact: true }).click();
  const map = page.getByRole("dialog", { name: l("Карта мира", "World map"), exact: true });
  async function find(title: string) { await map.getByRole("textbox", { name: l("Найти запись или ветвь…", "Find a record or branch…"), exact: true }).fill(title); await map.locator(".lm-results").getByRole("button", { name: title, exact: true }).click(); }
  return { map, l, find };
}

for (const locale of ["ru", "en"] as const) {
  test(`double-click folds a branch even beside its open narrow-screen card (${locale})`, async ({ page }) => {
    const { map, l, find } = await setup(page, locale); await page.setViewportSize({ width: 360, height: 700 }); await find("Mira");
    const branch = map.locator('[data-lore-id="branch:person:mira"]'); await expect(branch).toHaveAttribute("aria-expanded", "true");
    const camera = await map.locator(".lm-space").getAttribute("style");
    await branch.dblclick(); await expect(branch).toHaveAttribute("aria-expanded", "false"); expect(await map.locator(".lm-space").getAttribute("style")).toBe(camera);
    await branch.dblclick(); await expect(branch).toHaveAttribute("aria-expanded", "true");
    await expect(map.locator(".lm-details")).toBeVisible(); await map.getByRole("button", { name: l("Закрыть окошко", "Close card"), exact: true }).click();
    await branch.press("Alt+Enter"); await expect(branch).toHaveAttribute("aria-expanded", "false"); expect(await map.locator(".lm-space").getAttribute("style")).toBe(camera);
  });
  test(`a newcomer creates the first memory without leaving the map (${locale})`, async ({ page }, testInfo) => {
    const { map, l } = await setup(page, locale);
    await map.getByRole("button", { name: l("Закрыть карту", "Close map"), exact: true }).click();
    await page.getByRole("button", { name: l("Создать свой мир", "Create your world"), exact: true }).click();
    const worldForm = page.getByRole("dialog", { name: l("Создайте новый мир", "Create a new world"), exact: true });
    await worldForm.getByRole("textbox", { name: l("Название", "Name"), exact: true }).fill("First world");
    await worldForm.getByRole("button", { name: l("Создать мир", "Create world"), exact: true }).click();
    await expect(worldForm).toHaveCount(0);
    await expect(map).toBeVisible();
    await expect(map.locator(".lm-start-guide")).toContainText(l("С чего начнётся ваш мир?", "Where does your world begin?"));
    await map.getByRole("button", { name: l("Добавить запись", "Add entry"), exact: true }).click();
    const editor = map.locator(".lm-memory-editor"); await editor.getByRole("textbox", { name: l("Название записи", "Entry title"), exact: true }).fill("World rule"); await editor.locator("textarea").fill("The station loses power every night.");
    await editor.getByRole("button", { name: l("Всегда", "Always"), exact: true }).click(); await editor.getByRole("button", { name: l("Сохранить запись", "Save entry"), exact: true }).click();
    await expect(map.locator(".lm-details h3")).toHaveText("World rule"); await expect(map.locator(".lm-node.node-entry")).toHaveCount(1); await expect(map).toBeVisible();
    const saved = (await rows(page)).find((row: any) => row.kind === "entry" && row.data.title === "World rule").data; expect(saved.content).toBe("The station loses power every night."); expect(saved.activation).toBe("always");
    await page.screenshot({ path: testInfo.outputPath(`first-memory-${locale}.png`) });
  });
  test(`node card edits canonical memory without folding or moving the map (${locale})`, async ({ page }, testInfo) => {
    const { map, l, find } = await setup(page, locale);
    const branch = map.locator('[data-lore-id="branch:characters"]');
    const camera = await map.locator(".lm-space").getAttribute("style");
    await branch.click(); await branch.click(); await expect(branch).toHaveAttribute("aria-expanded", "true");
    expect(await map.locator(".lm-space").getAttribute("style")).toBe(camera);
    await expect(map.locator(".lm-details")).toBeVisible(); await expect(map.locator(".lm-branch-entries article")).toHaveCount(2);
    await find("Mira portrait");
    const form = map.getByRole("form", { name: l("Текст памяти", "Memory text"), exact: true });
    await expect(form.locator("textarea")).toHaveValue(sample.entries[0]!.content);
    const automatic = map.locator('.dr-memory-mode button[aria-pressed="true"]');
    const otherMode = map.locator('.dr-memory-mode button[aria-pressed="false"]').first();
    expect(await automatic.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(await otherMode.evaluate((node) => getComputedStyle(node).backgroundColor));
    const before = (await rows(page)).find((row: any) => row.kind === "entry" && row.data.title === "Mira_portrait").data;
    await form.locator("textarea").fill("Mira is 32. Her coat is blue. She carries a telescope.");
    await form.getByRole("button", { name: l("Сохранить запись", "Save entry"), exact: true }).click(); await expect(form.getByRole("status")).toHaveText(l("Текст сохранён", "Text saved"));
    const after = (await rows(page)).find((row: any) => row.id === before.id).data;
    expect(after).toEqual({ ...before, content: "Mira is 32. Her coat is blue. She carries a telescope.", updatedAt: after.updatedAt });
    const canvas = (await map.locator(".lm-viewport").boundingBox())!; const card = (await map.locator(".lm-details").boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(canvas.x); expect(card.x + card.width).toBeLessThanOrEqual(canvas.x + canvas.width); expect(card.y + card.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    await page.screenshot({ path: testInfo.outputPath(`contextual-editor-${locale}.png`) });
    expect((await new AxeBuilder({ page }).include(".dr-loremap").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  });
  test(`branch-to-branch drag explains and confirms only one pair (${locale})`, async ({ page }) => {
    const { map, l } = await setup(page, locale); const before = await rows(page);
    const source = map.locator('[data-lore-id="branch:characters"]').locator("..").locator(".lm-port");
    const target = map.locator('[data-lore-id="branch:locations"]');
    const a = (await source.boundingBox())!; const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
    const form = map.getByRole("region", { name: l("Связь записей", "Entry connection"), exact: true }); await expect(form).toBeVisible();
    await expect(form).toContainText(l("не между всеми записями ветвей", "not every entry in the branches"));
    const save = form.getByRole("button", { name: l("Сохранить связь", "Save connection"), exact: true }); await expect(save).toBeDisabled(); expect(await rows(page)).toEqual(before);
    const entry = before.find((row: any) => row.kind === "entry" && row.data.title === "Mira_portrait");
    await form.getByRole("combobox", { name: l("Первая запись", "First entry"), exact: true }).selectOption(entry.id);
    await form.getByRole("textbox", { name: l("Что их связывает?", "How are they connected?"), exact: true }).fill("works at");
    await form.getByRole("combobox", { name: l("Как использовать связь", "How to use this connection"), exact: true }).selectOption("context");
    await expect(form.locator(".lm-link-effect")).toContainText(l("лимит памяти", "memory limit"));
    await save.click(); await expect(form).toHaveCount(0);
    const after = await rows(page); const links = after.filter((row: any) => row.kind === "entry" && row.data.links?.length);
    expect(links).toHaveLength(1); expect(links[0].id).toBe(entry.id); expect(links[0].data.links).toEqual([{ targetId: before.find((row: any) => row.kind === "entry" && row.data.title === "Station_location").id, mode: "context", label: "works at" }]);
    expect(after.filter((row: any) => row.kind === "entry").map((row: any) => [row.id, row.data.content, row.data.activation])).toEqual(before.filter((row: any) => row.kind === "entry").map((row: any) => [row.id, row.data.content, row.data.activation]));
    await map.getByRole("button", { name: l("Отменить", "Undo"), exact: true }).click(); expect((await rows(page)).filter((row: any) => row.kind === "entry" && row.data.links?.length)).toHaveLength(0);
  });
  test(`drafts survive secondary windows and reject stale text saves (${locale})`, async ({ page }) => {
    const { map, l, find } = await setup(page, locale); await find("Mira portrait");
    const text = map.locator(".lm-memory-editor textarea"); await text.fill("Unsaved neutral draft.");
    await map.getByRole("button", { name: l("Связать запись", "Connect entry"), exact: true }).click();
    await find("Station location");
    const link = map.getByRole("region", { name: l("Связь записей", "Entry connection"), exact: true }); await expect(link).toBeVisible();
    await page.keyboard.press("Escape"); await expect(link).toHaveCount(0); await expect(text).toHaveValue("Unsaved neutral draft.");
    page.once("dialog", (dialog) => dialog.dismiss()); await page.keyboard.press("Escape"); await expect(text).toHaveValue("Unsaved neutral draft.");
    await page.evaluate(async () => { const path = "/src/storage/repository.ts"; const { repository } = await import(path); const entries = await repository.list("entry"); const entry = entries.find((entry: any) => entry.title === "Mira_portrait"); await repository.put("entry", { ...entry, content: "Newer fact from another window.", updatedAt: Date.now() }); });
    await map.getByRole("button", { name: l("Сохранить запись", "Save entry"), exact: true }).click();
    await expect(map.locator(".lm-memory-editor [role=alert]")).toContainText(l("другом окне", "another window")); await expect(text).toHaveValue("Unsaved neutral draft.");
    expect((await rows(page)).find((row: any) => row.kind === "entry" && row.data.title === "Mira_portrait").data.content).toBe("Newer fact from another window.");
    await page.setViewportSize({ width: 360, height: 700 });
    const card = (await map.locator(".lm-details").boundingBox())!; expect(card.x).toBeGreaterThanOrEqual(0); expect(card.x + card.width).toBeLessThanOrEqual(360); expect(card.y + card.height).toBeLessThanOrEqual(700);
    await map.locator(".lm-details").evaluate((element) => element.scrollTo(0, element.scrollHeight)); await expect(map.getByRole("button", { name: l("Сохранить запись", "Save entry"), exact: true })).toBeVisible();
  });
}
