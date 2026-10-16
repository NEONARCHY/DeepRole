import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) for (const width of [320, 1280]) {
  test(`readable card action and hover portrait details ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await page.waitForFunction(() => !!(window as any).getCast);
    await page.evaluate(locale => {
      const current = (window as any).getCast();
      const stats = locale === "ru" ? [{ label: "Возраст", value: "29 лет" }, { label: "Роль", value: "Новый помощник городского архива" }] : [{ label: "Age", value: "29 years" }, { label: "Role", value: "New assistant at the city archive" }];
      (window as any).setCast({ scene: { ...current.scene, states: { ...current.scene.states, hero: { ...current.scene.states.hero, stats } } } });
      (document.querySelector(".dr-characters") as HTMLElement).style.width = "192px";
    }, locale);
    const row = page.locator(".dr-character-row").first();
    const action = row.locator(".dr-character-row-action");
    await expect(action).toHaveText(locale === "ru" ? "Спокойствие" : "Calm");
    const actionRect = await action.boundingBox();
    const contentRect = await row.locator(":scope > span").boundingBox();
    expect(actionRect!.width).toBeGreaterThan(140);
    expect(actionRect!.width).toBeCloseTo(contentRect!.width, 1);
    expect(actionRect!.height).toBeLessThan(20);
    expect(actionRect!.y).toBeGreaterThanOrEqual(contentRect!.y + contentRect!.height);
    const hero = page.locator('.dr-cast-widget[data-character-id="hero"]');
    const details = hero.locator(".dr-cast-highlights");
    await page.mouse.move(0, 0);
    await expect(details).toBeHidden();
    const before = await hero.boundingBox();
    await hero.locator("img").hover();
    await expect(details).toBeVisible();
    await expect(details).toHaveCSS("opacity", "1");
    expect(await hero.boundingBox()).toEqual(before);
    await page.screenshot({ path: info.outputPath(`portrait-hover-${locale}-${width}.png`) });
    await page.mouse.move(0, 0);
    await expect(details).toBeHidden();
    await hero.locator(".dr-cast-portrait").focus();
    await expect(details).toBeVisible();
    await row.focus();
    await expect(details).toBeHidden();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(details).toHaveCSS("transition-duration", "0s");
    await page.screenshot({ path: info.outputPath(`portrait-rest-${locale}-${width}.png`) });
  });
}

test("touch portraits keep details discoverable without hover", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 950 } });
  try {
    const page = await context.newPage();
    await page.goto("/tests/fixtures/characters.html?locale=ru");
    await expect(page.locator('.dr-cast-widget[data-character-id="mira"] .dr-cast-highlights')).toBeVisible();
  } finally { await context.close(); }
});
