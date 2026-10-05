import { closeSavedCharacter } from "./character-helpers";
import { test, expect } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1100]) test(`bulk portrait library ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  const images = await page.evaluate(() => Array.from({ length: 49 }, (_, i) => {
    const c = document.createElement("canvas"); c.width = 120; c.height = 160; const ctx = c.getContext("2d")!;
    ctx.fillStyle = `hsl(${i * 17},45%,45%)`; ctx.fillRect(0, 0, 120, 160); ctx.fillStyle = "white"; ctx.fillRect(i + 10, 30, 30, 50);
    return c.toDataURL("image/png").split(",")[1]!;
  }));
  const open = async () => { await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); await page.getByRole("button", { name: new RegExp(`^${locale === "ru" ? "Библиотека изображений" : "Image library"} ·`) }).click(); };
  const library = page.locator(".dr-portrait-library"), dialog = page.getByRole("dialog");
  const save = async () => { await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await closeSavedCharacter(dialog, locale); await expect(dialog).toHaveCount(0); };
  await open();
  // Keep one decoder pending so edits during a slow batch are deterministic.
  await page.evaluate(() => {
    const decode = Image.prototype.decode;
    Image.prototype.decode = function () { return decode.call(this).then(() => new Promise<void>(resolve => { (window as any).finishLibraryDecode = () => { Image.prototype.decode = decode; resolve(); }; })); };
  });
  await library.locator("input[type=file]").setInputFiles(images.map((image, i) => ({ name: `library-${i}.png`, mimeType: "image/png", buffer: Buffer.from(image, "base64") })));
  await expect(library).toHaveAttribute("aria-busy", "true");
  await dialog.getByLabel(locale === "ru" ? "Внешность и одежда" : "Appearance and clothing", { exact: true }).fill("Green coat edited during upload");
  await page.waitForFunction(() => typeof (window as any).finishLibraryDecode === "function"); await page.evaluate(() => (window as any).finishLibraryDecode());
  await expect(library.locator(".dr-library-image")).toHaveCount(49);
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(0);
  await save(); expect(await page.evaluate(() => (window as any).saved.sheet.portraitLibrary.length)).toBe(49);
  expect(await page.evaluate(() => (window as any).saved.sheet.appearance)).toBe("Green coat edited during upload");
  await open(); await expect(library.locator(".dr-library-image")).toHaveCount(49);
  const assign = library.getByRole("button", { name: locale === "ru" ? "Назначить эмоции" : "Assign to emotion", exact: true });
  // An overfull assignment must leave every file and selection intact.
  for (let i = 0; i < 49; i++) await library.locator(".dr-library-image").nth(i).click();
  await assign.click(); await expect(library.getByRole("alert")).toContainText("48");
  await expect(library.locator('.dr-library-image[aria-pressed="true"]')).toHaveCount(49);
  await library.getByRole("button", { name: locale === "ru" ? "Снять выбор" : "Clear selection" }).click();
  for (let i = 0; i < 3; i++) await library.locator(".dr-library-image").nth(i).click();
  await library.locator("select").selectOption("happy"); await assign.click();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(3);
  await library.getByRole("button", { name: new RegExp(`^${locale === "ru" ? "Без эмоции" : "Unassigned"} ·`) }).click();
  await expect(library.locator(".dr-library-image")).toHaveCount(46);
  await library.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`library-${locale}-${width}.png`) });
  // A broken batch does not change the prior library.
  await library.locator("input[type=file]").setInputFiles([{ name: "good.png", mimeType: "image/png", buffer: Buffer.from(images[0]!, "base64") }, { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("broken") }]);
  await expect(library.getByRole("alert")).toBeVisible(); await expect(library.locator(".dr-library-image")).toHaveCount(46);
  await library.locator("article").first().getByRole("button", { name: /Удалить из библиотеки|Delete from library/ }).click();
  await expect(library.locator(".dr-library-image")).toHaveCount(45);
  await save(); await open();
  expect(await page.evaluate(() => (window as any).saved.sheet.portraitLibrary.length)).toBe(45);
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(3);
  // Already assigned images remain available to reuse without another file picker.
  await library.locator(".dr-library-image").last().click(); await library.locator("select").selectOption("neutral"); await assign.click();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(1);
  await save(); expect(await page.evaluate(() => (window as any).saved.sheet.portraitLibrary.length)).toBe(45);
});
