import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [360, 1500]) test(`pinned options escape chat clipping and stay above the composer ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
  await page.evaluate(() => {
    const options = ["positive", "neutral", "negative", "surprise"].map((kind, i) => ({ kind, label: `Move ${i}`, text: `I choose move ${i}.` }));
    (window as any).choicesTest.setHistory(`<article data-message-id="current" data-role="assistant"><div class="ds-markdown">Mira holds a letter.&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`);
    const form = document.querySelector("form")!;
    document.body.append(form);
    Object.assign(form.style, { position: "fixed", bottom: "18px", left: "20px", width: "calc(100% - 40px)", maxWidth: "740px", zIndex: "9999", background: "#303030", borderRadius: "18px", padding: "10px", boxSizing: "border-box" });
    const main = document.querySelector("main")!;
    Object.assign(main.style, { height: "400px", overflow: "auto", transform: "translateZ(0)", contain: "paint", margin: "70px auto" });
    const spacer = document.createElement("div"); spacer.style.height = "1800px"; main.append(spacer);
  });
  const host = page.locator("[data-deeprole-choices-host]");
  await host.getByRole("button", { name: locale === "ru" ? "Закрепить варианты на экране" : "Pin options on screen", exact: true }).click();
  await expect.poll(() => host.evaluate(node => node.parentElement === document.body)).toBe(true);
  const tools = host.locator("[data-choice-pin]"); await expect(tools).toHaveCount(2);
  await host.getByRole("button", { name: locale === "ru" ? "Закрепить оба портрета" : "Pin both portraits", exact: true }).click();
  const assertFits = async () => {
    const result = await host.evaluate(node => {
      const card = node.shadowRoot!.querySelector("section")!.getBoundingClientRect();
      const composer = document.querySelector("form")!.getBoundingClientRect();
      return { top: card.top, bottom: card.bottom, composer: composer.top, center: card.left + card.width / 2, composerCenter: composer.left + composer.width / 2, cardWidth: card.width, composerWidth: composer.width, left: card.left, right: card.right, width: innerWidth };
    });
    expect(result.top).toBeGreaterThanOrEqual(59);
    expect(result.bottom).toBeLessThanOrEqual(result.composer - 10);
    expect(result.composer - result.bottom).toBeCloseTo(12, 0);
    expect(result.center).toBeCloseTo(result.composerCenter, 0);
    expect(result.cardWidth).toBeCloseTo(result.composerWidth, 0);
    expect(result.left).toBeGreaterThanOrEqual(0); expect(result.right).toBeLessThanOrEqual(result.width);
  };
  await assertFits();
  const before = await host.boundingBox();
  await page.evaluate(() => { document.querySelector("main")!.scrollTop = 1400; });
  await expect.poll(async () => (await host.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await page.evaluate(() => { (document.querySelector("textarea") as HTMLElement).style.height = "200px"; (window as any).choicesTest.sync(); });
  await expect.poll(async () => { try { await assertFits(); return true; } catch { return false; } }).toBe(true);
  await host.getByRole("button", { name: /Move 0/ }).click();
  await expect(page.getByRole("textbox")).toHaveValue("I choose move 0.");
  await page.screenshot({ path: info.outputPath("pinned-above-composer.png") });
  await host.getByRole("button", { name: locale === "ru" ? "Открепить варианты" : "Unpin options", exact: true }).click();
  await expect.poll(() => host.evaluate(node => node.previousElementSibling?.getAttribute("data-message-id"))).toBe("current");
  await page.evaluate(() => (window as any).choicesTest.update({ pinSceneChoices: true }));
  await page.evaluate(() => (window as any).choicesTest.navigate('<article data-role="assistant"><div class="ds-markdown">A new scene.</div></article>'));
  await expect(host).toHaveCount(0); await expect(page.locator("[data-deeprole-choices-anchor]")).toHaveCount(0);
});

test("adaptive pinned portraits and choices clear a growing native composer", async ({ page }, info) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto("/tests/fixtures/adaptive-scene.html?pinned");
  await page.evaluate(() => {
    const form = document.createElement("form");
    Object.assign(form.style, { position: "fixed", bottom: "20px", left: "550px", width: "650px", background: "#303030", borderRadius: "18px", padding: "12px" });
    form.append(document.querySelector("textarea")!); document.body.append(form);
  });
  const assertClear = async () => {
    const geometry = await page.evaluate(() => {
      const composer = document.querySelector("form")!.getBoundingClientRect();
      const host = document.querySelector("[data-deeprole-choices-host]")!;
      const card = host.shadowRoot!.querySelector("section")!.getBoundingClientRect();
      const widgets = document.querySelector("[data-deeprole-portrait-layer]")!.shadowRoot!.querySelectorAll(".dr-cast-widget");
      return { top: composer.top, center: card.left + card.width / 2, composerCenter: composer.left + composer.width / 2, gap: composer.top - card.bottom, bottoms: [host.shadowRoot!.querySelector("section")!, ...widgets].map(node => node.getBoundingClientRect().bottom) };
    });
    for (const bottom of geometry.bottoms) expect(bottom).toBeLessThanOrEqual(geometry.top - 10);
    expect(geometry.gap).toBeCloseTo(12, 0);
    expect(geometry.center).toBeCloseTo(geometry.composerCenter, 0);
  };
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  await page.screenshot({ path: info.outputPath("pinned-cast-native-composer-wide.png") });
  const saved = await page.evaluate(() => (window as any).getSavedLayouts());
  await page.evaluate(() => { (document.querySelector("form") as HTMLElement).style.left = "620px"; });
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const card = document.querySelector("[data-deeprole-choices-host]")!.shadowRoot!.querySelector("section")!.getBoundingClientRect();
    const hero = document.querySelector("[data-deeprole-portrait-layer]")!.shadowRoot!.querySelector(".dr-cast-widget")!.getBoundingClientRect();
    return card.left - hero.right;
  })).toBeCloseTo(24, 0);
  await page.evaluate(() => { (document.querySelector("textarea") as HTMLElement).style.height = "230px"; });
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  expect(await page.evaluate(() => (window as any).getSavedLayouts())).toEqual(saved);
  // Editors must remain above the scene overlay, including the widget's stacking context.
  await page.locator('.dr-characters button').filter({ hasText: "Noah" }).click();
  const dialog = page.locator(".dr-character-dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.locator('input:not([type="checkbox"])').first();
  await input.click(); await expect(input).toBeFocused();
});

for (const locale of ["ru", "en"]) test(`pin follows the native panel through sidebar movement and SPA replacement ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 850 });
  await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
  await page.evaluate(() => {
    const options = ["positive", "neutral", "negative", "surprise"].map((kind, i) => ({ kind, label: `Move ${i}`, text: `I choose move ${i}.` }));
    (window as any).choicesTest.setHistory(`<article data-message-id="current" data-role="assistant"><div class="ds-markdown">Mira waits.&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`);
    const style = document.createElement("style");
    style.textContent = ".native-wrapper{position:fixed;bottom:20px;left:280px;width:680px;transition:left .2s linear}.native-wrapper.shifted{left:460px}.native-panel{box-sizing:border-box;background:#303030;border-radius:20px;padding:12px}.native-panel textarea{height:90px}.native-controls{height:48px;display:flex;justify-content:flex-end;align-items:center}.native-controls button{padding:8px}.native-wrapper section{margin:0}";
    document.head.append(style);
    const wrapper = document.createElement("div"); wrapper.className = "native-wrapper";
    const panel = document.createElement("section"); panel.className = "native-panel";
    panel.append(document.querySelector("textarea")!);
    const controls = document.createElement("div"); controls.className = "native-controls";
    const send = document.createElement("button"); send.textContent = "Send"; controls.append(send); panel.append(controls);
    // The sticky/fixed owner can be further up than the rounded panel itself.
    let container: HTMLElement = panel;
    for (let i = 0; i < 6; i++) { const shell = document.createElement("div"); shell.append(container); container = shell; }
    wrapper.append(container); document.body.append(wrapper);
    const distractor = document.createElement("div"); distractor.className = "dr-root";
    distractor.innerHTML = '<textarea style="position:fixed;bottom:0;left:0;width:400px;height:100px" aria-label="Extension editor"></textarea>';
    document.body.append(distractor);
  });
  const host = page.locator("[data-deeprole-choices-host]");
  await host.getByRole("button", { name: locale === "ru" ? "Закрепить варианты на экране" : "Pin options on screen", exact: true }).click();
  const aligned = async () => {
    const geometry = await page.evaluate(() => {
      const card = document.querySelector("[data-deeprole-choices-host]")!.shadowRoot!.querySelector("section")!.getBoundingClientRect();
      const panel = document.querySelector(".native-panel")!.getBoundingClientRect();
      return { center: card.left + card.width / 2, panelCenter: panel.left + panel.width / 2, gap: panel.top - card.bottom, top: card.top, right: card.right, width: innerWidth };
    });
    expect(geometry.center).toBeCloseTo(geometry.panelCenter, 0);
    expect(geometry.gap).toBeCloseTo(12, 0);
    expect(geometry.top).toBeGreaterThanOrEqual(59);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  };
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  // No manual DeepRole sync: class-only movement, temporary disable and autosizing.
  await page.evaluate(() => new Promise<void>(resolve => {
    const wrapper = document.querySelector(".native-wrapper")!;
    wrapper.addEventListener("transitionend", () => resolve(), { once: true });
    wrapper.classList.add("shifted");
  }));
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  await page.evaluate(() => { const input = document.querySelector<HTMLTextAreaElement>(".native-panel textarea")!; input.disabled = true; input.style.height = "210px"; });
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  // A SPA replaces the whole input subtree; contenteditable must also work.
  await page.evaluate(() => {
    const old = document.querySelector(".native-wrapper")!, replacement = old.cloneNode(true) as HTMLElement;
    replacement.classList.remove("shifted");
    const input = document.createElement("div"); input.contentEditable = "true"; input.setAttribute("role", "textbox"); input.setAttribute("aria-label", "Native message");
    Object.assign(input.style, { minHeight: "110px", width: "100%", borderRadius: "12px" });
    replacement.querySelector("textarea")!.replaceWith(input); old.replaceWith(replacement);
  });
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  await page.evaluate(() => { (document.querySelector(".native-panel [contenteditable]") as HTMLElement).style.height = "190px"; });
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  await page.setViewportSize({ width: 640, height: 700 });
  await page.evaluate(() => { Object.assign((document.querySelector(".native-wrapper") as HTMLElement).style, { transition: "none", left: "20px", width: "calc(100% - 40px)" }); document.querySelector(".dr-root")!.remove(); });
  await expect.poll(async () => { try { await aligned(); return true; } catch { return false; } }).toBe(true);
  await page.screenshot({ path: info.outputPath("pinned-native-panel-narrow.png") });
});
