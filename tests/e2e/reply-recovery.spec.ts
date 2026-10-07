import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [360, 1280]) test(`automatic reply recovery, reload, scope and narrow layout ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 760 }); await page.goto(`/tests/fixtures/reply-recovery.html?locale=${locale}`);
  await page.waitForFunction(() => !!(window as any).replyTest);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("My unsent draft");
  await page.evaluate(() => (window as any).replyTest.write('<p>Mira examines <strong>the compass</strong>.</p><p>The door opens toward the observatory garden. She waits for your next move.</p><pre><code>Coordinates: north 12, east 4.\nDestination: observatory.</code></pre>'));
  await expect(page.locator("#reply")).toContainText("observatory garden");
  await page.evaluate(() => (window as any).replyTest.replace());
  const host = page.locator("[data-deeprole-recovered-reply]");
  await expect(host).toBeVisible(); await expect(host).toContainText("Mira examines the compass.");
  await expect(host.locator("[data-deeprole-recovery-label]")).toHaveText(locale === "ru" ? "Восстановлено" : "Restored");
  await expect(page.locator("#reply")).toBeHidden(); await expect(page.locator("textarea")).toHaveValue("My unsent draft");
  await expect.poll(() => page.evaluate(() => (window as any).replyTest.archive().length)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const badge = await host.locator("[data-deeprole-recovery-label]").boundingBox(), box = await host.boundingBox();
  expect(badge!.width).toBeLessThanOrEqual(box!.width); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath("restored-reply.png") });
  await page.reload(); await expect(host).toBeVisible(); await expect(host).toContainText("observatory garden");
  await page.evaluate(() => (window as any).replyTest.remount()); await expect(host).toHaveCount(1); await expect(host).toBeVisible();
  await page.evaluate(() => (window as any).replyTest.markSent());
  await expect(host.locator("[data-deeprole-recovery-label]")).toHaveText(locale === "ru" ? "Восстановлено · контекст передан" : "Restored · context sent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("recovered-context-sent.png") });
  await page.evaluate(() => (window as any).replyTest.setEnabled(false)); await expect(host).toHaveCount(0); await expect(page.locator("#reply")).toBeVisible();
  await page.evaluate(() => (window as any).replyTest.setEnabled(true)); await expect(host).toBeVisible();
  await page.evaluate(() => (window as any).replyTest.switchChat("other")); await expect(host).toHaveCount(0); await expect(page.locator("#reply")).toContainText(locale === "ru" ? "за рамки моих текущих возможностей" : "beyond my current scope");
});
