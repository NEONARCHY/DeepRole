import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { setEnglish } from "./helpers/settings";

async function decoration(button: Locator) {
  return button.evaluate(el => {
    const css = getComputedStyle(el), overlay = getComputedStyle(el, "::before");
    return { shadow: css.boxShadow, image: css.backgroundImage, opacity: overlay.opacity, transition: overlay.transitionProperty, duration: overlay.transitionDuration, events: overlay.pointerEvents, willChange: overlay.willChange };
  });
}

async function expectAccent(button: Locator) {
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded(); // Exclude Playwright's automatic scrolling from hover geometry.
  const initial = await decoration(button);
  expect(initial.shadow).not.toBe("none");
  expect(initial.image).toContain("linear-gradient");
  expect(initial.events).toBe("none");
  expect(initial.transition).toBe("opacity");
  expect(initial.willChange).toBe("auto");
  // Hover may finish native fractional document scrolling in Firefox.
  // Compare layout coordinates, excluding that unrelated viewport movement.
  const geometry = () => button.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
  const before = await geometry();
  await button.hover();
  await expect.poll(async () => (await decoration(button)).opacity).toBe("1");
  expect((await decoration(button)).shadow).toBe(initial.shadow); // No animated blur/shadow.
  const after = await geometry();
  expect(after.x).toBeCloseTo(before.x, 1); expect(after.y).toBeCloseTo(before.y, 1);
  expect(after.width).toBeCloseTo(before.width, 1); expect(after.height).toBeCloseTo(before.height, 1);
  await button.press("Tab"); // Enter keyboard mode; script focus after a pointer hover is not focus-visible.
  await button.focus();
  await expect(button).toBeFocused(); await expect(button).toHaveCSS("outline-style", "solid");
}

for (const locale of ["ru", "en"] as const) test(`AXIS startup and locked vault share the main-action style ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.evaluate(async locale => {
    const area = (window as any).chrome.storage.local;
    const settings = (await area.get("deeprole_settings")).deeprole_settings;
    await area.set({ deeprole_settings: { ...settings, locale, onboardingComplete: false } });
  }, locale);
  const start = page.locator(".onboarding .button.primary");
  await expectAccent(start); await start.click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    await repository.enableVault("session-password"); await repository.lockVault();
  });
  const unlock = page.locator(".center-screen .button.primary");
  await expect(unlock).toBeDisabled(); expect((await decoration(unlock)).shadow).toBe("none");
  await page.locator(".center-screen input").fill("session-password");
  await expectAccent(unlock); await unlock.click();
  await expect(page.locator(".app-shell")).toBeVisible();
});

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`AXIS settings accent, depth and motion ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/tests/fixtures/sidepanel.html");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    if (locale === "en") await setEnglish(page);
    await page.getByRole("button", { name: locale === "ru" ? "Персонажи" : "Characters", exact: true }).click();
    const save = page.getByRole("button", { name: locale === "ru" ? "Сохранить эмоции" : "Save emotions", exact: true });
    await expectAccent(save);
    const secondary = page.locator(".app-main .button.secondary").first();
    expect((await decoration(secondary)).image).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".settings-card").first()).not.toHaveCSS("box-shadow", "none");
    await page.screenshot({ path: info.outputPath(`settings-${locale}-${width}.png`), fullPage: true });
    await save.click(); await expect(page.locator(".dr-character-settings [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
    await page.locator(".app-shell").evaluate(el => el.setAttribute("data-motion", "off"));
    expect((await decoration(save)).duration).toBe("0s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await decoration(save)).duration).toBe("0s");
    await page.emulateMedia({ forcedColors: "active" });
    expect((await decoration(save)).shadow).toBe("none");
    expect((await decoration(save)).image).toBe("none");
    await save.press("Tab"); await save.focus();
    await expect(save).toHaveCSS("outline-style", "solid");
  });

  test(`AXIS character editor accent and disabled state ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const dialog = page.getByRole("dialog");
    const save = dialog.locator(".dr-character-primary");
    await expectAccent(save);
    await expect(dialog).not.toHaveCSS("box-shadow", "none");
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`character-${locale}-${width}.png`) });
    await save.evaluate((el: HTMLButtonElement) => { el.disabled = true; });
    await expect.poll(async () => (await decoration(save)).opacity).toBe("0");
    expect((await decoration(save)).shadow).toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await decoration(save)).duration).toBe("0s");
  });

  test(`AXIS isolated chat action does not style DeepSeek ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const native = page.getByRole("button", { name: "Send", exact: true });
    const nativeBefore = await decoration(native);
    const request = page.locator("[data-deeprole-choices-recovery]").getByRole("button");
    await expectAccent(request);
    expect(await decoration(native)).toEqual(nativeBefore);
    await page.screenshot({ path: info.outputPath(`request-${locale}-${width}.png`) });
    await request.evaluate((el: HTMLButtonElement) => { el.disabled = true; });
    await expect(request).toBeDisabled();
    await expect.poll(async () => (await decoration(request)).opacity).toBe("0");
    expect((await decoration(request)).shadow).toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await decoration(request)).duration).toBe("0s");
    await request.evaluate((el: HTMLButtonElement) => { el.disabled = false; });
    await request.click();
    await expect.poll(() => page.evaluate(() => (window as any).requests)).toBe(1);
    await expect(request).toHaveCount(0); // Busy requests intentionally hide the recovery action.
    expect(await decoration(native)).toEqual(nativeBefore);
  });

  test(`AXIS reviewed memory accent and contrast ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/page-widget.html?assistant=1&locale=${locale}`);
    await page.getByRole("button", { name: locale === "ru" ? "Проверить изменения" : "Review changes", exact: true }).click();
    const review = page.getByRole("region", { name: locale === "ru" ? "Проверить изменения" : "Review changes", exact: true });
    await review.getByRole("checkbox").first().check();
    const save = review.locator(".dr-assistant-primary");
    await expectAccent(save);
    // The sticky footer intentionally extends into the enclosing panel's padding.
    expect(await page.locator(".dr-panel:has(.dr-memory-review)").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`review-${locale}-${width}.png`) });
    const axe = await new AxeBuilder({ page }).include(".dr-assistant").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
