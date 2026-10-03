import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";
import type { DataRecord, MemoryEntry, WorldProfile } from "../../src/core/types";

for (const locale of ["ru", "en"] as const) for (const format of ["json", "existing", "bds", "world"] as const) test(`a committed import retries only refresh (${locale}, ${format})`, async ({ page }, info) => {
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto("/tests/fixtures/sidepanel.html?world");
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
  await page.getByRole("button", { name: l("Загрузить готовый лор", "Import existing lore"), exact: true }).click();
  let payload: unknown = [{ title: "Recovery fact", content: "Exact source" }];
  if (format === "bds") payload = { "Recovery fact": { value: "Exact source", importance: "called" } };
  if (format === "world") {
    const world: WorldProfile = { id: "source-world", name: "Recovery world", description: "", color: "#58a6ff", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const entry: MemoryEntry = { id: "source-entry", worldId: world.id, bookId: null, title: "Recovery fact", content: "Exact source", keywords: [], activation: "manual", priority: "normal", enabled: false, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
    payload = { format: "deeprole-world", version: 1, records: [world, entry].map(data => ({ pk: `${data.id === world.id ? "world" : "entry"}:${data.id}`, kind: data.id === world.id ? "world" : "entry", id: data.id, data, updatedAt: 1 })) };
  }
  await page.locator('input[type="file"]').setInputFiles({ name: "recovery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
  if (format === "existing") {
    await page.locator(".lore-import-modal details > summary").filter({ hasText: l("Дополнительно", "Advanced") }).click();
    await page.getByRole("combobox", { name: l("Куда перенести", "Destination"), exact: true }).selectOption("world-b");
  }
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const merge = repository.mergeRecords.bind(repository); const locked = repository.isLocked.bind(repository);
    let failures = 0; (window as any).importWrites = 0;
    repository.mergeRecords = async (records: DataRecord[]) => { await merge(records); (window as any).importWrites++; failures = 2; };
    repository.isLocked = async () => { if (failures) { failures--; throw new Error("QA window refresh failure"); } return locked(); };
  });
  await page.getByRole("button", { name: l("Подтвердить импорт", "Confirm import"), exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(l("Лор уже в библиотеке", "Your lore is already in the library"));
  await expect(page.getByRole("button", { name: l("Подтвердить импорт", "Confirm import"), exact: true })).toHaveCount(0);
  const retry = page.getByRole("button", { name: l("Обновить окно", "Refresh window"), exact: true });
  await retry.click(); await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({ path: info.outputPath(`import-recovery-${locale}.png`) });
  expect((await new AxeBuilder({ page }).include(".lore-import-modal").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await retry.click(); await expect(page.locator(".lore-import-modal")).toHaveCount(0);
  const copies = await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    return (await repository.rawRecords() as DataRecord[]).filter(row => row.kind === "entry" && (row.data as MemoryEntry).title === "Recovery fact").length;
  });
  expect(copies).toBe(1);
  expect(await page.evaluate(() => (window as any).importWrites)).toBe(1);
});

test("a failed write can retry and a saved import survives closing the recovery window", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "retry.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Retry fact", content: "Exact" }])) });
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string); const merge = repository.mergeRecords.bind(repository); const locked = repository.isLocked.bind(repository);
    let attempt = 0; let failRefresh = false;
    repository.mergeRecords = async (records: DataRecord[]) => { if (++attempt === 1) throw new Error("QA write failure"); await merge(records); failRefresh = true; };
    repository.isLocked = async () => { if (failRefresh) { failRefresh = false; throw new Error("QA refresh failure"); } return locked(); };
  });
  const confirm = page.getByRole("button", { name: "Подтвердить импорт", exact: true }); await confirm.click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить"); await expect(confirm).toBeEnabled();
  await expect(page.getByRole("button", { name: "Обновить окно", exact: true })).toHaveCount(0);
  await confirm.click(); await expect(page.getByRole("alert")).toContainText("Лор уже в библиотеке");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click(); await expect(page.locator(".lore-import-modal")).toHaveCount(0);
  const rows = await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return await repository.rawRecords() as DataRecord[]; });
  expect(rows.filter(row => row.kind === "entry" && (row.data as MemoryEntry).title === "Retry fact")).toHaveLength(1);
});
