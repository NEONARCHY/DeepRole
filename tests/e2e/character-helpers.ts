import { expect, type Locator } from "@playwright/test";

export async function characterTab(dialog: Locator, tab: "profile" | "scene" | "images", locale = "en") {
  const labels = locale === "ru" ? { profile: "Анкета", scene: "В сцене", images: "Изображения" } : { profile: "Profile", scene: "In scene", images: "Images" };
  await dialog.getByRole("tab", { name: labels[tab], exact: true }).click();
}

export async function closeSavedCharacter(dialog: Locator, locale = "en", embedded = false) {
  await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: embedded ? locale === "ru" ? "К персонажам" : "Back to characters" : locale === "ru" ? "Закрыть" : "Close", exact: true }).first().click();
}
