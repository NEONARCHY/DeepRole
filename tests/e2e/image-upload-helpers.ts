import type { Page } from "@playwright/test";
export async function chooseImageCompression(page: Page, mode: "original" | "configured" | "compact" = "configured") {
  const labels = { original: /^(Без сжатия|Keep originals)/, configured: /^(Высокое качество|High quality)/, compact: /^(Меньше места|Save space)/ };
  await page.getByRole("dialog", { name: /^(Сжать изображения\?|Compress images\?)$/ }).getByRole("button", { name: labels[mode] }).click();
}
