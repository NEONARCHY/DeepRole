import { chooseImageCompression } from "./image-upload-helpers";
import { closeSavedCharacter, characterTab } from "./character-helpers";
import { test, expect } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1100]) test(`multiple emotion images ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  const images = await page.evaluate(() => ["#4a68b9", "#d3a36a", "#83bba7"].map(color => { const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160; const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 120, 160); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(60, 54, 22, 0, 2 * Math.PI); ctx.fill(); return canvas.toDataURL("image/png").split(",")[1]!; }));
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: locale === "ru" ? "Мой главный герой" : "My protagonist", exact: true }).check();
  await characterTab(dialog, "images", locale);
  await dialog.locator(".dr-portrait-upload").setInputFiles(images.map((image, i) => ({ name: `portrait-${i}.png`, mimeType: "image/png", buffer: Buffer.from(image, "base64") }))); await chooseImageCompression(page);
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(3);
  const preview = dialog.locator(".dr-character-portrait-editor img"); const first = await preview.getAttribute("src");
  await dialog.locator(".dr-portrait-variations [aria-pressed]").nth(1).click(); await expect(preview).not.toHaveAttribute("src", first!);
  await dialog.locator(".dr-portrait-variations [aria-pressed]").nth(2).click();
  await page.screenshot({ path: info.outputPath(`variations-${locale}-${width}.png`) });
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await closeSavedCharacter(dialog, locale);
  expect(await page.evaluate(() => (window as any).saved.sheet.sprites.happy.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ sheet: { protagonist: true }, interlocutor: false, original: { sheet: { protagonist: false }, interlocutor: true } });
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
  await characterTab(dialog, "images", locale);
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(3);
  await dialog.locator(".dr-portrait-variations>div").nth(1).locator("button").last().click();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(2);
  // One unreadable file makes the batch fail without deleting the existing portraits.
  await dialog.locator(".dr-portrait-upload").setInputFiles([{ name: "good.png", mimeType: "image/png", buffer: Buffer.from(images[0]!, "base64") }, { name: "bad.png", mimeType: "image/png", buffer: Buffer.from("broken") }]); await chooseImageCompression(page);
  await expect(dialog.getByRole("alert")).toBeVisible(); await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(2);
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await closeSavedCharacter(dialog, locale);
  expect(await page.evaluate(() => (window as any).saved.sheet.sprites.happy.length)).toBe(2);
  const widget = page.locator('.dr-cast-widget[data-character-id="mira"]');
  await page.mouse.move(width - 1, 0); await page.locator("h1").click();
  await expect(widget.locator(".dr-cast-move")).toHaveCSS("opacity", "0"); await expect(widget.locator(".dr-cast-resize")).toHaveCSS("opacity", "0");
  await widget.locator("img").hover(); await expect(widget.locator(".dr-cast-move")).toHaveCSS("opacity", "1"); await expect(widget.locator(".dr-cast-resize")).toHaveCSS("opacity", "1");
  await widget.locator(".dr-cast-resize").focus(); await page.mouse.move(width - 1, 0); await expect(widget.locator(".dr-cast-resize")).toHaveCSS("opacity", "1");
});
