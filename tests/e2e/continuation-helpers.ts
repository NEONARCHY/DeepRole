import { expect, type Locator, type Page } from "@playwright/test";
import { continuationPickerText, continuationText } from "../../src/core/continuation-i18n";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import type { Locale } from "../../src/core/types";

export function continuationLauncher(surface: Page | Locator, locale: Locale) {
  return surface.getByRole("button", { name: continuationText(locale, "continue"), exact: true });
}

export function continuationMethod(surface: Page | Locator, locale: Locale, method: "review" | "saved") {
  return surface.getByRole("dialog", { name: continuationText(locale, "continue"), exact: true })
    .getByRole("button", { name: continuationPickerText(locale)[method], exact: true });
}

export async function openSavedPreview(surface: Page | Locator, locale: Locale) {
  const recover = surface.getByRole("button", { name: savedMemoryText(locale).title, exact: true });
  const launcher = continuationLauncher(surface, locale);
  const trigger = recover.or(launcher).filter({ visible: true }).first();
  await expect(trigger).toBeEnabled();
  const usesPicker = (await trigger.innerText()).trim() === continuationText(locale, "continue");
  await trigger.press("Enter");
  if (usesPicker) {
    const method = continuationMethod(surface, locale, "saved");
    await expect(method).toBeEnabled();
    await method.press("Enter");
  }
}
