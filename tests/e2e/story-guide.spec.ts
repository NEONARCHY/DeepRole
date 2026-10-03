import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) {
  test(`story guide ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/tests/fixtures/sidepanel.html?world=1");
    if (locale === "en") {
      await page.getByRole("button", { name: "Настройки", exact: true }).click();
      await setEnglish(page);
      await page.getByRole("button", { name: "Play", exact: true }).click();
    }
    const title = locale === "ru" ? "Как обновить и перенести историю" : "How to update and continue your story";
    const help = page.getByRole("button", { name: title, exact: true });
    const continuation = page.locator(".play-continuation");
    const updateCard = page.locator(".quick-actions .action-card").last();
    await expect.poll(async () => {
      const card = (await updateCard.boundingBox())!;
      const divider = (await continuation.boundingBox())!;
      return divider.y - (card.y + card.height);
    }).toBeGreaterThanOrEqual(14);
    await continuation.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`play-spacing-${locale}-${width}.png`) });
    await expect(continuation).not.toHaveAttribute("open", "");
    await help.click();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    await expect(continuation).not.toHaveAttribute("open", "");
    await expect(dialog.locator("section")).toHaveCount(8);
    await expect(dialog).toContainText(locale === "ru" ? "История уже идёт, а мира ещё нет?" : "Already playing, but no world yet?");
    await expect(dialog).toContainText(locale === "ru" ? "«Запомнить» или «Обновить лор»?" : "“Remember” or “Update lore”?");
    await expect(dialog).toContainText(locale === "ru" ? "Исходный JSON на диске не перезаписывается" : "does not overwrite the original JSON file");
    await expect(dialog).toContainText(locale === "ru" ? "сама кнопка сообщение не отправляет" : "clicking Apply does not send a message");
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(dialog.locator("header button")).toBeFocused();
    await dialog.locator("footer button").focus();
    await page.keyboard.press("Tab");
    await expect(dialog.locator("header button")).toBeFocused();
    const audit = await new AxeBuilder({ page }).include(".dr-memory-guide").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`story-guide-${locale}-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    await continuation.locator("summary").click({ position: { x: 35, y: 20 } });
    await expect(continuation).toHaveAttribute("open", "");
    await help.click();
    await page.getByRole("dialog").locator("footer button").click();
    await expect(continuation).toHaveAttribute("open", "");
    await expect(help).toBeFocused();
  });
}
