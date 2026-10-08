import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { setEnglish } from "./helpers/settings";

async function exportedCopy(page: Page, locale: "ru" | "en", encrypted = false) {
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await page.goto("/tests/fixtures/sidepanel.html?world");
  await expect(page.getByRole("button", { name: "Настройки", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const { EMPTY_CHARACTER, EMPTY_STATUS } = await import("/src/core/characters.ts" as string);
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const context = canvas.getContext("2d")!; context.fillStyle = "#778899"; context.fillRect(0, 0, 8, 8);
    await repository.put("entity", { id: "backup-hero", worldId: "world-a", name: "Noah", kind: "character", description: "Original profile", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1,
      characterSheet: { ...EMPTY_CHARACTER, protagonist: true, appearance: "Blue coat", sprites: { neutral: canvas.toDataURL("image/png") } } });
    await repository.put("binding", { id: "binding:backup", chatId: "backup", chatUrl: "https://chat.deepseek.com/chat/s/backup", worldId: "world-a", bookId: null, focusIds: ["backup-hero"], messageCountAtAnalysis: 2, createdAt: 1, updatedAt: 1,
      characterScenes: { "world-a": { revision: "v", presentIds: ["backup-hero"], partnerIds: [], states: { "backup-hero": { ...EMPTY_STATUS, condition: "Safe", goal: "Find the key" } }, updatedAt: 1 } } });
  });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") await setEnglish(page);
  await page.getByRole("button", { name: l("Файлы и защита", "Files & security"), exact: true }).click();
  await page.getByRole("button", { name: l("Экспорт", "Export"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: l("Экспорт", "Export"), exact: true });
  await dialog.getByRole("radio", { name: new RegExp("^" + l("Полная резервная копия", "Full backup")) }).check();
  if (encrypted) {
    await dialog.getByRole("checkbox", { name: l("Защитить паролем", "Protect with a password"), exact: true }).check();
    await dialog.getByLabel(l("Пароль для копии", "Backup password"), { exact: true }).fill("neutral-backup-password");
  }
  const event = page.waitForEvent("download");
  await dialog.getByRole("button", { name: l("Скачать файл", "Download file"), exact: true }).click();
  const download = await event, file = (await download.path())!;
  return { file, text: await readFile(file, "utf8") };
}
async function records(page: Page) {
  return page.evaluate(async () => (await import("/src/storage/repository.ts" as string)).repository.rawRecords());
}

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) for (const route of ["settings", "lore"] as const) {
  test(`exported full backup restores unchanged through ${route} ${locale} ${width}`, async ({ page }, info) => {
    const l = (ru: string, en: string) => locale === "ru" ? ru : en;
    await page.setViewportSize({ width, height: 800 });
    const { file, text } = await exportedCopy(page, locale);
    const original = JSON.parse(text);
    expect(original.format).toBe("deeprole-backup");
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const entry = await repository.get("entry", "memory-1");
      await repository.put("entry", { ...entry, content: "Newer played fact", updatedAt: Date.now() });
      await repository.put("entry", { ...entry, id: "after-backup", title: "After backup", content: "Keep on cancel", bookId: null });
    });
    const before = await records(page);
    if (route === "lore") await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
    const choose = async () => {
      if (route === "lore") await page.getByRole("button", { name: l("Загрузить готовый лор", "Import existing lore"), exact: true }).click();
      await page.locator('input[type="file"]').setInputFiles(file);
    };
    await choose();
    const preview = page.getByRole("dialog", { name: l("Восстановление копии", "Restore backup"), exact: true });
    await expect(preview).toBeVisible();
    expect(await records(page)).toEqual(before);
    await preview.locator("..").evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))));
    const box = (await preview.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`backup-${route}-${locale}-${width}.png`) });
    await preview.getByRole("button", { name: l("Отмена", "Cancel"), exact: true }).click();
    await expect(preview).toHaveCount(0); expect(await records(page)).toEqual(before);
    if (route === "lore") await expect(page.getByRole("button", { name: l("Загрузить готовый лор", "Import existing lore"), exact: true })).toBeFocused();
    await choose();
    await preview.getByRole("radio", { name: new RegExp("^" + l("Полностью восстановить копию", "Restore the full backup")) }).check();
    const restore = preview.getByRole("button", { name: l("Полностью восстановить копию", "Restore the full backup"), exact: true });
    await expect(restore).toBeDisabled();
    await preview.getByRole("checkbox", { name: l("Я сохранил нужные данные и согласен на полную замену", "I have saved what I need and agree to replace the library"), exact: true }).check();
    await restore.click(); await expect(preview).toHaveCount(0);
    expect(await records(page)).toEqual(original.records);
    const settings = await page.evaluate(async () => (await import("/src/storage/settings.ts" as string)).getSettings());
    expect(settings).toEqual(original.settings);
    expect(await readFile(file, "utf8")).toBe(text);
  });
}

test("lore picker decrypts exported backup and preserves data on cancel or wrong password", async ({ page }) => {
  const { file } = await exportedCopy(page, "ru", true);
  const before = await records(page);
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  let password: string | null = null, prompts = 0;
  page.on("dialog", async dialog => { prompts++; if (password === null) await dialog.dismiss(); else await dialog.accept(password); });
  const picker = page.locator(".rp-import-input");
  const preview = page.getByRole("dialog", { name: "Восстановление копии", exact: true });
  await picker.setInputFiles(file);
  await expect.poll(() => prompts).toBe(1); await expect(picker).toBeEnabled();
  await expect(preview).toHaveCount(0); expect(await records(page)).toEqual(before);
  password = "wrong"; await picker.setInputFiles(file);
  await expect(page.getByRole("alert")).toHaveText("Неверный пароль или повреждённый файл");
  await expect(preview).toHaveCount(0); expect(await records(page)).toEqual(before);
  password = "neutral-backup-password"; await picker.setInputFiles(file);
  await expect(preview).toBeVisible(); expect(await records(page)).toEqual(before);
  await preview.getByRole("button", { name: "Добавить недостающее", exact: true }).click();
  await expect(preview).toHaveCount(0); expect(await records(page)).toEqual(before);
});

test("malformed full backup selected as lore is rejected without partial writes", async ({ page }) => {
  const { text } = await exportedCopy(page, "ru");
  const data = JSON.parse(text); delete data.records.find((r: any) => r.kind === "entry").data.title;
  const before = await records(page);
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.locator(".rp-import-input").setInputFiles({ name: "broken-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole("alert")).toHaveText("Не удалось прочитать резервную копию");
  await expect(page.getByRole("dialog", { name: "Восстановление копии", exact: true })).toHaveCount(0);
  expect(await records(page)).toEqual(before);
});
