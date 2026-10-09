import { expect, test, type Page } from "@playwright/test";

async function aligned(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const choices = document.querySelector("[data-deeprole-choices-host]")?.shadowRoot?.querySelector("section");
    if (!choices) return Infinity;
    const target = choices.getBoundingClientRect();
    const cards = [...document.querySelectorAll("[data-deeprole-illustrations]")].flatMap(host =>
      [...(host.shadowRoot?.querySelectorAll(".dr-illustration-reply,.dr-image-gallery,figure") ?? [])]);
    return cards.length ? Math.max(...cards.map(card => {
      const bounds = card.getBoundingClientRect();
      return Math.max(Math.abs(bounds.left - target.left), Math.abs(bounds.width - target.width));
    })) : Infinity;
  })).toBeLessThan(1);
}

for (const locale of ["ru", "en"]) for (const pinned of [false, true]) for (const adaptive of [false, true]) {
  test(`all illustration surfaces match wide options, ${locale}, pinned=${pinned}, adaptive=${adaptive}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.goto(`/tests/fixtures/illustration-stream.html?locale=${locale}${pinned ? "&pinned" : ""}`);
    await expect.poll(() => page.evaluate(() => !!(window as any).streamTest)).toBe(true);
    await page.evaluate(adaptive => {
      document.querySelector<HTMLElement>("form")!.style.cssText = "position:fixed;box-sizing:border-box;bottom:12px;left:300px;width:1200px;transform:none;padding:12px;border-radius:16px;background:#272e35";
      (window as any).streamTest.prose(); (window as any).streamTest.choices(); (window as any).streamTest.setGenerating(false);
      (window as any).streamTest.update({ adaptiveLayout: adaptive }); (window as any).streamTest.addSavedReply();
      document.querySelector<HTMLTextAreaElement>("textarea")!.value = "My unsent draft.";
    }, adaptive);
    await expect(page.locator("[data-deeprole-choices-host]")).toHaveCount(1);
    await expect.poll(() => page.locator("[data-deeprole-choices-host]").evaluate(node => node.getBoundingClientRect().width)).toBeCloseTo(1200, 0);
    await aligned(page);
    const image = page.locator('[data-message-id="story"] [data-deeprole-illustrations]');
    await image.getByRole("button", { name: locale === "ru" ? "Создать иллюстрацию" : "Create illustration", exact: true }).click();
    await expect(image.getByRole("status")).toBeVisible(); await aligned(page);
    // Failure and retry use exactly the same width, including other saved replies.
    await page.evaluate(() => (window as any).failImage());
    await expect(image.locator(".dr-image-error")).toBeVisible(); await aligned(page);
    await image.getByRole("button", { name: locale === "ru" ? "Попробовать ещё раз" : "Try again", exact: true }).click();
    await expect(image.getByRole("status")).toBeVisible(); await aligned(page);
    await page.evaluate(() => (window as any).finishImage());
    await expect(image.locator("img")).toHaveCount(1); await aligned(page);
    await page.screenshot({ path: info.outputPath("illustrations-same-width.png") });
    // No content sync: native input changes must update every card on their own.
    await page.evaluate(() => { document.querySelector<HTMLElement>("form")!.style.width = "1000px"; document.querySelector<HTMLElement>("form")!.style.left = "400px"; });
    await aligned(page);
    await expect.poll(() => page.locator("[data-deeprole-choices-host]").evaluate(node => node.getBoundingClientRect().width)).toBeCloseTo(1000, 0);
    await page.evaluate(() => (window as any).streamTest.update({ pinSceneChoices: document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!.dataset.deeproleChoicesPinned !== "true" }));
    await aligned(page);
    await page.evaluate(() => {
      const old = document.querySelector<HTMLElement>("form")!, next = old.cloneNode(true) as HTMLElement;
      next.style.width = "calc(100vw - 24px)"; next.style.left = "12px"; old.replaceWith(next);
    });
    await page.setViewportSize({ width: 320, height: 900 }); await aligned(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(page.locator("textarea")).toHaveValue("My unsent draft.");
    await page.screenshot({ path: info.outputPath("illustrations-same-width-narrow.png") });
    // Temporarily hidden composer falls back to the real card; returning it
    // (with position-only CSS motion) restores the shared native input geometry.
    await page.evaluate(() => { document.querySelector<HTMLElement>("form")!.style.display = "none"; });
    await aligned(page);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.evaluate(() => {
      const form = document.querySelector<HTMLElement>("form")!; form.style.display = ""; form.style.width = "1000px"; form.style.left = "400px";
      form.style.transition = "transform 120ms linear"; form.style.transform = "translateX(70px)";
    });
    await aligned(page);
    await expect.poll(() => page.locator("[data-deeprole-choices-host]").evaluate(node => node.getBoundingClientRect().left)).toBeCloseTo(470, 0);
    await aligned(page);
    await page.evaluate(() => (window as any).streamTest.removeOptions());
    const recovery = page.locator("[data-deeprole-choices-recovery] .box"); await expect(recovery).toBeVisible();
    await expect.poll(async () => {
      const a = (await recovery.boundingBox())!, b = (await image.locator(".dr-illustration-reply").boundingBox())!;
      return Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width));
    }).toBeLessThan(1);
    expect(await page.evaluate(() => (window as any).imageCreates)).toBe(2);
    await expect(page.locator("textarea")).toHaveValue("My unsent draft.");
  });
}
