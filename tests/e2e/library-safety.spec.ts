import { setEnglish } from "./helpers/settings";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function readEntries(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    return repository.list("entry");
  });
}

test("full restore requires explicit consent; Escape cancels without writing", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  const file = await page.evaluate(async () => {
    const { createBackup } = await import("/src/storage/backup.ts" as string);
    const value = await createBackup();
    value.records = value.records.filter((r: any) => r.kind === "entry" && r.id === "memory-2");
    value.records[0].data.content = "Restored intentionally";
    return JSON.stringify(value);
  });
  const choose = () => page.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await choose(); const dialog = page.getByRole("dialog", { name: "Восстановление копии", exact: true });
  await dialog.getByRole("radio", { name: /^Полностью восстановить копию/ }).check();
  const button = dialog.getByRole("button", { name: "Полностью восстановить копию", exact: true });
  await expect(button).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); expect(await readEntries(page)).toHaveLength(2);
  await choose(); await dialog.getByRole("radio", { name: /^Полностью восстановить копию/ }).check();
  await dialog.getByRole("checkbox", { name: "Я сохранил нужные данные и согласен на полную замену", exact: true }).check();
  await button.click(); await expect(dialog).toHaveCount(0);
  expect(await readEntries(page)).toEqual([expect.objectContaining({ id: "memory-2", content: "Restored intentionally" })]);
});

test("invalid plain backup is not mistaken for a wrong password", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  await page.getByLabel("Пароль для файла (необязательно)", { exact: true }).fill("A password for future exports");
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"format":"deeprole-backup","records":[]}') });
  await expect(page.getByRole("status")).toHaveText("Не удалось прочитать резервную копию");
  expect(await readEntries(page)).toHaveLength(2);
});
for (const locale of ["ru", "en"] as const) {
  test(`backup preview, genuine cancel and safe add (${locale})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto("/tests/fixtures/sidepanel.html");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
    if (locale === "en") { await setEnglish(page); await page.getByRole("button", { name: "Files & security", exact: true }).click(); }
    const file = await page.evaluate(async () => {
      const { createBackup } = await import("/src/storage/backup.ts" as string);
      const value = await createBackup();
      const entry = value.records.find((r: any) => r.kind === "entry"); entry.data.content = "Outdated lore";
      value.records.push({ kind: "entry", id: "extra", data: { ...entry.data, id: "extra", bookId: null, worldId: null, title: "Extra", content: "New fact" } });
      return JSON.stringify(value);
    });
    const before = await readEntries(page);
    const choose = () => page.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
    await choose();
    const dialog = page.getByRole("dialog", { name: locale === "ru" ? "Восстановление копии" : "Restore backup", exact: true });
    await expect(dialog).toBeVisible();
    expect(await readEntries(page)).toEqual(before);
    await dialog.locator("..").evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))));
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`backup-restore-${locale}.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: locale === "ru" ? "Отмена" : "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(await readEntries(page)).toEqual(before);
    await choose();
    await dialog.getByRole("button", { name: locale === "ru" ? "Добавить недостающее" : "Add missing data", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const result = await readEntries(page);
    expect(result).toHaveLength(3);
    for (const existing of before) expect(result.find((r: any) => r.id === existing.id)).toEqual(existing);
    await expect(page.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true })).toBeVisible();
  });
}

test("a deleted entry is not recreated by its still-open editor", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await page.locator(".memory-card").filter({ hasText: "Клятва Миры" }).getByRole("button", { name: "Изменить", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Что нужно помнить", exact: true }).fill("Draft still in this window");
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    await repository.delete("entry", "memory-1");
  });
  await expect(page.locator(".memory-card").filter({ hasText: "Клятва Миры" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Что нужно помнить", exact: true })).toHaveValue("Draft still in this window");
  expect((await readEntries(page)).some((r: any) => r.id === "memory-1")).toBe(false);
});

test("a new entry cannot disappear into a book deleted while the editor was open", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await page.getByRole("combobox", { name: "Книга памяти", exact: true }).selectOption("book-1");
  await page.getByRole("button", { name: "Новая запись", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Новая запись", exact: true });
  await dialog.getByRole("textbox", { name: "Название", exact: true }).fill("New rule");
  await dialog.getByRole("textbox", { name: "Что нужно помнить", exact: true }).fill("Keep this draft");
  await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); await repository.delete("book", "book-1"); });
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Ничего не перезаписано");
  await expect(dialog.getByRole("textbox", { name: "Что нужно помнить", exact: true })).toHaveValue("Keep this draft");
  expect((await readEntries(page)).some((r: any) => r.title === "New rule")).toBe(false);
});

test("a book editor preserves newer settings and keeps the local draft on conflict", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await page.locator(".lore-list-options > summary").click();
  await page.locator(".book-row").getByRole("button", { name: "Изменить", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Книги памяти", exact: true });
  await dialog.locator("textarea").fill("Local description draft");
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const book = await repository.get("book", "book-1"); await repository.put("book", { ...book, name: "Changed elsewhere", active: false, updatedAt: Date.now() });
  });
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Ничего не перезаписано");
  await expect(dialog.locator("textarea")).toHaveValue("Local description draft");
  const saved = await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return repository.get("book", "book-1"); });
  expect(saved).toMatchObject({ name: "Changed elsewhere", active: false, description: "Основной сюжет" });
});

test("a deleted story starter is not recreated by its open editor", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const now = Date.now();
    await repository.put("world", { id: "w", name: "Test world", description: "", color: "#58a6ff", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now });
    await repository.put("template", { id: "t", worldId: "w", name: "Starter", opening: "Original start", initialState: "", focusIds: [], createdAt: now, updatedAt: now });
  });
  await page.getByRole("combobox", { name: "Библиотека мира", exact: true }).selectOption("w");
  await page.getByRole("button", { name: "Мир и профили", exact: true }).click();
  await page.locator(".rp-item").filter({ hasText: "Starter" }).getByRole("button", { name: "Изменить", exact: true }).click();
  const editor = page.locator(".rp-editor");
  await editor.getByRole("textbox", { name: "Первая реплика", exact: true }).fill("My local start");
  await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); await repository.delete("template", "t"); });
  await expect(page.locator(".rp-item").filter({ hasText: "Starter" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.locator(".rp-status")).toContainText("Ничего не перезаписано");
  await expect(editor.getByRole("textbox", { name: "Первая реплика", exact: true })).toHaveValue("My local start");
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return repository.list("template"); })).toEqual([]);
});
