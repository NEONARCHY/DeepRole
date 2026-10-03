import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";
import type { DataRecord, MemoryEntry, WorldProfile } from "../../src/core/types";

for (const locale of ["ru", "en"] as const) test(`large file preview is bounded, searchable and imports all entries (${locale})`, async ({ page }, info) => {
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.setViewportSize({ width: 420, height: 700 }); await page.goto("/tests/fixtures/sidepanel.html");
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
  await page.getByRole("button", { name: l("Загрузить готовый лор", "Import existing lore"), exact: true }).click();
  const entries = Array.from({ length: 1500 }, (_, i) => ({ title: `Fact ${i + 1}`, content: `Exact fact ${i + 1}.\nKeep this line unchanged.`, keywords: [`key-${i + 1}`], activation: i === 1499 ? "manual" : "smart", enabled: i !== 1499 }));
  await page.locator('input[type="file"]').setInputFiles({ name: "Large neutral world.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ name: "Large neutral world", entries })) });
  await expect(page.locator(".rp-import-preview details")).toHaveCount(20);
  const search = page.getByRole("searchbox", { name: l("Найти запись в файле", "Find an entry in the file"), exact: true });
  await search.fill("key-1500"); await expect(page.locator(".rp-import-preview details")).toHaveCount(1);
  await expect(page.locator(".rp-import-preview")).toContainText("Fact 1500"); await page.locator(".rp-import-preview summary").click();
  await expect(page.locator(".rp-import-preview pre")).toHaveText(entries[1499]!.content);
  await search.fill(""); await page.getByRole("button", { name: l("Следующие записи", "Next entries"), exact: true }).click();
  await expect(page.locator(".rp-import-preview summary").first()).toContainText("Fact 21");
  await page.screenshot({ path: info.outputPath("large-import-preview.png") });
  expect((await new AxeBuilder({ page }).include(".lore-import-modal").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await search.fill("key-1500");
  await page.getByRole("button", { name: l("Подтвердить импорт", "Confirm import"), exact: true }).click();
  await expect(page.locator(".lore-import-modal")).toHaveCount(0);
  const imported = await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const rows: DataRecord[] = await repository.rawRecords(); const world = rows.find(row => row.kind === "world" && (row.data as WorldProfile).name === "Large neutral world")!;
    return rows.filter(row => row.kind === "entry" && (row.data as MemoryEntry).worldId === world.id).map(row => row.data as MemoryEntry);
  });
  expect(imported).toHaveLength(1500); expect(imported.find(row => row.title === "Fact 1500")).toMatchObject({ content: entries[1499]!.content, activation: "manual", enabled: false, keywords: ["key-1500"] });
});

test("a slow earlier file never replaces the latest dropped file", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click(); await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () { return this.name === "slow.json" ? original.call(this).then(text => new Promise<string>(resolve => { (window as any).finishSlowRead = () => resolve(text); })) : original.call(this); };
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "slow.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Obsolete slow record", content: "Old text" }])) });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishSlowRead)).toBe("function");
  const transfer = await page.evaluateHandle(() => { const value = new DataTransfer(); value.items.add(new File([JSON.stringify([{ title: "Latest record", content: "Latest exact text" }])], "latest.json", { type: "application/json" })); return value; });
  await page.locator(".rp-import-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".rp-import-preview")).toContainText("Latest record");
  await page.evaluate(() => (window as any).finishSlowRead());
  await expect(page.locator(".rp-import-preview")).not.toContainText("Obsolete slow record");
  await expect(page.getByRole("textbox", { name: "Название", exact: true })).toHaveValue("latest");
});

test("a delayed valid file cannot override a later invalid file", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click(); await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () { return this.name === "slow.json" ? original.call(this).then(text => new Promise<string>(resolve => { (window as any).finishSlowRead = () => resolve(text); })) : original.call(this); };
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "slow.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Old valid record", content: "Old text" }])) });
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishSlowRead)).toBe("function");
  const transfer = await page.evaluateHandle(() => { const value = new DataTransfer(); value.items.add(new File(["broken JSON"], "invalid.json", { type: "application/json" })); return value; });
  await page.locator(".rp-import-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("alert")).toContainText("Ничего не импортировано");
  await page.evaluate(() => (window as any).finishSlowRead());
  await expect(page.locator(".rp-import-preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Подтвердить импорт", exact: true })).toHaveCount(0);
  await expect(page.locator(".rp-import-dropzone strong")).toHaveText("invalid.json");
});

test("saving cannot be interrupted by another drop, Escape or duplicate confirmation", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html"); await page.getByRole("button", { name: "Лор", exact: true }).click(); await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "confirmed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Confirmed record", content: "Exact original" }])) });
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string); const original = repository.mergeRecords.bind(repository);
    repository.mergeRecords = (records: DataRecord[]) => new Promise<void>(resolve => { (window as any).finishImport = async () => { await original(records); resolve(); }; });
  });
  const confirm = page.getByRole("button", { name: "Подтвердить импорт", exact: true }); await confirm.click(); await expect(confirm).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(page.locator(".lore-import-modal")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отмена", exact: true })).toBeDisabled();
  const transfer = await page.evaluateHandle(() => { const value = new DataTransfer(); value.items.add(new File([JSON.stringify([{ title: "Other file", content: "Other" }])], "other.json", { type: "application/json" })); return value; });
  await page.locator(".rp-import-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".rp-import-dropzone strong")).toHaveText("confirmed.json");
  await page.evaluate(() => (window as any).finishImport()); await expect(page.locator(".lore-import-modal")).toHaveCount(0);
  const titles = await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.rawRecords() as DataRecord[]).filter(row => row.kind === "entry").map(row => (row.data as MemoryEntry).title); });
  expect(titles.filter(title => title === "Confirmed record")).toHaveLength(1); expect(titles).not.toContain("Other file");
});
