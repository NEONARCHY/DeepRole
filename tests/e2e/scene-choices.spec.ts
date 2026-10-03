import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const options = ["positive", "neutral", "negative", "surprise"].map((kind, index) => ({ kind, label: ["Thank Mira", "Ask about the letter", "Refuse to take it", "Offer a trade"][index], text: `I choose ${kind}.` }));
const payload = `<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
const history = `<article data-message-id="scene" data-role="assistant"><div class="ds-markdown"><p>Mira holds a sealed envelope.</p><pre>${payload.replaceAll("<", "&lt;")}</pre></div></article>`;

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`restored options and explicit recovery ${locale} at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const request = page.getByRole("button", { name: locale === "ru" ? "Предложить варианты" : "Suggest options", exact: true });
    await expect(request).toBeVisible();
    expect(await page.evaluate(() => (window as any).requests)).toBe(0);
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-recovery]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    const bounds = await request.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`recovery-${locale}-${width}.png`) });
    await request.focus(); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as any).requests)).toBe(1);
    await page.evaluate((html) => (window as any).choicesTest.setHistory(html), history);
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    expect(await page.evaluate(() => (window as any).requests)).toBe(0);
    await expect(request).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    await page.getByRole("button", { name: /Thank Mira/ }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("I choose positive.");
    expect(await page.evaluate(() => (window as any).sent)).toBe(0);
    await expect(page.getByRole("status")).toContainText(locale === "ru" ? "Вставлено в поле сообщения" : "Inserted into the message box");
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("MY OWN DRAFT");
    await page.getByRole("button", { name: /Ask about the letter/ }).click();
    await expect(page.getByRole("status")).toContainText(locale === "ru" ? "Вариант не вставлен" : "The option was not inserted");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY OWN DRAFT");
    await expect(page.locator(".choice-status")).toHaveAttribute("data-selected", "false");
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`choices-${locale}-${width}.png`) });
    await page.evaluate(() => (window as any).choicesTest.navigate('<article data-message-id="new" data-role="assistant">A different scene.</article>'));
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toHaveCount(0); await expect(request).toBeVisible();
    await page.evaluate((html) => (window as any).choicesTest.navigate(html), history);
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
    await page.evaluate(() => (window as any).choicesTest.update({ enabled: false }));
    await expect(page.locator("[data-deeprole-choices-host], [data-deeprole-choices-recovery]")).toHaveCount(0);
    await page.evaluate(() => (window as any).choicesTest.update({ enabled: true }));
    await expect(page.getByRole("button", { name: /Thank Mira/ })).toBeVisible();
  });
}

for (const locale of ["ru", "en"] as const) test(`regeneration with identical options uses the current story ${locale}`, async ({ page }) => {
  await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
  const card = page.locator("[data-deeprole-choices-host]"); const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("MY OWN DRAFT");
  await page.locator(".ds-markdown p").evaluate(p => { p.textContent = "Mira leaves the letter on the table."; });
  await card.locator(".grid button").first().click();
  await expect(card.locator(".choice-status")).toContainText(locale === "ru" ? "Сцена уже изменилась" : "The scene has changed");
  await expect(composer).toHaveValue("MY OWN DRAFT");
  await page.evaluate(() => (window as any).choicesTest.sync());
  await expect(card.locator(".grid button")).toHaveCount(4); await composer.fill("");
  await card.locator(".grid button").first().click(); await expect(composer).toHaveValue("I choose positive.");
  await page.evaluate(() => (window as any).choicesTest.update({ generating: true })); await expect(card).toHaveCount(0);
  await page.locator(".ds-markdown p").evaluate(p => { p.textContent = "Mira picks the letter up again."; });
  await page.evaluate(() => (window as any).choicesTest.update({ generating: false }));
  await expect(card.locator(".grid button")).toHaveCount(4); await expect(page.getByRole("button", { name: locale === "ru" ? "Предложить варианты" : "Suggest options", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => ({ sent: (window as any).sent, requests: (window as any).requests }))).toEqual({ sent: 0, requests: 0 });
});

test("keyboard choice navigation is local, never sends and never overwrites a personal draft", async ({ page }) => {
  await page.goto("/tests/fixtures/scene-choices.html?locale=en");
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
  const buttons = page.locator("[data-deeprole-choices-host]").locator(".grid button");
  await buttons.first().focus(); await page.keyboard.press("ArrowRight"); await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("4");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toHaveValue("I choose surprise.");
  await expect(buttons.nth(3)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
  await composer.fill("MY OWN DRAFT "); await composer.press("1"); await expect(composer).toHaveValue("MY OWN DRAFT 1");
  await buttons.first().focus(); await page.keyboard.press("2");
  await expect(composer).toHaveValue("MY OWN DRAFT 1");
  await expect(buttons.nth(3)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("The option was not inserted");
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
  await page.evaluate(() => (window as any).choicesTest.update({ generating: true }));
  await expect(buttons).toHaveCount(0);
});

test("a refused choice keeps keyboard focus and never changes the draft", async ({ page }) => {
  await page.goto("/tests/fixtures/scene-choices.html?locale=en");
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("MY PRIVATE DRAFT");
  const buttons = page.locator("[data-deeprole-choices-host]").locator(".grid button");
  await buttons.first().focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("The option was not inserted");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(buttons.nth(1)).toBeFocused();
  await expect(composer).toHaveValue("MY PRIVATE DRAFT");
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) {
  test(`full option text is readable without hover and does not send ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const text = locale === "ru" ? "Я внимательно осматриваю печать на конверте, не открывая его и не забирая у Миры. " : "I carefully examine the envelope’s seal without opening it or taking it from Mira. ";
    const longOptions = options.map(option => ({ ...option, text: text.repeat(6) + '\n<img src=x onerror=alert(1)>' }));
    const longHistory = history.replace(payload.replaceAll("<", "&lt;"), `<deeprole_choices>${JSON.stringify({ version: 1, options: longOptions })}</deeprole_choices>`.replaceAll("<", "&lt;"));
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), longHistory);
    const composer = page.getByRole("textbox", { name: "Message", exact: true });
    await composer.fill("MY PRIVATE DRAFT");
    const card = page.locator("[data-deeprole-choices-host]");
    const toggle = card.getByRole("button", { name: locale === "ru" ? "Текст целиком" : "Full text", exact: true });
    const preview = card.locator(".preview").first();
    expect(await preview.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.screenshot({ path: info.outputPath(`choices-before-${locale}-${width}.png`) });
    await toggle.focus(); await page.keyboard.press("Enter");
    const collapse = card.getByRole("button", { name: locale === "ru" ? "Свернуть текст" : "Collapse text", exact: true });
    await expect(collapse).toBeFocused(); await expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(await preview.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    await expect(preview).toHaveText(longOptions[0]!.text);
    await expect(card.locator("img")).toHaveCount(0);
    await page.evaluate(() => (window as any).choicesTest.sync()); await expect(collapse).toHaveAttribute("aria-expanded", "true");
    const bounds = await collapse.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(composer).toHaveValue("MY PRIVATE DRAFT");
    expect(await page.evaluate(() => [(window as any).sent, (window as any).requests])).toEqual([0, 0]);
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await card.screenshot({ path: info.outputPath(`choices-full-${locale}-${width}.png`) });
    await collapse.click(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(html => (window as any).choicesTest.navigate(html), history);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(preview).toHaveText(options[0]!.text);
  });
}

test("vertical arrows follow the two-column layout rather than moving sideways", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto("/tests/fixtures/scene-choices.html?locale=en");
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
  const buttons = page.locator("[data-deeprole-choices-host]").locator(".grid button");
  await buttons.first().focus(); await page.keyboard.press("ArrowDown"); await expect(buttons.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowUp"); await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("End"); await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Home"); await expect(buttons.first()).toBeFocused();
  await page.setViewportSize({ width: 320, height: 760 });
  await page.keyboard.press("ArrowDown"); await expect(buttons.nth(1)).toBeFocused();
  expect(await page.evaluate(() => (window as any).sent)).toBe(0);
});

test("full-text choices keep both large scene portraits and readable action paragraphs", async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/tests/fixtures/characters.html?locale=ru");
  const texts = [
    "«Спасибо, Мира. Я не открою конверт без твоего согласия». Кладу ключ на край стола, чтобы он оставался у нас на виду, и предлагаю сначала сравнить знак на ключе с печатью. Если нужно, могу подержать фонарь, пока она рассматривает письмо.",
    "Не касаясь письма, подношу фонарь к печати. «Можешь повернуть конверт к свету? Хочу понять, тот ли это знак». Отмечаю только то, что вижу сам: форму оттиска, цвет воска и надпись. Ключ пока оставляю в кармане.",
    "«Мне нужны факты, а не намёки. Откуда у тебя письмо и почему ты принесла его именно сюда?» Отступаю на шаг, чтобы не нависать над Мирой. Я готов выслушать ответ, но не стану брать на себя обещания, пока не пойму, что происходит.",
    "«Давай начнём с маленького обмена. Я покажу тебе ключ, а ты расскажешь, что знаешь о печати». Достаю ключ и держу его на открытой ладони. Не отдаю его и не забираю письмо: предлагаю договориться о следующем шаге вместе.",
  ];
  const labels = ["Помочь разобраться", "Изучить печать", "Потребовать ясности", "Обменяться подсказками"];
  const choices = ["positive", "neutral", "negative", "surprise"].map((kind, index) => ({ kind, label: labels[index], text: texts[index] }));
  await page.evaluate(payload => { document.querySelector("#reply")!.textContent = "Мира держит запечатанный конверт. За окном темнеет.\n" + payload; (window as any).syncPortraits(); }, `<deeprole_choices>${JSON.stringify({ version: 1, options: choices })}</deeprole_choices>`);
  const card = page.locator("[data-deeprole-choices-host]");
  await card.getByRole("button", { name: "Текст целиком", exact: true }).click();
  await expect(card.locator(".preview").first()).toHaveText(texts[0]!);
  await expect(card.locator(".dr-cast-portrait")).toHaveCount(2);
  for (const image of await card.locator(".dr-cast-portrait img").all()) {
    const bounds = await image.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(180); expect(bounds!.width / bounds!.height).toBeCloseTo(.75, 2);
  }
  expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await card.screenshot({ path: info.outputPath("scene-full-text.png") });
});
