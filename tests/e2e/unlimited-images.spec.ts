import { chooseImageCompression } from "./image-upload-helpers";
import { expect, test } from "@playwright/test";
import { characterTab, closeSavedCharacter } from "./character-helpers";
import { realPng } from "../image-fixtures";

for (const locale of ["ru", "en"] as const) test(`uploads an original file beyond 10 MB ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
  const dialog = page.getByRole("dialog");
  await characterTab(dialog, "images", locale);
  // A valid PNG with trailing bytes: the decoder accepts it and the original must remain intact.
  const source = Buffer.concat([Buffer.from(realPng, "base64"), Buffer.alloc(11_000_000)]);
  const library = page.locator(".dr-portrait-library");
  await library.locator("input[type=file]").setInputFiles({ name: "large-original.png", mimeType: "image/png", buffer: source }); await chooseImageCompression(page);
  await expect(library).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(library.locator(".dr-library-image")).toHaveCount(1);
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
  await closeSavedCharacter(dialog, locale);
  expect(await page.evaluate(() => (window as any).saved.sheet.portraitLibrary[0].length)).toBe("data:image/png;base64,".length + source.toString("base64").length);
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test(`unlimited image assignment ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.evaluate(() => {
    const cast = (window as any).getCast();
    const canvas = document.createElement("canvas"); canvas.width = 20; canvas.height = 20;
    const context = canvas.getContext("2d")!;
    const images = Array.from({ length: 65 }, (_, index) => {
      context.fillStyle = `hsl(${index * 5},50%,50%)`; context.fillRect(0, 0, 20, 20);
      return canvas.toDataURL("image/png");
    });
    (window as any).setCast({ entities: cast.entities.map((person: any) => person.id === "mira"
      ? { ...person, characterSheet: { ...person.characterSheet, portraitLibrary: images } } : person) });
  });
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
  const dialog = page.getByRole("dialog"), library = page.locator(".dr-portrait-library");
  await characterTab(dialog, "images", locale);
  await library.locator("select").selectOption("neutral");
  await library.getByRole("button", { name: locale === "ru" ? "Выбрать видимые" : "Select visible", exact: true }).click();
  await library.getByRole("button", { name: locale === "ru" ? "Назначить эмоции" : "Assign to emotion", exact: true }).click();
  await expect(dialog.locator(".dr-portrait-variations img")).toHaveCount(65);
  await expect(library.getByRole("alert")).toHaveCount(0);
  // The upload control remains enabled beyond the former 48-image limit.
  await expect(dialog.locator(".dr-portrait-variations + .dr-character-actions button")).toBeEnabled();
  await expect(dialog).not.toContainText(/50 MB|50 МБ|48 images|48 вариантов/);
  await page.screenshot({ path: info.outputPath(`unlimited-${locale}-${width}.png`) });
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
  await closeSavedCharacter(dialog, locale);
  expect(await page.evaluate(() => (window as any).saved.sheet.sprites.neutral.length)).toBe(65);
});
