import type { Page } from "@playwright/test";

export async function setEnglish(page: Page) {
  await page.getByRole("button", { name: "Приложение", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
}
