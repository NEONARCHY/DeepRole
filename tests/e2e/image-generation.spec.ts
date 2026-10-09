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
    await expect(first.getByRole("status")).toBeVisible();
    const editor = page.getByRole("dialog"); await expect(editor).toHaveCount(0);
    await expect(first.locator("img")).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).deltaPrompt)).toContain("Mira opens the observatory");
    expect(await page.evaluate(() => (window as any).deltaPrompt)).not.toContain("data:image");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-editor-${locale}-${width}.png`) });
    const dimensions = await first.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]); expect(dimensions).toEqual([2,2]);
    await first.getByRole("button", { name: locale === "ru" ? "Попробовать ещё раз" : "Try again", exact: true }).click(); await expect(first.locator("img")).toHaveCount(1); await expect(first.getByText(locale === "ru" ? "Генерация 2 из 2" : "Generation 2 of 2", {exact:true})).toBeVisible(); await first.getByRole("button",{name:locale === "ru" ? "Предыдущая генерация" : "Previous generation"}).click(); await first.getByRole("button",{name:locale === "ru" ? "Следующая генерация" : "Next generation"}).click(); expect(generations).toBe(2);
    await first.getByRole("button", { name: t.remove }).last().click();
    expect(body.size).toBe("1536x1024");
    await expect(editor).toHaveCount(0); await expect(first.locator("img")).toHaveCount(1); await expect(second.locator("img")).toHaveCount(0);
    expect(generations).toBe(2); expect(body.images[0].image_url).toMatch(/^data:image\/jpeg;base64,/); expect(body.future_parameter).toEqual({ value: [true, null, "literal"] }); expect(body.prompt).toContain("Copper hair. Brown eyes."); expect(body.prompt).not.toContain("Keep this lore");
    await first.getByRole("button", { name: t.view }).click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload(); await expect(first.locator("img")).toHaveCount(1); expect(generations).toBe(2);
    await first.getByRole("button", { name: t.remove }).click(); await expect(first.locator("img")).toHaveCount(0); expect(generations).toBe(2);
    await page.locator("#app").getByRole("button", { name: "Synthetic connection", exact: true }).click();
    await page.getByRole("button", { name: t.models, exact: true }).click();
    const model = page.locator("#app").getByRole("combobox", { name: t.model, exact: true });
    await expect(model.locator("option", { hasText: "synthetic-future-model" })).toHaveCount(1);
    await model.focus(); await model.press("ArrowDown"); await expect(page.getByRole("listbox")).toBeVisible(); await model.press("End"); await model.press("Enter");
    await expect(page.locator("#app").getByRole("combobox", { name: t.model, exact: true })).toHaveValue("synthetic-future-model");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-settings-${locale}-${width}.png`) });
  });
}
test("refusal and timeout stay inline and never retry automatically", async ({ page }) => {
  await page.goto("/tests/fixtures/image-generation.html?locale=en");
  const host = page.locator('[data-message-id="reply-1"] [data-deeprole-illustrations]');
  await expect(host.getByRole("button", { name: "Create illustration", exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).failCode = "forbidden"; });
  await host.getByRole("button", { name: "Create illustration", exact: true }).click(); await expect(host.getByRole("alert")).toContainText("declined");
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(await page.evaluate(() => (window as any).requests.length)).toBe(1);
  await page.evaluate(() => { (window as any).failCode = "timeout"; });
  await host.getByRole("button", { name: "Try again", exact: true }).click(); await expect(host.getByRole("alert")).toContainText("timed out");
  expect(await page.evaluate(() => (window as any).requests.length)).toBe(2);
  await page.reload(); await expect(host.getByRole("alert")).toContainText("timed out"); expect(await host.locator("img").count()).toBe(0);
});
for (const locale of ["ru", "en"] as const) for (const width of [320, 800]) test(`safe HTTP error details, keyboard and reload ${locale} ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); let calls = 0;
  await page.route("https://images.example.test/**", async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    calls++;
    await route.fulfill({ status: 400, json: { error: { code: "INVALID_MODEL", message: "Unsupported editing model; SYNTHETIC-TEST-KEY-NOT-A-REAL-SECRET", param: "model" } }, headers });
  });
  await page.goto(`/tests/fixtures/image-generation.html?locale=${locale}`);
  const host = page.locator('[data-message-id="reply-1"] [data-deeprole-illustrations]');
  await host.getByRole("button", { name: locale === "ru" ? "Создать иллюстрацию" : "Create illustration", exact: true }).click();
  await expect(host.getByRole("alert")).toHaveAttribute("title", "badRequest · HTTP 400 · INVALID_MODEL");
  const summary = host.locator(".dr-image-error-details summary");
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(host.getByText("INVALID_MODEL", { exact: true })).toBeVisible();
  await expect(host.getByText("/images/edits", { exact: true })).toBeVisible();
  expect(await host.innerText()).not.toContain("SYNTHETIC-TEST-KEY-NOT-A-REAL-SECRET");
  expect(await host.innerText()).not.toContain("Copper hair. Brown eyes.");
  expect(calls).toBe(1); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`image-error-${locale}-${width}.png`) });
  await page.reload(); await expect(host.getByRole("alert")).toHaveAttribute("title", "badRequest · HTTP 400 · INVALID_MODEL");
  await host.locator(".dr-image-error-details summary").click(); await expect(host.getByText("INVALID_MODEL", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
