import { chooseImageCompression } from "./image-upload-helpers";
import { expect, test } from "@playwright/test";


for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`selfie categories, delayed local photo and viewer, ${locale}, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 820 }); await page.goto(`/tests/fixtures/selfies.html?locale=${locale}`);
    const ui = locale === "ru" ? { add: "Добавить категорию", name: "Название", context: "Когда подходит", upload: "Добавить фото", close: "Закрыть изображение", actual: "Масштаб 100%" } : { add: "Add category", name: "Name", context: "When it fits", upload: "Add photos", close: "Close image", actual: "100% zoom" };
    await page.getByRole("button", { name: ui.add, exact: true }).click();
    await page.getByRole("textbox", { name: ui.name + " 1", exact: true }).fill(locale === "ru" ? "Обычные" : "Regular");
    await page.getByRole("button", { name: new RegExp("^" + ui.upload) }).click();
    const png = Buffer.from((await page.locator(".avatar").getAttribute("src"))!.split(",")[1]!, "base64");
    await page.locator('input[type=file]').setInputFiles({ name: "neutral.png", mimeType: "image/png", buffer: png }); await chooseImageCompression(page);
    await expect.poll(() => page.evaluate(() => (window as any).categories[0]?.images.length)).toBe(1);
    await page.getByRole("button", { name: ui.add, exact: true }).click();
    await page.getByRole("textbox", { name: ui.name + " 2", exact: true }).fill(locale === "ru" ? "Дома" : "At home");
    await page.getByRole("textbox", { name: ui.context + " 2", exact: true }).fill(locale === "ru" ? "Вечером дома в обычной одежде" : "At home in the evening, casual clothes");
    const collection = page.locator(".dr-selfie-categories"); const bounds = await collection.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`selfie-categories-${locale}-${width}.png`) });
    await page.getByRole("button", { name: "Mira portrait" }).click();
    const dialog = page.getByRole("dialog", { name: "Mira", exact: true }); await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: ui.actual }).click(); await expect(dialog).toHaveAttribute("data-actual", "true");
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: "Mira portrait" })).toBeFocused();
    await page.evaluate(() => (window as any).sendPhoto());
    const photo = page.locator("[data-deeprole-scene-photos]"); await expect(photo.getByRole("status")).toBeVisible();
    await expect(photo.locator("img")).toHaveCount(0); await expect(photo.locator("img")).toBeVisible({ timeout: 4000 });
    const original = await photo.locator("img").getAttribute("src");
    await photo.getByRole("button").click(); await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: ui.close }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload(); await expect(photo.locator("img")).toHaveAttribute("src", original!);
    await page.evaluate(() => (window as any).syncPhotos(false)); await expect(photo).toHaveCount(0);
    await page.evaluate(() => (window as any).syncPhotos(true, "other-world")); await expect(photo).toHaveCount(0);
  });
}
