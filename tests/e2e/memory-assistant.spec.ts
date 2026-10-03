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
    await expect(review.getByRole("button", { name: en ? "Save selected changes · 0" : "Сохранить выбранное · 0", exact: true })).toBeDisabled();
    await review.locator(".dr-proposal-summary").click();
    await review.getByRole("checkbox").check();
    await expect(review.getByText(en ? "Before" : "Было", { exact: true })).toBeVisible();
    await expect(review.getByText("Мира останется в городе до рассвета.", { exact: true })).toBeVisible();
    await page.locator("#underlying-chat-control").click();
    await expect(review).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await review.getByRole("button", { name: en ? "Save selected changes · 1" : "Сохранить выбранное · 1", exact: true }).click();
    expect((await page.evaluate(() => (window as any).reviewed))[0]).toMatchObject({ targetEntryId: "m1", selected: true });
  });
}

for (const size of [{ width: 360, height: 600 }, { width: 1280, height: 720 }]) {
  test(`review approval remains inside the viewport beside a tall context stack ${size.width}x${size.height}`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto("/tests/fixtures/page-widget.html?assistant=1&locale=en");
    await page.evaluate(({ height }) => (window as any).setWidgetState({
      contextPosition: { x: 210, y: Math.floor(height / 2) - 1 },
      activity: { phase: "empty", type: "memory-analysis" },
    }), size);
    await page.getByRole("button", { name: "Review changes", exact: true }).click();
    const review = page.getByRole("region", { name: "Review changes", exact: true });
    await review.locator(".dr-proposal-summary").click();
    await review.getByRole("checkbox").check();
    const save = review.getByRole("button", { name: "Save selected changes · 1", exact: true });
    await save.scrollIntoViewIfNeeded();
    const panel = (await page.locator(".dr-panel").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(size.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(size.height);
    await expect(save).toBeInViewport();
    await page.screenshot({ path: info.outputPath("review-approval-visible.png") });
    await save.click();
    expect((await page.evaluate(() => (window as any).reviewed))[0].selected).toBe(true);
  });
}
