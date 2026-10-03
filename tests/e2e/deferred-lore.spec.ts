import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) test(`lore download failure leaves other tabs working and can be recovered (${locale})`, async ({ page }, info) => {
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  let attempts = 0;
  await page.route("**/src/entrypoints/sidepanel/WorldsView.tsx*", route => ++attempts === 1 ? route.abort() : route.continue());
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto("/tests/fixtures/sidepanel.html");
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  expect(attempts).toBe(0);
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(l("Память не изменена", "Your memory is unchanged"));
  await expect(page.getByRole("button", { name: l("Обновить меню", "Refresh menu"), exact: true })).toHaveClass(/primary/);
  await page.screenshot({ path: info.outputPath("lore-load-recovery.png") });
  expect((await new AxeBuilder({ page }).include(".rp-status").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: l("Обновить меню", "Refresh menu"), exact: true }).click();
  await expect(page.getByRole("button", { name: "Лор", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await expect(page.getByRole("button", { name: "Загрузить готовый лор", exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки", exact: true })).toBeVisible();
});

test("an unavailable lore module does not block settings", async ({ page }) => {
  await page.route("**/src/entrypoints/sidepanel/WorldsView.tsx*", route => route.abort());
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки", exact: true })).toBeVisible();
});
