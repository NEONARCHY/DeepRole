import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const options = ["positive", "neutral", "negative", "surprise"].map((kind, index) => ({ kind, label: ["Thank Mira", "Ask about the letter", "Refuse to take it", "Offer a trade"][index], text: `I choose ${kind}.` }));
const payload = `<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
const history = `<article data-message-id="scene" data-role="assistant"><div class="ds-markdown"><p>Mira holds a sealed envelope.</p><pre>${payload.replaceAll("<", "&lt;")}</pre></div></article>`;

for (const userScrollsAway of [false, true]) test(`streamed choices keep the bottom in view unless the reader scrolls up ${userScrollsAway}`, async ({ page }) => {
  await page.setViewportSize({ width: 900, height: userScrollsAway ? 500 : 380 });
  await page.goto("/tests/fixtures/scene-choices.html?locale=ru");
  await page.evaluate(() => { document.body.style.paddingBottom = "300px"; });
  const story = Array.from({ length: 30 }, (_, i) => `<p>Сцена продолжается ${i}.</p>`).join("");
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), `<article data-message-id="live" data-role="assistant"><div class="ds-markdown">${story}</div></article>`);
  await page.evaluate(() => (window as any).choicesTest.update({ generating: true }));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.locator(".ds-markdown").evaluate(body => { body.append(' <deeprole_choices>{"version":1,'); (window as any).choicesTest.sync(); });
  const loader = page.locator("[data-deeprole-choices-loading]");
  await expect(loader).toHaveCount(1);
  await expect.poll(() => loader.evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(userScrollsAway ? 450 : 330);
  if (userScrollsAway) {
    await page.mouse.wheel(0, -320);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - 200));
  }
  const before = await page.evaluate(() => window.scrollY);
  await page.locator(".ds-markdown").evaluate((body, remainder) => { body.append(remainder); (window as any).choicesTest.sync(); }, payload.slice('<deeprole_choices>{"version":1,'.length));
  await page.evaluate(() => (window as any).choicesTest.update({ generating: false }));
  await expect(page.locator("[data-deeprole-choices-host]")).toHaveCount(1);
  const after = await page.evaluate(() => window.scrollY);
  if (userScrollsAway) expect(after).toBeLessThanOrEqual(before + 2);
  else expect(await page.locator("[data-deeprole-choices-host]").evaluate(node => node.getBoundingClientRect().top)).toBeLessThanOrEqual(60);
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) {
  test(`streaming choices hide transport and show one loader ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const request = page.getByRole("button", { name: locale === "ru" ? "Предложить варианты" : "Suggest options", exact: true });
    const loader = page.locator("[data-deeprole-choices-loading]");
    await page.evaluate(() => (window as any).choicesTest.update({ generating: true }));
    // Story generation alone must not announce that options are being prepared.
    for (const scene of ["Mira holds the key.", "Mira holds the key. She looks towards the gate."]) {
      await page.evaluate(scene => (window as any).choicesTest.setHistory(`<article data-role="assistant" data-message-id="live"><div class="ds-think-content">Planning &lt;deeprole_choices&gt;</div><div class="ds-markdown"><p>${scene}</p></div></article>`), scene);
      await expect(loader).toHaveCount(0);
      await expect(request).toHaveCount(0);
      await expect(page.locator(".ds-markdown")).toHaveText(scene, { useInnerText: true });
    }
    await page.screenshot({ path: info.outputPath("story-no-preloader.png") });
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), '<article data-role="assistant" data-message-id="live"><div class="ds-markdown"><p>Mira holds the key.</p><p>&lt;deeprole_characters&gt;{"request":"</p></div></article>');
    await expect(page.locator(".ds-markdown")).toHaveText("Mira holds the key.", { useInnerText: true });
    await expect(loader).toHaveCount(1);
    await expect(loader.getByRole("status")).toHaveText(locale === "ru" ? "Варианты ответов готовятся…" : "Preparing reply options…");
    await page.screenshot({ path: info.outputPath("characters-preloader.png") });
    for (const size of [24, 50, 140, payload.length - 8]) {
      const partial = payload.slice(0, size);
      await page.evaluate(html => (window as any).choicesTest.setHistory(html), `<article data-role="assistant" data-message-id="live"><div class="ds-markdown"><p>Mira holds the key.</p><p>${partial.replaceAll("<", "&lt;")}</p></div></article>`);
      await expect(page.locator(".ds-markdown")).toHaveText("Mira holds the key.", { useInnerText: true });
      await expect(loader).toHaveCount(1);
      await expect(request).toHaveCount(0);
      for (let i = 0; i < 3; i++) await page.evaluate(() => (window as any).choicesTest.sync());
      await expect(loader).toHaveCount(1);
    }
    await expect(loader.getByRole("status")).toHaveText(locale === "ru" ? "Варианты ответов готовятся…" : "Preparing reply options…");
    await page.screenshot({ path: info.outputPath("choices-preloader.png") });
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
    await expect(page.locator(".ds-markdown")).not.toContainText("deeprole_choices", { useInnerText: true });
    await page.evaluate(() => (window as any).choicesTest.update({ generating: false }));
    await expect(loader).toHaveCount(0);
    await expect(page.locator("[data-deeprole-choices-host] .grid button")).toHaveCount(4);
    await expect(request).toHaveCount(0);
    // Abort/truncate: no technical text or permanent spinner, only a final retry.
    await page.evaluate(() => (window as any).choicesTest.update({ generating: true }));
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), `<article data-role="assistant" data-message-id="broken"><div class="ds-markdown">Mira waits. ${payload.slice(0, 70).replaceAll("<", "&lt;")}</div></article>`);
    await page.evaluate(() => (window as any).choicesTest.update({ generating: false }));
    await expect(request).toBeVisible();
    await expect(loader).toHaveCount(0);
    await expect(page.locator(".ds-markdown")).not.toContainText("deeprole_choices", { useInnerText: true });
    await page.screenshot({ path: info.outputPath("choices-retry.png") });
    // A manual request also stays silent until its actual response JSON starts.
    await request.click(); await expect(request).toHaveCount(0); await expect(loader).toHaveCount(0);
    await page.evaluate(() => (window as any).choicesTest.update({ generating: true }));
    await page.evaluate(() => (window as any).choicesTest.setHistory('<article data-role="assistant" data-message-id="manual"><div class="ds-markdown">Preparing the next move.</div></article>'));
    await expect(loader).toHaveCount(0); await expect(request).toHaveCount(0);
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), `<article data-role="assistant" data-message-id="manual"><div class="ds-markdown">${payload.slice(0, 70).replaceAll("<", "&lt;")}</div></article>`);
    await expect(loader).toHaveCount(1); await expect(page.locator(".ds-markdown")).not.toContainText("deeprole_choices", { useInnerText: true });
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
    await page.evaluate(() => (window as any).choicesTest.update({ generating: false, busy: false }));
    await expect(loader).toHaveCount(0); await expect(page.locator("[data-deeprole-choices-host] .grid button")).toHaveCount(4);
    expect(await page.evaluate(() => (window as any).sent)).toBe(0);
  });
}

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) {
  test(`pastel choice types stay distinct at rest, hover and selection ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
    const labels = locale === "ru" ? ["Поблагодарить Миру", "Спросить о письме", "Отказаться от конверта", "Предложить обмен"] : options.map(option => option.label);
    const scene = locale === "ru" ? "Мира держит запечатанный конверт. Что вы сделаете?" : "Mira holds a sealed envelope. What will you do?";
    const coloredHistory = `<article data-message-id="scene" data-role="assistant"><div class="ds-markdown"><p>${scene}</p><pre>${`<deeprole_choices>${JSON.stringify({version: 1, options: options.map((option, i) => ({...option, label: labels[i], text: locale === "ru" ? ["«Спасибо, Мира. Давай вместе разберёмся, что это за письмо».", "«Откуда у тебя этот конверт?» Не касаюсь печати и жду ответа.", "«Я не буду его открывать, пока не узнаю, откуда он».", "«Покажи печать — я покажу ключ. Попробуем найти связь?»"][i] : option.text}))})}</deeprole_choices>`.replaceAll("<", "&lt;")}</pre></div></article>`;
    await page.evaluate(html => (window as any).choicesTest.setHistory(html), coloredHistory);
    const card = page.locator("[data-deeprole-choices-host]"); const buttons = card.locator(".grid button");
    const colors = async () => buttons.evaluateAll(elements => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      const rgb = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const luminance = (color: number[]) => color.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i]!, 0);
      const contrast = (a: string, b: string) => { const first = luminance(rgb(a)); const second = luminance(rgb(b)); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); };
      return elements.map(button => {
        const style = getComputedStyle(button); const background = style.backgroundColor;
        const numberStyle = getComputedStyle(button.querySelector(".number")!);
        return { kind: (button as HTMLElement).dataset.choiceKind, background: rgb(background).join(","), pressed: button.getAttribute("aria-pressed"), contrasts: [contrast(style.color, background), contrast(getComputedStyle(button.querySelector(".preview")!).color, background), contrast(getComputedStyle(button.querySelector("small")!).color, background), contrast(numberStyle.color, button.getAttribute("aria-pressed") === "true" ? numberStyle.backgroundColor : background)], edgeContrast: contrast(style.borderInlineStartColor, background) };
      });
    });
    const assertReadable = (samples: Awaited<ReturnType<typeof colors>>) => {
      expect(new Set(samples.map(sample => sample.background)).size).toBe(4);
      for (const sample of samples) { for (const value of sample.contrasts) expect(value, `${sample.kind} text contrast`).toBeGreaterThanOrEqual(4.5); expect(sample.edgeContrast).toBeGreaterThanOrEqual(3); }
    };
    const rest = await colors(); assertReadable(rest); expect(rest.every(sample => sample.pressed === "false")).toBe(true);
    await card.screenshot({ path: info.outputPath(`pastel-rest-${locale}-${width}.png`) });
    for (let i = 0; i < 4; i++) {
      await buttons.nth(i).hover(); const hovered = await colors(); assertReadable(hovered); expect(hovered[i]!.background).not.toBe(rest[i]!.background);
      await page.getByRole("textbox", { name: "Message", exact: true }).fill(""); await buttons.nth(i).click();
      const selected = await colors(); assertReadable(selected); expect(selected.filter(sample => sample.pressed === "true")).toHaveLength(1);
      expect(selected[i]!.pressed).toBe("true"); expect(selected[i]!.background).not.toBe(rest[i]!.background);
      await expect(buttons.nth(i)).toHaveAttribute("data-choice-kind", options[i]!.kind);
      expect(await buttons.nth(i).locator(".number").evaluate(number => getComputedStyle(number, "::before").content)).toContain("✓");
    }
    expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await card.screenshot({ path: info.outputPath(`pastel-selected-${locale}-${width}.png`) });
    await buttons.first().focus(); await page.keyboard.press("ArrowRight");
    await expect(buttons.nth(1)).toBeFocused(); expect(await buttons.nth(1).evaluate(button => getComputedStyle(button).outlineStyle)).toBe("solid");
    await page.reload(); await expect(buttons).toHaveCount(4); assertReadable(await colors());
    expect(await buttons.evaluateAll(elements => elements.every(button => button.getAttribute("aria-pressed") === "false"))).toBe(true);
    expect(await page.evaluate(() => [(window as any).requests, (window as any).sent])).toEqual([0, 0]);
  });
}

for (const locale of ["ru", "en"] as const) test(`tall live DeepSeek virtual rows keep choices stable and reject a newer user turn ${locale}`, async ({ page }) => {
  await page.goto(`/tests/fixtures/scene-choices.html?locale=${locale}`);
  const modern = `<div data-virtual-list-item-key="1"><div class="ds-message"><div class="ds-collapsible-text">Open the archive.</div></div></div><div data-virtual-list-item-key="2"><div class="ds-message" id="modern"><div class="ds-markdown ds-assistant-message-main-content"><p>${'Mira holds the key. '.repeat(150)}</p><p><span>${payload.replaceAll('<', '&lt;')}</span><br><span>&lt;deeprole_characters&gt;{"request":"test"}&lt;/deeprole_characters&gt;</span></p></div></div></div>`;
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), modern);
  const card = page.locator('[data-deeprole-choices-host]');
  await expect(card.locator('.grid button')).toHaveCount(4);
  expect(await card.evaluate(node => node.previousElementSibling?.id)).toBe('modern');
  const signature = await card.getAttribute('data-deeprole-choices-signature');
  for (let i = 0; i < 6; i++) await page.evaluate(() => (window as any).choicesTest.sync());
  await expect(card).toHaveAttribute('data-deeprole-choices-signature', signature!);
  await expect(page.locator('.ds-markdown')).not.toContainText('<deeprole_choices>', { useInnerText: true });
  await page.reload(); await expect(card.locator('.grid button')).toHaveCount(4);
  await page.evaluate(() => {
    const user=document.createElement('div'); user.className='ds-message'; user.dataset.deeproleMemoryRequest='memory'; user.style.display='none'; user.textContent='[DeepRole Service]\n[Request ID: memory]\nAnalyze';
    const reply=document.createElement('div'); reply.className='ds-message'; reply.dataset.deeproleMemoryPresentation='memory'; reply.dataset.deeproleServiceReply='true'; reply.textContent='Memory proposals ready.';
    document.querySelector('#conversation')!.append(user,reply); (window as any).choicesTest.sync();
  });
  await expect(card.locator('.grid button')).toHaveCount(4);
  await page.evaluate(() => { const user = document.createElement('div'); user.className = 'ds-message'; user.innerHTML = '<div class="ds-collapsible-text">Wait for Leon.</div>'; document.querySelector('#conversation')!.append(user); (window as any).choicesTest.sync(); });
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-deeprole-choices-recovery]')).toHaveCount(0);
});

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
    await page.evaluate(() => (window as any).choicesTest.update({ busy: false }));
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
  await expect(page.locator("[data-deeprole-portrait-layer] .dr-cast-portrait")).toHaveCount(2);
  for (const image of await page.locator("[data-deeprole-portrait-layer] .dr-cast-portrait img").all()) {
    const bounds = await image.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(180); expect(bounds!.width / bounds!.height).toBeCloseTo(.75, 2);
  }
  expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await card.screenshot({ path: info.outputPath("scene-full-text.png") });
});
