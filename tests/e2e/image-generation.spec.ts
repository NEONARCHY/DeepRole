import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { realPng } from "../image-fixtures";
for (const locale of ["ru", "en"] as const) for (const width of [320, 360]) {
  test(`image workflow, settings and keyboard ${locale} ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let generations = 0; let body: any;
    await page.route("https://images.example.test/**", async route => {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
      if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      if (route.request().url().endsWith("/models")) { await route.fulfill({ json: { data: [{ id: "synthetic-image-model" }, { id: "synthetic-future-model" }] }, headers }); return; }
      generations++; body = route.request().postDataJSON();
      await route.fulfill({ json: { data: [{ b64_json: realPng }] }, headers: { ...headers, "x-venice-is-blurred": "false", "x-venice-is-content-violation": "false", "access-control-expose-headers": "x-venice-is-blurred,x-venice-is-content-violation" } });
    });
    const t = locale === "ru" ? { create: "Создать иллюстрацию", delta: "Только текущая сцена", canonical: "Постоянная внешность", ai: "Описать сцену с DeepSeek", reference: "Референсы из загруженных изображений 1", view: "Открыть изображение", remove: "Удалить иллюстрацию", close: "Закрыть", models: "Загрузить модели", model: "Модель генерации", invalid: "Проверьте адрес" } : { create: "Create illustration", delta: "Current scene only", canonical: "Stable appearance", ai: "Describe scene with DeepSeek", reference: "References from uploaded images 1", view: "Open image", remove: "Delete illustration", close: "Close", models: "Load models", model: "Generation model", invalid: "Check the address" };
    await page.goto(`/tests/fixtures/image-generation.html?locale=${locale}`);
    const first = page.locator('[data-message-id="reply-1"] [data-deeprole-illustrations]');
    const second = page.locator('[data-message-id="reply-2"] [data-deeprole-illustrations]');
    await first.getByRole("button", { name: t.create, exact: true }).click();
    const editor = page.getByRole("dialog", { name: t.create, exact: true });
    await expect(editor.getByRole("textbox", { name: t.canonical })).toHaveValue("Copper hair. Brown eyes.");
    await editor.getByRole("button", { name: t.ai, exact: true }).click();
    await expect(editor.getByRole("textbox", { name: t.delta })).toHaveValue(/observatory/);
    expect(await page.evaluate(() => (window as any).deltaPrompt)).not.toContain("data:image");
    await editor.getByRole("button", { name: t.reference, exact: true }).click();
    await expect(editor.getByRole("button", { name: t.reference })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-editor-${locale}-${width}.png`) });
    await editor.getByRole("button", { name: t.create, exact: true }).click();
    await expect(editor).toHaveCount(0); await expect(first.locator("img")).toHaveCount(1); await expect(second.locator("img")).toHaveCount(0);
    expect(generations).toBe(1); expect(body.images[0].image_url).toMatch(/^data:image\/jpeg;base64,/); expect(body.future_parameter).toEqual({ value: [true, null, "literal"] }); expect(body.prompt).toContain("Copper hair. Brown eyes."); expect(body.prompt).not.toContain("Keep this lore");
    await first.getByRole("button", { name: t.view }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload(); await expect(first.locator("img")).toHaveCount(1); expect(generations).toBe(1);
    await first.getByRole("button", { name: t.remove }).click(); await expect(first.locator("img")).toHaveCount(0); expect(generations).toBe(1);
    await page.locator("#app").getByRole("button", { name: "Synthetic connection", exact: true }).click();
    await page.getByRole("button", { name: t.models, exact: true }).click();
    await page.locator("#app").getByRole("combobox", { name: t.model, exact: true }).focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("End"); await page.keyboard.press("Enter");
    await expect(page.locator("#app").getByRole("combobox", { name: t.model, exact: true })).toHaveValue("synthetic-future-model");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-settings-${locale}-${width}.png`) });
  });
}
test("refusal and timeout keep the editor and never retry", async ({ page }) => {
  await page.goto("/tests/fixtures/image-generation.html?locale=en");
  await page.locator('[data-message-id="reply-1"]').getByRole("button", { name: "Create illustration" }).click();
  const editor = page.getByRole("dialog"); await editor.getByRole("textbox", { name: "Current scene only" }).fill("An observatory at dusk");
  await page.evaluate(() => { (window as any).failCode = "forbidden"; });
  await editor.getByRole("button", { name: "Create illustration" }).click(); await expect(editor.getByRole("alert")).toContainText("declined");
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(1);
  await page.evaluate(() => { (window as any).failCode = "timeout"; });
  await editor.getByRole("button", { name: "Create illustration" }).click(); await expect(editor.getByRole("alert")).toContainText("timed out");
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(2); await page.keyboard.press("Escape"); await expect(editor).toHaveCount(0);
});
