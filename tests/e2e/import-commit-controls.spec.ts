import { expect, test } from "@playwright/test";
import type { DataRecord } from "../../src/core/types";

test("import choices cannot change after saving begins", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html?world");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "commit.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([{ title: "Committed choice", content: "Exact" }])) });
  await page.locator(".lore-import-modal details > summary").filter({ hasText: "Дополнительно" }).click();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string); const original = repository.mergeRecords.bind(repository);
    repository.mergeRecords = (records: DataRecord[]) => new Promise<void>(resolve => { (window as any).finishCommittedChoice = async () => { await original(records); resolve(); }; });
  });
  await page.getByRole("button", { name: "Подтвердить импорт", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Использовать в открытом чате", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Название", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Куда перенести", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).finishCommittedChoice());
  await expect(page.locator(".lore-import-modal")).toHaveCount(0);
});
