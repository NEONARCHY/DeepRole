import { expect, test } from "@playwright/test";

for (const surface of ["chat", "sidepanel"]) for (const locale of ["ru", "en"]) for (const width of [320, 1100]) {
 test(`cast review accepts real clicks: ${surface} ${locale} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/tests/fixtures/cast.html?locale=${locale}&surface=${surface}&compact=${surface === "chat" ? 1 : 0}`);
  const text = (ru: string, en: string) => locale === "ru" ? ru : en;
  const review = page.locator(".dr-cast-status").getByRole("button", { name: text("Проверить персонажей", "Review characters"), exact: true });
  await expect(review).toBeVisible();
  const before = await page.evaluate(() => (window as any).castSnapshot());
  const dialog = page.getByRole("dialog", { name: text("Персонажи из лора", "Characters from lore"), exact: true });
  await review.click(); await expect(dialog).toBeVisible();
  if (surface === "chat") await expect(page.locator(".dr-root")).toHaveCSS("pointer-events", "none");
  await expect(page.locator(".dr-cast-layer")).toHaveCSS("pointer-events", "auto");
  const headerClose = dialog.locator("header").getByRole("button", { name: text("Закрыть", "Close"), exact: true });
  // Do not use force/evaluate-click: actual hit testing is the regression.
  await headerClose.click({ timeout: 3000 }); await expect(dialog).toHaveCount(0); await expect(review).toBeFocused();
  expect((await page.evaluate(() => (window as any).castSnapshot())).job.draft).toEqual(before.job.draft);

  await review.click();
  await dialog.getByRole("spinbutton", { name: text("Доверие: Mira", "Trust: Mira"), exact: true }).fill("88");
  const mira = dialog.locator(".dr-cast-member").nth(1);
  await mira.locator("summary").first().click();
  const appearance = mira.getByRole("textbox", { name: text("Внешность: Mira", "Appearance: Mira"), exact: true });
  await appearance.fill("Edited coat"); await expect(appearance).toHaveValue("Edited coat");
  await mira.getByRole("button", { name: text("Убрать характеристику: Energy", "Remove attribute: Energy"), exact: true }).click();
  await expect(mira.getByRole("spinbutton", { name: "Energy: Mira", exact: true })).toHaveCount(0);
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  const footer = (await dialog.locator("footer").boundingBox())!;
  expect(footer.y).toBeGreaterThanOrEqual(0); expect(footer.y + footer.height).toBeLessThanOrEqual(800);
  if (surface === "chat") {
   await page.mouse.click(3, 3);
   expect(await page.evaluate(() => (window as any).castOutsideClicks)).toBe(0);
   await expect(dialog).toBeVisible();
  }
  // Removing a focused control leaves the browser focused on body. Test Escape
  // from a surviving dialog control, as the modal's key handler is scoped to it.
  await headerClose.focus(); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(review).toBeFocused();
  await review.click();
  await expect(dialog.getByRole("spinbutton", { name: text("Доверие: Mira", "Trust: Mira"), exact: true })).toHaveValue("88");
  await mira.locator("summary").first().click();
  await expect(appearance).toHaveValue("Edited coat");
  await expect(mira.getByRole("spinbutton", { name: "Energy: Mira", exact: true })).toHaveCount(0);
  await dialog.locator("footer").getByRole("button", { name: text("Закрыть", "Close"), exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(review).toBeFocused();
  expect((await page.evaluate(() => (window as any).castSnapshot())).job.draft).toEqual(before.job.draft);

  await review.click();
  await dialog.getByRole("spinbutton", { name: text("Доверие: Mira", "Trust: Mira"), exact: true }).fill("90");
  await dialog.locator("footer").getByRole("button", { name: text("Сохранить выбранных · 2", "Save selected · 2"), exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => (window as any).saved);
  expect(saved).toHaveLength(2); expect(saved.find((person: any) => person.name === "Mira").characterSheet.relationships.initial.trust).toBe(90);
  expect(await page.evaluate(() => (window as any).castMessages.filter((m: any) => ["start", "cancel", "cleanup"].includes(m.action)))).toEqual([]);
  expect(await page.evaluate(() => (window as any).castMessages.filter((m: any) => m.action === "apply").length)).toBe(1);
 });
}
