import { expect, test } from "@playwright/test";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) for (const format of ["entries", "world"] as const) {
  test(`import footer stays visible ${locale} ${width} ${format}`, async ({ page }, info) => {
    const l = (ru: string, en: string) => locale === "ru" ? ru : en;
    await page.emulateMedia({ colorScheme: format === "entries" ? "light" : "dark" });
    await page.setViewportSize({ width, height: 560 });
    await page.goto("/tests/fixtures/sidepanel.html?world");
    if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
    await page.getByRole("button", { name: l("Миры", "Worlds"), exact: true }).click();
    await page.getByRole("button", { name: l("Загрузить мир из файла", "Load a world from a file"), exact: true }).click();
    if (width === 320) await page.addStyleTag({ content: "html { font-size: 125%; }" });
    await expect(page.locator(".rp-import-formats")).toContainText(l("Файлы с записями памяти", "Memory entry files"));
    await expect(page.locator(".rp-import-formats a")).toHaveCount(0);
    const value = format === "entries" ? Array.from({ length: 45 }, (_, i) => ({ title: `Fact ${i}`, content: "Unchanged text.\n".repeat(120) })) : await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const { exportWorld } = await import("/src/storage/worlds.ts" as string);
      const worlds = await repository.list("world");
      return exportWorld(worlds[0]!.id);
    });
    await page.locator('.lore-import-modal input[type="file"]').setInputFiles({ name: "Neutral world.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
    const confirm = page.getByRole("button", { name: l("Сохранить в библиотеку", "Save to library"), exact: true });
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveAccessibleDescription(l("Новый мир появится в разделе «Миры».", "Your new world will appear in Worlds."));
    const body = page.locator(".lore-import-modal > .modal-body");
    const footer = page.locator(".rp-import-footer");
    const checkGeometry = async () => {
      const dialogBox = (await page.locator(".lore-import-modal").boundingBox())!;
      expect(Math.abs(dialogBox.x + dialogBox.width / 2 - width / 2)).toBeLessThan(2);
      const buttonBox = (await confirm.boundingBox())!;
      const bodyBox = (await body.boundingBox())!;
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(buttonBox.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(560);
      expect(buttonBox.x).toBeGreaterThanOrEqual(0);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(width);
      await expect(footer).toBeVisible();
    };
    await checkGeometry();
    if (format === "entries") {
      await expect(page.locator(".rp-import-character-hint")).toHaveText(l("Текст записей не меняется. Для переноса карточек и портретов нужен экспорт мира DeepRole.", "Entry text stays unchanged. To transfer character sheets and portraits, use a DeepRole world export."));
      await page.locator(".rp-import-preview summary").first().click();
    }
    await body.evaluate(el => { el.scrollTop = 0; });
    await checkGeometry();
    await page.screenshot({ path: info.outputPath("import-top.png") });
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await checkGeometry();
    await page.screenshot({ path: info.outputPath("import-bottom.png") });
    await confirm.click();
    await expect(page.locator(".lore-import-modal")).toHaveCount(0);
  });
}
