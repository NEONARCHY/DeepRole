import { setEnglish } from "./helpers/settings";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function records(page: Page) { return page.evaluate(async () => { const file = "/src/storage/repository.ts"; return (await import(file)).repository.rawRecords(); }); }
const entries = Array.from({ length: 24 }, (_, i) => ({ title: "Mira_appearance_" + i, content: `  Mira is 32. Neutral portrait note ${i}.\nOriginal punctuation.  `, keys: ["Mira"], activation: i === 1 ? "manual" : i === 2 ? "always" : "called", enabled: i !== 0 }));

for (const locale of ["ru", "en"] as const) test(`JSON preview and branch modes share canonical memory (${locale})`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1320, height: 900 }); await page.goto("/tests/fixtures/sidepanel.html");
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  const label = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.getByRole("button", { name: label("Лор", "Lore"), exact: true }).click();
  await page.getByRole("button", { name: label("Загрузить готовый лор", "Import existing lore"), exact: true }).click();
  const data = { name: "Observatory", entries: [...entries, { title: "World_rules", content: "Preserve the calendar.", activation: "always" }], extraSetting: true };
  await page.getByLabel(label("Выбрать JSON", "Choose JSON"), { exact: true }).setInputFiles({ name: "Neutral.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByText(label("Распознаны записи JSON", "JSON entries recognized"), { exact: true })).toBeVisible();
  await expect(page.locator(".rp-import-character-hint")).toContainText(label("не карточки и портреты", "not character sheets or portraits"));
  await expect(page.locator(".rp-import-character-hint")).toContainText(label("экспорт мира DeepRole", "DeepRole world export"));
  const confirm = page.getByRole("button", { name: label("Подтвердить импорт", "Confirm import"), exact: true }); await expect(confirm).toBeDisabled();
  await expect(page.getByRole("note")).toContainText("extraSetting");
  await page.getByRole("checkbox", { name: label("Импортировать без этих дополнительных настроек", "Import without these extra settings"), exact: true }).check();
  await confirm.click(); await page.getByRole("button", { name: label("Открыть карту мира", "Open world map"), exact: true }).click();
  const map = page.getByRole("dialog", { name: label("Карта мира", "World map"), exact: true });
  const before = (await records(page)).filter((row: any) => row.kind === "entry" && row.data.worldId);
  expect(before.map((row: any) => row.data.content).sort()).toEqual(data.entries.map((entry) => entry.content).sort());
  const originalModes = Object.fromEntries(before.map((row: any) => [row.id, row.data.activation]));
  const camera = await map.locator(".lm-space").evaluate((element) => (element as HTMLElement).style.transform);
  await map.locator('[data-lore-id="branch:characters"]').click();
  expect(await map.locator(".lm-space").evaluate((element) => (element as HTMLElement).style.transform)).toBe(camera);
  const branch = map.getByRole("region", { name: label("Память этой ветви", "This branch's memory"), exact: true });
  await expect(branch.locator("h4")).toContainText("24"); await expect(branch.locator(".lm-branch-entries article")).toHaveCount(20);
  await branch.getByRole("button", { name: label("Показать ещё", "Show more"), exact: true }).click(); await expect(branch.locator(".lm-branch-entries article")).toHaveCount(24);
  const row = branch.locator("article").filter({ has: page.getByRole("button", { name: "Mira appearance 0", exact: true }) });
  const mode = row.getByRole("combobox"); await mode.selectOption("manual");
  await expect(map.getByRole("button", { name: label("Отменить", "Undo"), exact: true })).toBeEnabled(); await expect(mode).toHaveValue("manual");
  await map.locator(".lm-viewport").focus(); await page.keyboard.press("Control+z"); await expect(mode).toHaveValue("smart");
  await branch.getByRole("textbox", { name: label("Найти в ветви", "Search this branch"), exact: true }).fill("appearance 21");
  await expect(branch.locator(".lm-branch-entries article")).toHaveCount(1);
  await branch.locator(".lm-bulk-modes > summary").click();
  await branch.getByRole("combobox", { name: label("Режим для всей ветви", "Mode for the whole branch"), exact: true }).selectOption("manual");
  const apply = branch.getByRole("button", { name: new RegExp("^" + label("Применить ко всей ветви", "Apply to the whole branch")) });
  page.once("dialog", (dialog) => dialog.dismiss()); await apply.click();
  expect(Object.fromEntries((await records(page)).filter((row: any) => row.kind === "entry" && row.data.worldId).map((row: any) => [row.id, row.data.activation]))).toEqual(originalModes);
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("24"); void dialog.accept(); }); await apply.click();
  await expect.poll(() => records(page).then((rows: any[]) => rows.filter((row) => row.kind === "entry" && row.data.worldId && row.data.activation === "manual").length)).toBe(24);
  await page.screenshot({ path: testInfo.outputPath(`branch-memory-${locale}.png`) });
  const audit = await new AxeBuilder({ page }).include(".dr-loremap").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); expect(audit.violations).toEqual([]);
  await map.getByRole("button", { name: label("Отменить", "Undo"), exact: true }).click();
  await expect.poll(() => records(page).then((rows: any[]) => Object.fromEntries(rows.filter((row) => row.kind === "entry" && row.data.worldId).map((row) => [row.id, row.data.activation])))).toEqual(originalModes);
  await map.getByRole("textbox", { name: label("Найти запись или ветвь…", "Find a record or branch…"), exact: true }).fill("Mira");
  await map.locator(".lm-results").getByRole("button", { name: "Mira", exact: true }).click();
  await map.getByText(label("Настройки ветви", "Branch settings"), { exact: true }).click();
  await map.getByRole("button", { name: label("Переименовать ветвь", "Rename branch"), exact: true }).click();
  await map.getByRole("textbox", { name: label("Название ветви", "Branch name"), exact: true }).fill("My decorative folder");
  await map.getByRole("button", { name: label("Сохранить название", "Save name"), exact: true }).click(); await expect(map.locator(".lm-details h3")).toHaveText("My decorative folder");
  const after = (await records(page)).filter((row: any) => row.kind === "entry" && row.data.worldId);
  const facts = (rows: any[]) => rows.map((row) => [row.id, row.data.title, row.data.content, row.data.keywords, row.data.enabled, row.data.activation, row.data.source]);
  expect(facts(after)).toEqual(facts(before));
});

test("ambiguous JSON does not partly import or leave an old preview enabled", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click(); await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  const file = page.getByLabel("Выбрать JSON", { exact: true });
  await file.setInputFiles({ name: "Valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Gate", content: "Closed" }])) });
  await expect(page.getByRole("button", { name: "Подтвердить импорт", exact: true })).toBeEnabled();
  const before = await records(page);
  await file.setInputFiles({ name: "Conflict.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Gate", content: "Closed", text: "Open" }])) });
  await expect(page.getByRole("alert")).toContainText("Не удалось однозначно"); await expect(page.getByRole("button", { name: "Подтвердить импорт", exact: true })).toHaveCount(0);
  expect(await records(page)).toEqual(before);
});
