import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) for (const adaptive of [true, false]) {
  test(`suggestion card follows illustration edge, ${locale}, ${width}, adaptive=${adaptive}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
    await page.evaluate(adaptive => {
      const form = document.querySelector<HTMLElement>("form")!;
      form.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;border-radius:18px;padding:12px;background:#2b2b2e;box-sizing:border-box";
      (window as any).choicesTest.update({ adaptiveLayout: adaptive });
      (window as any).choicesTest.setHistory('<article data-role="assistant" data-message-id="scene" style="padding:0 12px;margin-left:10px;border-left:1px solid transparent"><div class="ds-markdown ds-assistant-message-main-content"><p>Mira opens the observatory.</p></div><div data-deeprole-illustrations style="aspect-ratio:16/9;background:#20282e;border:1px solid #34414a;border-radius:14px;box-sizing:border-box">Illustration preview</div></article>');
    }, adaptive);
    const request = page.locator("[data-deeprole-choices-recovery]"), box = request.locator(".box"), image = page.locator("[data-deeprole-illustrations]");
    await expect(request.getByRole("button", { name: locale === "ru" ? "Предложить варианты" : "Suggest options", exact: true })).toBeVisible();
    const assertAligned = async () => {
      await expect.poll(async () => Math.abs((await box.boundingBox())!.x - (await image.boundingBox())!.x)).toBeLessThan(1);
      const bounds = (await box.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(8); expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
    };
    await assertAligned();
    await page.screenshot({ path: info.outputPath(`suggestion-aligned-${locale}-${width}.png`) });
    await page.setViewportSize({ width: width === 360 ? 620 : 900, height: 900 });
    await assertAligned();
    await page.evaluate(() => { document.querySelector<HTMLElement>("article")!.style.marginLeft = "22px"; (window as any).choicesTest.sync(); });
    await assertAligned();
    const options = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "I ask about the observatory." }));
    await page.evaluate(options => { (window as any).choicesTest.setHistory('<article data-role="assistant" data-message-id="next"><div class="ds-markdown">Mira awaits an answer. &lt;deeprole_choices&gt;' + JSON.stringify({ version: 1, options }) + '&lt;/deeprole_choices&gt;</div></article>'); }, options);
    await expect(request).toHaveCount(0);
    const ready = page.locator("[data-deeprole-choices-host]"); await expect(ready).toHaveCount(1);
    await expect.poll(async () => Math.abs((await ready.boundingBox())!.width - (await page.locator("form").boundingBox())!.width)).toBeLessThan(1);
  });
}
