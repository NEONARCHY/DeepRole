import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { storyUxText as ux } from "../../src/core/story-ux-i18n";
import { storyUpdateText as facts } from "../../src/core/story-update-i18n";
import { characterDiscoveryText as people } from "../../src/core/character-discovery-i18n";
import { storyAutomationText } from "../../src/core/story-automation-i18n";

for (const locale of ["ru", "en"] as const) for (const width of [320, 400, 900]) {
  test(`memory layout keeps controls aligned ${locale}/${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/sidepanel.html?play=active&review&locale=${locale}`);
    await page.locator('[data-dr-guide="nav-story"]').click();
    const nav = page.locator(".dr-workspace-nav");
    const buttons = await nav.locator("button").all();
    const heights = await Promise.all(buttons.map(button => button.evaluate(el => el.getBoundingClientRect().height)));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    await buttons[3]!.hover();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await buttons[3]!.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    for (const summary of await page.locator(".dr-story-advanced > summary").all()) await summary.click();
    for (const card of await page.locator(".dr-story-advanced > .settings-card").all()) {
      expect(await card.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow })))
        .toEqual({ background: "rgba(0, 0, 0, 0)", shadow: "none" });
    }
    await expect(page.locator(".dr-memory-batch h2")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`memory-layout-${locale}-${width}.png`), fullPage: true });
  });
}

for (const locale of ["ru", "en"] as const) for (const colorScheme of ["dark", "light"] as const) {
  test(`review queue leads the story overview ${locale}/${colorScheme}`, async ({ page }, info) => {
    const t = storyAutomationText(locale);
    await page.setViewportSize({ width: 320, height: 460 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/tests/fixtures/sidepanel.html?play=active&review&locale=${locale}`);
    await page.addStyleTag({ content: "html{font-size:125%}" });
    await page.locator(".dr-play-memory").press("Enter");
    const overview = page.locator('[data-dr-guide="story-overview"]');
    await expect(overview).toHaveAttribute("aria-current", "page");
    const inbox = page.getByRole("region", { name: t.inbox, exact: true });
    const settings = page.locator(".dr-story-automation-settings");
    const mode = settings.getByRole("combobox", { name: t.mode, exact: true });
    const proposal = inbox.getByRole("article");
    await expect(proposal).toBeVisible();
    await expect(mode).toHaveCount(0);
    expect(await inbox.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector(".dr-story-automation-settings")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(await page.evaluate(() => (window as any).playReview.requests)).not.toContain("DR_AUTOMATION_RESOLVE");
    await page.evaluate(() => scrollTo(0, 0));
    const queueHeading = inbox.locator("h2");
    await expect(queueHeading).toBeInViewport({ ratio: 1 });
    const position = await queueHeading.evaluate(el => {
      const box = el.getBoundingClientRect();
      const covering = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { visible: el.contains(covering), top: box.top, bottom: box.bottom, covering: covering?.outerHTML.slice(0, 180) };
    });
    await page.screenshot({ path: info.outputPath("review-overview.png") });
    expect(position.visible, JSON.stringify(position)).toBe(true);
    const quote = proposal.locator("summary").filter({ hasText: t.source });
    await quote.press("Enter");
    await expect(proposal.locator(".dr-story-review-source")).toBeVisible();
    expect((await quote.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await proposal.getByRole("button", { name: t.accept, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await inbox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("review-queue.png") });

    await page.getByRole("button", { name: ux(locale, "memory"), exact: true }).click();
    await page.locator('[data-dr-guide="nav-overview"]').click();
    await page.locator(".dr-play-memory").press("Enter");
    await expect(overview).toHaveAttribute("aria-current", "page");
    await expect(proposal.locator(".dr-story-review-source")).toBeVisible();
    await settings.locator("summary").press("Enter");
    await expect(mode).toHaveValue("automatic");
    expect((await mode.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await mode.selectOption("off");
    await expect(settings.locator("summary")).toContainText(t.off);
    await settings.locator("summary").press("Enter");
    await expect(settings.getByText(t.pausedSummary, { exact: true })).toBeVisible();
    await proposal.getByRole("button", { name: t.decline, exact: true }).click();
    await expect(inbox.getByText(t.empty, { exact: true })).toBeVisible();
    await expect(page.locator(".dr-story-advanced > summary").filter({ hasText: ux(locale, "extraCheck") })).toBeVisible();
    expect(await page.evaluate(() => (window as any).playReview.requests.filter((type: string) => type === "DR_AUTOMATION_RESOLVE" || type === "DR_RUN_SERVICE")))
      .toEqual(["DR_AUTOMATION_RESOLVE"]);
  });
}

test("the current queue is not presented as belonging to an older chat", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 460 });
  await page.goto("/tests/fixtures/sidepanel.html?play=elsewhere&review");
  await page.locator('[data-dr-guide="nav-story"]').click();
  await expect(page.getByText(ux("ru", "oldChat"), { exact: true })).toBeVisible();
  await expect(page.locator(".dr-story-automation-inbox")).toHaveCount(0);
  await expect(page.locator('[data-dr-guide="story-overview"] .dr-story-inbox-count')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).playReview.requests)).not.toContain("DR_AUTOMATION_READ");
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`story hub ${locale} ${width}: actual App navigation, drafts and keyboard`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/tests/fixtures/sidepanel.html?world&story&locale=${locale}`);
  const nav = page.locator(".bottom-nav").getByRole("button", { name: ux(locale, "nav"), exact: true });
  await expect(nav).toBeVisible();
  await nav.focus(); await page.keyboard.press("Enter");
  await expect(nav).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(ux(locale, "active"), { exact: true })).toBeVisible();
  await page.getByRole("button", { name: ux(locale, "memory"), exact: true }).click();
  const field = page.getByRole("textbox", { name: facts(locale, "text"), exact: true });
  await page.getByRole("button", { name: facts(locale, "editText"), exact: true }).click();
  await field.fill("My manually reviewed fact");
  await page.getByRole("button", { name: ux(locale, "timeline"), exact: true }).click();
  await expect(page.getByText(ux(locale, "timelineHint"))).toBeVisible(); await expect(field).toBeHidden();
  await page.getByRole("button", { name: ux(locale, "memory"), exact: true }).click(); await expect(field).toHaveValue("My manually reviewed fact");
  await page.getByRole("button", { name: ux(locale, "refresh"), exact: true }).click(); await expect(field).toBeEnabled(); await expect(field).toHaveValue("My manually reviewed fact");
  await page.getByRole("button", { name: ux(locale, "people"), exact: true }).click();
  await expect(page.getByRole("heading", { name: "Courier 0", exact: true })).toBeVisible();
  const first = page.locator(".dr-character-discovery .dr-story-review-entry").first();
  await expect(first.getByRole("button", { name: people(locale, "approve"), exact: true })).toBeHidden();
  await first.getByText(ux(locale, "details"), { exact: true }).click();
  await first.getByText(people(locale, "edit"), { exact: true }).click();
  await first.getByRole("textbox", { name: people(locale, "background"), exact: true }).fill("Page-one draft");
  await page.getByRole("button", { name: people(locale, "next"), exact: true }).click(); await expect(page.getByRole("heading", { name: "Courier 20", exact: true })).toBeVisible();
  await page.getByRole("button", { name: people(locale, "prev"), exact: true }).click();
  await first.getByText(ux(locale, "details"), { exact: true }).click(); await first.getByText(people(locale, "edit"), { exact: true }).click();
  await expect(first.getByRole("textbox", { name: people(locale, "background"), exact: true })).toHaveValue("Page-one draft");
  await page.locator(".bottom-nav").getByRole("button", { name: locale === "ru" ? "Игра" : "Play", exact: true }).click();
  await nav.click(); await expect(first.getByRole("textbox", { name: people(locale, "background"), exact: true })).toHaveValue("Page-one draft");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await first.getByText(ux(locale, "details"), { exact: true }).click();
  await first.scrollIntoViewIfNeeded();
  if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(`people-${locale}-${width}.png`) });
  await page.getByRole("button", { name: ux(locale, "memory"), exact: true }).click(); await expect(field).toHaveValue("My manually reviewed fact");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => (window as any).storyUX.messages.filter((m: any) => m.type === "DR_STORY_GAME" || m.type === "DR_CHARACTER_DISCOVERY" && m.action !== "read"))).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(`story-${locale}-${width}.png`) });
  expect(errors).toEqual([]);
});

for (const locale of ["ru", "en"] as const) test(`story hub ${locale}: unknown, off, paused, error and scope change`, async ({ page }) => {
  await page.goto(`/tests/fixtures/sidepanel.html?world&story&inactive&locale=${locale}`);
  await page.locator(".bottom-nav").getByRole("button", { name: ux(locale, "nav"), exact: true }).click();
  await expect(page.getByText(ux(locale, "inactive"), { exact: true })).toBeVisible();
  await expect(page.getByText(ux(locale, "inactiveHint"), { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).storyUX.story.managed = true; (window as any).storyUX.story.paused = true; });
  await page.getByRole("button", { name: ux(locale, "refresh"), exact: true }).click();
  await expect(page.getByRole("button", { name: ux(locale, "resume"), exact: true })).toBeVisible();
  await page.getByRole("button", { name: ux(locale, "resume"), exact: true }).click(); await expect(page.getByText(ux(locale, "active"), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).storyUX.messages.filter((m: any) => m.type === "DR_STORY_GAME"))).toEqual([{ type: "DR_STORY_GAME", operation: "sync", manual: "stop", scope: { chatId: "test", worldId: "world-a" } }]);
  await page.evaluate(() => (window as any).storyUX.fail = true);
  await page.getByRole("button", { name: ux(locale, "refresh"), exact: true }).click();
  await expect(page.getByText(ux(locale, "unavailable"), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ux(locale, "start"), exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as any).storyUX.fail = false);
  await page.getByRole("button", { name: ux(locale, "refresh"), exact: true }).click();
  await expect(page.getByText(ux(locale, "active"), { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).setPageState({ scene: { worldId: null, bookId: null, focusIds: [] } }));
  await expect(page.getByRole("heading", { name: ux(locale, "connectTitle") })).toBeVisible();
});

for (const locale of ["ru", "en"] as const) test(`story hub ${locale}: no chat explains the next action`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}`);
  await page.locator(".bottom-nav").getByRole("button", { name: ux(locale, "nav"), exact: true }).click();
  await expect(page.getByRole("heading", { name: ux(locale, "chatTitle"), exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ux(locale, "backToPlay"), exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ux(locale, "start"), exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
