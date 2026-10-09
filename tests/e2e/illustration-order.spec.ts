import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) for (const pinned of [false, true]) {
  test(`illustration waits for complete reply and stays before options, ${locale} ${width}, pinned=${pinned}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/illustration-stream.html?locale=${locale}${pinned ? "&pinned" : ""}`);
    await expect.poll(() => page.evaluate(() => !!(window as any).streamTest)).toBe(true);
    const row = page.locator('[data-message-id="story"]'), image = row.locator("[data-deeprole-illustrations]"), choices = page.locator("[data-deeprole-choices-host]");
    await expect(image).toHaveCount(0); // Thinking, including its visible header.
    await page.evaluate(() => (window as any).streamTest.prose());
    await expect(image).toHaveCount(0); // Narrative is still streaming.
    await page.evaluate(() => (window as any).streamTest.choices());
    await expect(page.locator("[data-deeprole-choices-loading]")).toHaveCount(1);
    await expect(image).toHaveCount(0); // Even a complete JSON block is not the native finish signal.
    await page.evaluate(() => (window as any).streamTest.setGenerating(false));
    const generate = image.getByRole("button", { name: locale === "ru" ? "Создать иллюстрацию" : "Create illustration", exact: true });
    await expect(generate).toBeVisible(); await expect(choices).toHaveCount(1);
    await expect(choices).toHaveAttribute("data-deeprole-choices-pinned", String(pinned));
    expect(await row.evaluate(node => node.lastElementChild?.hasAttribute("data-deeprole-illustrations"))).toBe(true);
    if (!pinned) {
      const imageBox = (await image.boundingBox())!, choiceBox = (await choices.boundingBox())!;
      expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(choiceBox.y);
    } else {
      expect(await page.locator("[data-deeprole-choices-anchor]").evaluate(anchor => !!(document.querySelector('[data-message-id="story"]')!.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    }
    await generate.click(); await expect(image.getByRole("status")).toBeVisible();
    await page.evaluate(() => (window as any).streamTest.service());
    await expect(image.getByRole("status")).toBeVisible(); // Do not unmount a running image job.
    await expect(page.locator('[data-message-id="plan-reply"] [data-deeprole-illustrations]')).toHaveCount(0);
    await page.evaluate(() => { (window as any).streamTest.stopService(); (window as any).finishImage(); });
    await expect(image.locator("img")).toHaveCount(1);
    await page.evaluate(() => (window as any).streamTest.appendToolbar());
    expect(await row.evaluate(node => node.lastElementChild?.hasAttribute("data-deeprole-illustrations"))).toBe(true);
    // Returning to the story and rebuilding native DOM keeps one saved picture.
    await page.evaluate(() => { document.querySelector('[data-message-id="plan-request"]')!.remove(); document.querySelector('[data-message-id="plan-reply"]')!.remove(); (window as any).streamTest.replace(); });
    await expect(image.locator("img")).toHaveCount(1); await expect(image).toHaveCount(1); await expect(choices).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).imageCreates)).toBe(1);
    const scenes = await page.evaluate(() => (window as any).sentScenes);
    expect(scenes).toEqual(["Mira opens the observatory at dusk."]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (!pinned) {
      const imageBox = (await image.boundingBox())!, choiceBox = (await choices.boundingBox())!;
      expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(choiceBox.y);
    }
    await page.screenshot({ path: info.outputPath("illustration-before-options.png") });
    await page.evaluate(() => (window as any).streamTest.regenerate()); await expect(image).toHaveCount(0);
    await page.evaluate(() => (window as any).streamTest.setGenerating(false)); await expect(generate).toBeVisible();
    expect(await page.evaluate(() => (window as any).imageCreates)).toBe(1); // No automatic or duplicate generation.
  });
}
