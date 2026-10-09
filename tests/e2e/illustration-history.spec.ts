import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { syntheticHDPng } from "./helpers/hd-image";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("HD history in one card, loading, failure and reload " + locale + " " + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/tests/fixtures/image-generation.html?locale=" + locale);
  const png = await page.evaluate(syntheticHDPng);
  expect(png.length).toBeGreaterThan(300_000); let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://images.example.test/**", async route => {
    if (route.request().method() !== "POST") { await route.fulfill({ json: { data: [] } }); return; }
    const call = ++calls; if (call === 2) await gate;
    await route.fulfill(call === 3 ? { status: 401, json: { error: { code: "TEST_KEY", message: "Synthetic key failure" } } } : { json: { data: [{ b64_json: png.slice(png.indexOf(",") + 1) }] } });
  });
  const t = locale === "ru" ? { create: "Создать иллюстрацию", retry: "Попробовать ещё раз", previous: "Предыдущая генерация", next: "Следующая генерация", view: "Открыть изображение", zoom: "Масштаб 100%", remove: "Удалить иллюстрацию", history: "Генерация" } : { create: "Create illustration", retry: "Try again", previous: "Previous generation", next: "Next generation", view: "Open image", zoom: "100% zoom", remove: "Delete illustration", history: "Generation" };
  const first = page.locator('[data-message-id="reply-1"] [data-deeprole-illustrations]'), second = page.locator('[data-message-id="reply-2"] [data-deeprole-illustrations]');
  const count = (current: number, total: number) => locale === "ru" ? "Генерация " + current + " из " + total : "Generation " + current + " of " + total;
  await first.getByRole("button", { name: t.create, exact: true }).click(); await expect(first.locator("img")).toHaveCount(1);
  await expect.poll(() => first.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1920, 1080]);
  expect(await first.locator("img").getAttribute("src")).toBe(png); await expect(first.locator(".dr-image-pixels")).toContainText("1920 × 1080");
  await first.getByRole("button", { name: t.view, exact: true }).click(); await page.getByRole("button", { name: t.zoom }).click();
  await expect.poll(() => page.getByRole("dialog").locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1920);
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: t.retry, exact: true }).click(); await expect(first.getByRole("status")).toBeVisible();
  await expect(first.locator("figure")).toHaveCount(1); await expect(first.locator("img")).toHaveCount(0);
  await first.getByRole("button", { name: t.previous }).click(); await expect(first.locator("img")).toHaveCount(1); expect(calls).toBe(2);
  await first.getByRole("button", { name: t.next }).click(); await expect(first.getByRole("status")).toBeVisible();
  await page.screenshot({ path: info.outputPath("history-wait-" + locale + "-" + width + ".png") }); release();
  await expect(first.getByText(count(2, 2), { exact: true })).toBeVisible(); await expect(first.locator("img")).toHaveCount(1);
  const stored = await page.evaluate(async () => (await (window as any).repo.list("illustration")).sort((a: any, b: any) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id)).map((r: any) => ({ id: r.id, image: r.image, messageKey: r.messageKey })));
  expect(stored).toHaveLength(2); expect(stored.every((r: any) => r.image === png)).toBe(true);
  await first.getByRole("button", { name: t.previous }).focus(); await page.keyboard.press("ArrowLeft"); await expect(first.getByText(count(1, 2), { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight"); await expect(first.getByText(count(2, 2), { exact: true })).toBeVisible(); expect(calls).toBe(2);
  await page.screenshot({ path: info.outputPath("history-ready-" + locale + "-" + width + ".png") });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await first.getByRole("button", { name: t.retry, exact: true }).click(); await expect(first.getByRole("alert")).toBeVisible(); await expect(first.locator("img")).toHaveCount(0);
  await first.getByRole("button", { name: t.previous }).click(); await expect(first.locator("img")).toHaveCount(1); expect(calls).toBe(3);
  await first.getByRole("button", { name: t.next }).click(); await expect(first.getByRole("alert")).toBeVisible();
  await page.reload(); await expect(first.getByRole("alert")).toBeVisible(); expect(calls).toBe(3);
  await first.getByRole("button", { name: t.previous }).click(); await expect(first.getByText(count(2, 3), { exact: true })).toBeVisible();
  await second.getByRole("button", { name: t.create, exact: true }).click(); await expect(second.locator("img")).toHaveCount(1);
  await expect(second.getByText(count(1, 1), { exact: true })).toBeVisible(); await expect(first.getByText(count(2, 3), { exact: true })).toBeVisible();
  await first.getByRole("button", { name: t.remove }).click();
  const remaining = await page.evaluate(async () => (await (window as any).repo.list("illustration")).map((r: any) => r.id));
  expect(remaining).toContain(stored[0].id); expect(remaining).not.toContain(stored[1].id); expect(remaining).toHaveLength(2); expect(calls).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.evaluate(async () => (await (window as any).repo.get("world", "image-world")).description)).toBe("Keep this lore unchanged.");
});
