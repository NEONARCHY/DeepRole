import { expect, test, type Page } from "@playwright/test";

const options = ["positive", "neutral", "negative", "surprise"].map((kind, i) => ({ kind, label: `Move ${i}`, text: `I choose move ${i}.` }));
const history = `<article data-message-id="current" data-role="assistant"><div class="ds-markdown"><p>${"Mira waits by the door. ".repeat(350)}</p>&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`;

async function setup(page: Page, locale: string, width: number, adaptive: boolean) {
  await page.setViewportSize({ width, height: 760 });
  await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
  await page.evaluate(({ adaptive, width }) => {
    const form = document.querySelector("form")!; document.body.append(form);
    Object.assign(form.style, { position: "fixed", bottom: "24px", left: width > 900 ? "119px" : "20px", width: width > 900 ? `${Math.min(776, width - 160)}px` : "calc(100% - 40px)", zIndex: "9999", background: "#303030", borderRadius: "20px", padding: "12px", boxSizing: "border-box" });
    document.querySelector("textarea")!.style.height = "70px";
    const scroll = document.createElement("div"); scroll.id = "native-scroll";
    Object.assign(scroll.style, { position: "fixed", inset: "54px 0 0", overflow: "auto", overflowX: "hidden", transform: "translateZ(0)", contain: "paint" });
    const conversation = document.querySelector("#conversation")!;
    Object.assign((conversation as HTMLElement).style, { width: `${Math.min(720, width - 40)}px`, marginLeft: width > 900 ? "300px" : "20px" });
    scroll.append(conversation);
    const footer = document.createElement("div"); footer.style.height = "34px"; scroll.append(footer);
    document.body.append(scroll);
    if (adaptive && width > 900) {
      const deck = document.createElement("div"); deck.className = "dr-widget-deck"; deck.dataset.minimumLeft = "8";
      const tile = document.createElement("div"); tile.className = "dr-widget-tile"; tile.textContent = "DeepRole panels";
      Object.assign(tile.style, { position: "fixed", left: "40px", top: "70px", width: "224px", height: "450px", background: "#212930", borderRadius: "12px" });
      deck.append(tile); document.body.append(deck);
    }
    (window as any).choicesTest.update({ adaptiveLayout: adaptive });
  }, { adaptive, width });
  await page.evaluate(html => (window as any).choicesTest.setHistory(html), history);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!;
    const card = host.shadowRoot!.querySelector("section")!.getBoundingClientRect(), composer = document.querySelector("form")!.getBoundingClientRect();
    return { gap: composer.top - card.bottom, center: card.left + card.width / 2, composerCenter: composer.left + composer.width / 2, top: card.top, left: card.left, right: card.right, width: innerWidth, fixed: getComputedStyle(host).position === "fixed" };
  });
}

for (const locale of ["ru", "en"]) for (const width of [360, 1057]) for (const adaptive of [false, true]) test(`inline options stay above the input but scroll with the story ${locale} ${width} adaptive=${adaptive}`, async ({ page }, info) => {
  await setup(page, locale, width, adaptive);
  const card = page.locator("[data-deeprole-choices-host]");
  const scrollToBottom = () => page.evaluate(() => { const scroll = document.querySelector("#native-scroll")!; scroll.scrollTop = scroll.scrollHeight; });
  const assertClear = async () => {
    const box = await geometry(page);
    expect(box.fixed).toBe(false);
    expect(box.gap).toBeGreaterThanOrEqual(11);
    expect(box.gap).toBeLessThanOrEqual(14);
    expect(box.center).toBeCloseTo(box.composerCenter, 0);
    expect(box.top).toBeGreaterThanOrEqual(54);
    expect(box.left).toBeGreaterThanOrEqual(8); expect(box.right).toBeLessThanOrEqual(box.width - 8);
    if (adaptive && width > 900) expect(box.left).toBeGreaterThanOrEqual(280);
  };
  await scrollToBottom();
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  await page.screenshot({ path: info.outputPath("inline-above-composer.png") });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("MY PRIVATE DRAFT");
  await page.locator("textarea").evaluate(node => { node.style.height = "160px"; });
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  const before = await card.boundingBox();
  await page.evaluate(() => { document.querySelector("#native-scroll")!.scrollTop -= 700; });
  await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(before!.y + 400);
  const readingTop = await page.evaluate(() => document.querySelector("#native-scroll")!.scrollTop);
  await page.locator("textarea").evaluate(node => { node.style.height = "190px"; });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.querySelector("#native-scroll")!.scrollTop)).toBeCloseTo(readingTop, 0);
  await scrollToBottom();
  await card.getByRole("button", { name: locale === "ru" ? "Закрепить варианты на экране" : "Pin options on screen", exact: true }).click();
  await expect(card).toHaveAttribute("data-deeprole-choices-pinned", "true");
  await page.evaluate(() => { document.querySelector("#native-scroll")!.scrollTop -= 400; });
  const beforeUnpin = await page.evaluate(() => document.querySelector("#native-scroll")!.scrollTop);
  await card.getByRole("button", { name: locale === "ru" ? "Открепить варианты" : "Unpin options", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector("#native-scroll")!.scrollTop)).toBeCloseTo(beforeUnpin, 0);
  // Unpinning preserves the reading position; returning to the bottom is explicit.
  await scrollToBottom();
  await expect.poll(async () => { try { await assertClear(); return true; } catch { return false; } }).toBe(true);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY PRIVATE DRAFT");
  await page.evaluate(() => (window as any).choicesTest.navigate('<article data-role="assistant"><div class="ds-markdown">A new scene.</div></article>'));
  await expect(page.locator("[data-deeprole-choices-spacer]")).toHaveCount(0);
});

test("a short chat becomes scrollable safely when the input grows", async ({ page }) => {
  await setup(page, "en", 360, true);
  await page.evaluate(html => (window as any).choicesTest.setHistory(html.replace(/<p>.*?<\/p>/, "<p>Mira waits.</p>")), history);
  await page.evaluate(() => { const scroll = document.querySelector("#native-scroll")!; scroll.scrollTop = scroll.scrollHeight; });
  await expect.poll(() => geometry(page).then(box => box.gap)).toBeGreaterThanOrEqual(11);
  await page.locator("textarea").evaluate(node => { node.style.height = "190px"; });
  await expect.poll(() => geometry(page).then(box => box.gap)).toBeGreaterThanOrEqual(11);
  await page.evaluate(() => { const scroll = document.querySelector("#native-scroll")!; scroll.scrollTop = scroll.scrollHeight; });
  await expect.poll(() => geometry(page).then(box => box.gap)).toBeGreaterThanOrEqual(11);
  const heights = await page.locator("[data-deeprole-choices-spacer]").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  await page.waitForTimeout(150);
  expect(await page.locator("[data-deeprole-choices-spacer]").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))).toEqual(heights);
});
