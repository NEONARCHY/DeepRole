import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) for (const pinned of [false, true]) test("hidden native service envelopes leave no empty gaps " + locale + " " + width + " pinned=" + pinned, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto("/tests/fixtures/hidden-service-layout.html?locale=" + locale + (pinned ? "&pinned" : ""));
  await expect.poll(() => page.evaluate(() => !!(window as any).layoutTest)).toBe(true);
  const cards = page.locator("[data-deeprole-choices-host]"), composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(cards).toHaveCount(1); await expect(cards).toBeVisible(); await expect(cards.locator(".grid button")).toHaveCount(4);
  await expect(composer).toHaveValue("Keep this unsent draft.");
  for (const id of ["image-command-shell", "image-reply-shell", "choice-command-shell"]) {
    const shell = page.locator("#" + id); await expect(shell).toBeHidden(); expect(await shell.evaluate(node => node.getBoundingClientRect().height)).toBe(0);
  }
  await expect(page.locator("#choice-reply")).toBeHidden(); await expect(page.locator("#choice-toolbar")).toBeHidden();
  await expect(page.locator("#story")).toBeVisible(); await expect(page.locator("#image-action")).toBeVisible();
  expect(await page.locator("#image-command").textContent()).toContain("[DeepRole Image Plan]");
  expect(await page.locator("#image-reply").textContent()).toContain('"characters":[]');
  expect(await page.locator("#choice-reply").textContent()).toContain("<deeprole_choices>");
  const source = await page.locator("#image-reply").textContent();
  if (!pinned) {
    const card = (await cards.boundingBox())!, story = (await page.locator("#story-shell").boundingBox())!;
    expect(card.y - story.y - story.height).toBeLessThan(40);
    // The inline reserve legitimately has zero height when no extra clearance
    // is needed; it must not inherit the service shell's display:none.
    expect(await page.locator("[data-deeprole-choices-spacer]").evaluate(node => getComputedStyle(node).display)).not.toBe("none");
  } else {
    const card = (await cards.boundingBox())!, input = (await page.locator("form").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(input.y - 8);
    expect(await page.locator("[data-deeprole-choices-anchor]").evaluate(node => getComputedStyle(node).display)).not.toBe("none");
  }
  await page.screenshot({ path: info.outputPath("collapsed-services.png") });
  await page.evaluate(() => (window as any).layoutTest.sync()); expect(await page.locator("#image-reply").textContent()).toBe(source);
  await page.evaluate(() => (window as any).layoutTest.replace());
  await expect(cards).toHaveCount(1); await expect(cards).toBeVisible(); await expect(page.locator("#image-reply-shell")).toBeHidden();
  await expect(composer).toHaveValue("Keep this unsent draft.");
  await page.evaluate(() => (window as any).layoutTest.prose());
  await expect(page.locator("#choice-reply")).toBeVisible(); await expect(page.locator("#choice-toolbar")).toBeVisible();
  await expect(page.locator("#choice-reply")).toContainText("Mira returns to the telescope.");
  await page.evaluate(() => (window as any).layoutTest.reuse());
  await expect(page.locator("#image-command-shell")).toBeVisible(); await expect(page.locator("#image-reply-shell")).toBeVisible();
  await expect(page.locator("#choice-command-shell")).toBeVisible(); await expect(page.locator("#choice-command")).toContainText("Let us continue exploring.");
  await expect(page.locator("#image-reply")).toContainText("Mira points toward the telescope.");
  await page.locator("#image-action").click(); expect(await page.evaluate(() => (window as any).imageClicks)).toBe(1);
});
