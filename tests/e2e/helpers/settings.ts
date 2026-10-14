import type { Page, FrameLocator, Locator } from "@playwright/test";
import { navigationText, type SettingsSection } from "../../../src/core/navigation-i18n";

export async function openSettingsSection(page: Page | FrameLocator | Locator, section: Exclude<SettingsSection,"home">, locale: string) {
  if (locale !== "ru" && locale !== "en") throw new Error("Unsupported settings-test locale");
  const directory = page.locator(".dr-settings-directory");
  const back = directory.getByRole("button", {name:/^(Все настройки|All settings)$/});
  if (await back.isVisible()) await back.click();
  if(section === "memory" || section === "diagnostics") await directory.getByText(navigationText(locale,"advanced"),{exact:true}).click();
  if(section === "diagnostics") await directory.getByText(navigationText(locale,"support"),{exact:true}).click();
  await directory.getByRole("button", {name:navigationText(locale,section),exact:true}).click();
}

export async function setEnglish(page: Page) {
  await openSettingsSection(page,"app","ru");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await openSettingsSection(page,"memory","en");
}
