import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const options = ["positive", "neutral", "negative", "surprise"].map((kind, index) => ({ kind, label: ["Thank Mira", "Ask about the letter", "Refuse to take it", "Offer a trade"][index], text: `I choose ${kind}.` }));
const payload = `<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
const history = `<article data-message-id="scene" data-role="assistant"><div class="ds-markdown"><p>Mira holds a sealed envelope.</p><pre>${payload.replaceAll("<", "&lt;")}</pre></div></article>`;

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`restored options and explicit recovery ${locale} at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const request = page.getByRole("button", { name: locale === "ru" ? "Предложить варианты" : "Suggest options", exact: true });
    await expect(request).toBeVisible();
    expect(await page.evaluate(() => (window as any).requests)).toBe(0);
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-recovery]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    const bounds = await request.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`recovery-${locale}-${width}.png`) });
    await request.focus(); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as any).requests)).toBe(1);
    await page.evaluate((html) => (window as any).choicesTest.setHistory(html), history);
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    expect(await page.evaluate(() => (window as any).requests)).toBe(0);
    await expect(request).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    await page.getByRole("button", { name: /Thank Mira/ }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("I choose positive.");
    expect(await page.evaluate(() => (window as any).sent)).toBe(0);
    await page.screenshot({ path: info.outputPath(`choices-${locale}-${width}.png`) });
    await page.evaluate(() => (window as any).choicesTest.navigate('<article data-message-id="new" data-role="assistant">A different scene.</article>'));
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toHaveCount(0); await expect(request).toBeVisible();
    await page.evaluate((html) => (window as any).choicesTest.navigate(html), history);
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    await page.evaluate(() => (window as any).choicesTest.update({ enabled: false }));
    await expect(page.locator("[data-deeprole-choices-host], [data-deeprole-choices-recovery]")).toHaveCount(0);
    await page.evaluate(() => (window as any).choicesTest.update({ enabled: true }));
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
  });
}
