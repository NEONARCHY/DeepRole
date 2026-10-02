import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) {
  test(`quiet in-game memory composer and review are accessible (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 960 });
    await page.goto(`/tests/fixtures/page-widget.html?assistant=1&locale=${locale}`);
    const en = locale === "en";
    await expect(page.locator(".dr-memory-review")).toHaveCount(0);
    await expect(page.locator(".modal-backdrop")).toHaveCount(0);
    await page.getByRole("button", { name: en ? /^Context/ : /^Контекст/ }).click();
    await page.getByRole("button", { name: en ? "Remember" : "Запомнить", exact: true }).click();
    const composer = page.getByRole("region", { name: en ? "Remember" : "Запомнить", exact: true });
    await composer.getByRole("textbox", { name: en ? "What should stay in memory?" : "Что нужно оставить в памяти?", exact: true }).fill("Keep the RP in third person.");
    await composer.getByRole("button", { name: en ? "Always" : "Всегда", exact: true }).click();
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await composer.getByRole("button", { name: en ? "Save to lore" : "Сохранить в лор", exact: true }).click();
    expect(await page.evaluate(() => (window as any).savedMemory)).toMatchObject({ mode: "always", text: "Keep the RP in third person.", title: "" });
    await page.getByRole("button", { name: en ? "Review changes · 1" : "Проверить изменения · 1", exact: true }).click();
    const review = page.getByRole("region", { name: en ? "Review changes" : "Проверить изменения", exact: true });
    await expect(page.getByText(en ? "Selected for the next message, not sent in advance." : "Выбрано для следующего сообщения, а не отправлено заранее.", { exact: true })).toHaveCount(0);
    await expect(page.locator(".dr-panel > .dr-play-tools")).toHaveCount(0);
    await expect(review.getByText(en ? "Before" : "Было", { exact: true })).toBeVisible();
    await expect(review.getByText("Мира останется в городе до рассвета.", { exact: true })).toBeVisible();
    await page.locator("#underlying-chat-control").click();
    await expect(review).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await review.getByRole("button", { name: en ? "Save selected changes · 1" : "Сохранить выбранное · 1", exact: true }).click();
    expect((await page.evaluate(() => (window as any).reviewed))[0]).toMatchObject({ targetEntryId: "m1", selected: true });
  });
}
