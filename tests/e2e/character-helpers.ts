import { expect, type Locator } from "@playwright/test";

export async function closeSavedCharacter(dialog: Locator, locale = "en", embedded = false) {
  await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: embedded ? locale === "ru" ? "К персонажам" : "Back to characters" : locale === "ru" ? "Закрыть" : "Close", exact: true }).first().click();
}
