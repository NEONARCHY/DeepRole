import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) test(`review character profile and old memory together ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
  await page.goto(`/tests/fixtures/character-fact-review.html?locale=${locale}`);
  const review = page.locator(".dr-memory-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText(locale === "ru" ? "все 1 записей" : "all 1 records");
  const profile = review.getByRole("button", { name: locale === "ru" ? /Карточка персонажа/ : /Character profile/ });
  const appearance = review.getByRole("textbox", { name: locale === "ru" ? "Внешность" : "Appearance", exact: true });
  await expect(profile).toHaveAttribute("aria-expanded", "false");
  await expect(appearance).toHaveCount(0);
  await review.screenshot({ path: info.outputPath(`review-overview-${locale}.png`) });
  await review.getByRole("checkbox", { name: /Mira/ }).first().check();
  await review.getByRole("checkbox", { name: /Mira/ }).last().check();
  await profile.press("Enter");
  await expect(appearance).toHaveValue("Black hair, blue coat.");
  await appearance.fill("Black hair, green coat.");
  await review.getByRole("button", { name: locale === "ru" ? "Изменение записи" : "Update record" }).click();
  await expect(profile).toHaveAttribute("aria-expanded", "false");
  await expect(review).toContainText("red hair");
  await expect(review).toContainText("black hair");
  await review.screenshot({ path: info.outputPath(`character-fact-review-${locale}.png`) });
  await review.getByRole("button", { name: new RegExp(locale === "ru" ? "Сохранить выбранное" : "Save selected changes") }).click();
  await expect.poll(() => page.evaluate(() => (window as any).saved)).toMatchObject({ profileChoice: { appearance: "Black hair, green coat.", personality: "Careful" }, items: [{ targetEntryId: "one", selected: true }] });
  await expect.poll(() => page.evaluate(() => (window as any).reviewClosed)).toBe(true);
});
