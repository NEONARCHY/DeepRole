import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) {
  test(`unified export transfers emotions and images ${locale} ${width}`, async ({ page }, info) => {
    const l = (ru: string, en: string) => locale === "ru" ? ru : en;
    await page.setViewportSize({ width, height: 560 });
    await page.goto("/tests/fixtures/sidepanel.html?world");
    await expect(page.getByRole("button", { name: "Настройки", exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const { EMPTY_CHARACTER } = await import("/src/core/characters.ts" as string);
      const world = (await repository.list("world"))[0]!;
      await repository.put("world", { ...world, characterEmotions: ["neutral", "ухмылка", "laugh"] });
      await repository.put("entity", { id: "export-person", worldId: world.id, name: "Mira", kind: "character", description: "Original", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, sprites: { laugh: "data:image/png;base64,YQ==" } } });
    });
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    if (locale === "en") await setEnglish(page);
    await page.getByRole("button", { name: l("Файлы и защита", "Files & security"), exact: true }).click();
    await page.getByRole("button", { name: l("Экспорт", "Export"), exact: true }).click();
    const dialog = page.getByRole("dialog", { name: l("Экспорт", "Export"), exact: true });
    await dialog.getByRole("radio", { name: new RegExp(`^${l("Этот мир", "This world")}`) }).check();
    const button = dialog.getByRole("button", { name: l("Скачать файл", "Download file"), exact: true });
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(560);
    await page.screenshot({ path: info.outputPath("export-world.png") });
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    const pack = JSON.parse(await readFile((await download.path())!, "utf8"));
    expect(pack.format).toBe("deeprole-world");
    expect(pack.records.find((r: any) => r.kind === "world").data.characterEmotions).toEqual(["neutral", "ухмылка", "laugh"]);
    expect(pack.records.find((r: any) => r.id === "export-person").data.characterSheet.sprites.laugh).toBe("data:image/png;base64,YQ==");
    expect(pack.records.some((r: any) => r.kind === "binding")).toBe(false);
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: l("Экспорт", "Export"), exact: true }).click();
    await dialog.getByRole("radio", { name: new RegExp(`^${l("Полная резервная копия", "Full backup")}`) }).check();
    await dialog.getByRole("checkbox", { name: l("Защитить паролем", "Protect with a password"), exact: true }).check();
    await expect(button).toBeDisabled();
    await dialog.getByLabel(l("Пароль для копии", "Backup password"), { exact: true }).fill("neutral-test-password");
    const encryptedDownload = page.waitForEvent("download");
    await button.click();
    const encrypted = await encryptedDownload;
    const text = await readFile((await encrypted.path())!, "utf8");
    const restored = await page.evaluate(async text => {
      const { parseBackup } = await import("/src/storage/backup.ts" as string);
      return parseBackup(text, "neutral-test-password");
    }, text);
    expect(restored.records.some((r: any) => r.id === "export-person")).toBe(true);
    await page.getByRole("button", { name: l("Экспорт", "Export"), exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: l("Экспорт", "Export"), exact: true })).toBeFocused();
  });
}
