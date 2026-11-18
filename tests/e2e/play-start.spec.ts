import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { castText } from "../../src/core/cast-i18n";
import { learningText } from "../../src/core/learning";
import { menuText } from "../../src/core/menu-i18n";
import { sceneText } from "../../src/core/scene-i18n";
import { storyAutomationText } from "../../src/core/story-automation-i18n";
import { playStartText } from "../../src/entrypoints/sidepanel/PlayStart";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";

async function narrow(page: Page) {
  await page.setViewportSize({ width: 320, height: 460 });
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
}

for (const locale of ["ru", "en"] as const) for (const colorScheme of ["light", "dark"] as const) {
  const t = playStartText(locale);
  test(`one-screen welcome and direct import ${locale}/${colorScheme}`, async ({ page }, info) => {
    await narrow(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}&welcome&play=first`);
    const start = page.getByRole("button", { name: learningText(locale, "self"), exact: true });
    await expect(page.getByRole("heading", { name: learningText(locale, "welcomeTitle") })).toBeVisible();
    await expect(page.getByRole("button", { name: learningText(locale, "guided"), exact: true })).toBeVisible();
    await fit(page);
    expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).include(".dr-welcome").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath("welcome.png"), fullPage: true });
    await start.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".play-view h1")).toBeFocused();
    await expect(page.getByRole("heading", { name: t.firstWorld, exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).playSceneChanges)).toEqual([]);
    const importWorld = page.getByRole("button", { name: t.importWorld, exact: true });
    await expect(importWorld).toHaveAccessibleDescription(t.importHint);
    await expect(page.getByRole("button", { name: t.addWorld, exact: true })).toHaveAccessibleDescription(t.createHint);
    await expect(importWorld).toHaveCSS("color-scheme", colorScheme);
    await page.addStyleTag({ content: "html { font-size: 125%; }" });
    await fit(page);
    expect((await importWorld.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await importWorld.press("Enter");
    const dialog = page.getByRole("dialog", { name: sceneText(locale, "importFile") });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".rp-import-choose")).toBeFocused();
    await dialog.locator('input[type="file"]').setInputFiles({ name: "World.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ Rule: { value: "An entirely fictional lighthouse world.", importance: "always" } })) });
    const connect = dialog.getByRole("checkbox", { name: menuText(locale, "attachImport") });
    await expect(connect).toBeChecked();
    await dialog.getByRole("checkbox", { name: castText(locale, "auto"), exact: true }).uncheck();
    await fit(page);
    expect(await page.evaluate(() => (window as any).playSceneChanges)).toEqual([]);
    await dialog.getByRole("button", { name: menuText(locale, "importAndAttach"), exact: true }).click();
    await expect(page.locator(".play-view h1")).toBeFocused();
    const toast = page.locator(".toast[role=status]");
    await expect(toast).toBeVisible();
    const toastLayout = await toast.evaluate(el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return { fontSize: parseFloat(style.fontSize), left: rect.left, right: rect.right, overflows: el.scrollWidth > el.clientWidth, pointerEvents: style.pointerEvents };
    });
    expect(toastLayout.fontSize).toBeGreaterThanOrEqual(14);
    expect(toastLayout.left).toBeGreaterThanOrEqual(0);
    expect(toastLayout.right).toBeLessThanOrEqual(320);
    expect(toastLayout.overflows).toBe(false);
    expect(toastLayout.pointerEvents).toBe("none");
    await expect(page.getByText(t.first, { exact: true })).toBeVisible();
    await expect(page.getByText(t.waiting, { exact: true })).toBeVisible();
    await expect(page.locator(".play-view .dr-memory-status button.primary")).toHaveCount(0);
    const sent = await page.evaluate(() => (window as any).playSceneChanges);
    expect(sent).toHaveLength(1);
    expect(sent[0].importTarget).toMatchObject({ chatId: null, worldId: null, empty: true });
    await fit(page);
    await page.screenshot({ path: info.outputPath("first-turn.png"), fullPage: true });
  });

  test(`active game and open scene controls fit ${locale}/${colorScheme}`, async ({ page }, info) => {
    await narrow(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}&play=active`);
    await page.addStyleTag({ content: "html { font-size: 125%; }" });
    const start = page.locator(".dr-play-start");
    await expect(start.getByText(menuText(locale, "attached"), { exact: true })).toBeVisible();
    await expect(start.getByText(storyAutomationText(locale).automatic, { exact: true })).toBeVisible();
    await expect(start.getByText(t.reviewCount.replace("{count}", "2"))).toBeVisible();
    await expect(page.locator(".play-view .dr-memory-status button.primary")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("active-game.png"), fullPage: true });
    expect((await start.locator(".dr-play-memory").boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const scene = start.locator("summary").filter({ hasText: t.chat });
    await scene.focus();
    await page.keyboard.press("Enter");
    const field = start.getByRole("combobox", { name: sceneText(locale, "world"), exact: true });
    await expect(field).toBeVisible();
    expect((await field.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await field.evaluate(el => el.scrollIntoView({ block: "center" }));
    await field.focus();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await field.press("Space");
    const list = page.getByRole("listbox", { name: sceneText(locale, "world"), exact: true });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option").last()).toHaveText(await start.locator("h2").innerText());
    await fit(page);
    await page.keyboard.press("Escape");
    await expect(field).toBeFocused();
    const focus = start.locator(".scene-focus-toggle");
    await focus.focus();
    await page.keyboard.press("Enter");
    await expect(start.getByRole("checkbox", { name: locale === "ru" ? /Анастасия/ : /Anastasia/ })).toBeChecked();
    await fit(page);
    await page.screenshot({ path: info.outputPath("active-scene.png") });
    await start.locator(".dr-play-memory").click();
    await expect(page.locator(".dr-story-workspace")).toBeVisible();
  });
}

test("recording stopped, paused, and an earlier chat have distinct status", async ({ page }) => {
  await narrow(page);
  const t = playStartText("ru");
  for (const [mode, status] of [["idle", t.disabled], ["paused", storyAutomationText("ru").off], ["elsewhere", t.elsewhere]] as const) {
    await page.goto(`/tests/fixtures/sidepanel.html?play=${mode}`);
    await expect(page.locator(".dr-play-memory-state > span")).toHaveText(status);
    await fit(page);
  }
  await expect(page.getByRole("link", { name: t.openActive })).toBeVisible();
  await expect(page.locator(".dr-play-review-count")).toHaveCount(0);
});

test("empty chat offers creating a world directly and restores focus after cancelling import", async ({ page }) => {
  await narrow(page);
  const t = playStartText("ru");
  await page.goto("/tests/fixtures/sidepanel.html?play=first");
  await page.getByRole("button", { name: t.importWorld, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: sceneText("ru", "importFile") });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Загрузить мир из файла', exact: true })).toBeFocused();
  await page.locator('[data-dr-guide="nav-overview"]').click();
  await page.getByRole("button", { name: t.addWorld, exact: true }).click();
  await expect(page.getByRole("textbox", { name: sceneText("ru", "name"), exact: true })).toBeVisible();
  await fit(page);
});

test("creating a world finishes while another chat is still receiving the change", async ({ page }) => {
  await narrow(page);
  await page.goto("/tests/fixtures/sidepanel.html?play=first");
  await page.getByRole("button", { name: playStartText("ru").addWorld, exact: true }).click();
  const dialog = page.locator(".lm-create-dialog");
  const name = "Мастерская переплётчицы";
  await dialog.getByRole("textbox", { name: sceneText("ru", "name"), exact: true }).fill(name);
  await dialog.getByRole("checkbox", { name: castText("ru", "auto"), exact: true }).uncheck();
  await page.evaluate(() => {
    const runtime = (window as any).chrome.runtime;
    const previous = runtime.sendMessage.bind(runtime);
    runtime.sendMessage = (message: { type: string }) => message.type === "DR_DATA_CHANGED"
      ? new Promise<void>(resolve => { (window as any).finishBroadcast = resolve; })
      : previous(message);
  });
  await dialog.getByRole("button", { name: "Создать мир", exact: true }).press("Enter");
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishBroadcast)).toBe("function");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("group", { name, exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).finishBroadcast());
  await fit(page);
});

for (const [locale, colorScheme] of [["ru", "dark"], ["en", "light"]] as const) {
  test(`one saved game connects directly from Play ${locale}`, async ({ page }, info) => {
    const t = savedMemoryText(locale);
    await narrow(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}&play=first&saved=single`);
    await page.addStyleTag({ content: "html { font-size:125%; }" });
    const name = locale === "ru" ? "Северная обсерватория и долгая зимняя экспедиция" : "The northern observatory and the long winter expedition";
    const resume = page.getByRole("button", { name: t.resumeGame(name), exact: true });
    await expect(resume).toHaveClass(/primary/);
    expect((await resume.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(resume).toBeInViewport({ ratio: 1 });
    expect(await resume.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth && el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2));
    })).toBe(true);
    await fit(page);
    await page.screenshot({ path: info.outputPath("saved-game.png") });
    expect(await page.evaluate(() => (window as any).savedTransfer.requests)).toEqual([]);
    await resume.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: t.queued })).toBeVisible();
    await expect(page.getByRole("dialog", { name: t.title })).toHaveCount(0);
    await expect(page.locator(".dr-play-start h2")).toBeFocused();
    const requests = await page.evaluate(() => (window as any).savedTransfer.requests);
    expect(requests).toMatchObject([
      { type: "DR_SAVED_MEMORY_PREVIEW", worldId: "saved-a" },
      { type: "DR_SAVED_MEMORY_OPEN", version: "test-version:saved-a", worldId: "saved-a" },
    ]);
  });

  test(`one saved game opens a keyboard-accessible preview from Play ${locale}`, async ({ page }, info) => {
    const t = savedMemoryText(locale);
    await narrow(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}&play=first&saved=single`);
    await page.addStyleTag({ content: "html { font-size:125%; }" });
    const resume = page.getByRole("button", { name: t.viewScene, exact: true });
    await expect(resume).toBeVisible();
    await expect(resume).toHaveClass(/secondary/);
    expect(await page.evaluate(() => (window as any).savedTransfer.requests)).toEqual([]);
    await resume.press("Enter");
    const dialog = page.getByRole("dialog", { name: t.title });
    await expect(dialog.locator("blockquote")).toContainText("saved-a");
    await expect(dialog.getByText(t.chooseWorld)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: t.changeWorld })).toHaveCount(0);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(460);
    const open = dialog.getByRole("button", { name: t.connect, exact: true });
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(open).toBeInViewport({ ratio: 1 });
    expect(await open.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath("saved-preview.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(resume).toBeFocused();
    await resume.press("Enter");
    await page.evaluate(() => { (window as any).savedTransfer.error = "draft-not-empty"; });
    await open.press("Enter");
    await expect(dialog.getByRole("alert")).toHaveText(t.draft);
    await page.evaluate(() => { (window as any).savedTransfer.error = ""; });
    await open.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: t.queued })).toBeVisible();
    await expect(resume).toHaveCount(0);
    const last = (await page.evaluate(() => (window as any).savedTransfer.requests)).at(-1);
    expect(last).toMatchObject({ type: "DR_SAVED_MEMORY_OPEN", version: "test-version:saved-a", worldId: "saved-a" });
  });
}

test("choosing between saved games and switching tabs before confirmation", async ({ page }) => {
  const t = savedMemoryText("en");
  await narrow(page);
  await page.goto("/tests/fixtures/sidepanel.html?locale=en&play=first&saved=multiple");
  await page.getByRole("button", { name: t.title }).press("Enter");
  const dialog = page.getByRole("dialog", { name: t.title });
  await expect(dialog.getByText(t.chooseWorld)).toBeVisible();
  expect(await page.evaluate(() => (window as any).savedTransfer.requests)).toEqual([]);
  await dialog.getByRole("button", { name: "Another game by the lighthouse" }).press("Enter");
  await expect(dialog.locator("blockquote")).toContainText("saved-b");
  await dialog.getByRole("button", { name: t.changeWorld }).press("Enter");
  await dialog.getByRole("button", { name: /The northern observatory/ }).press("Enter");
  await expect(dialog.locator("blockquote")).toContainText("saved-a");
  await page.evaluate(() => (window as any).switchTestTab());
  await dialog.getByRole("button", { name: t.connect }).press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(t.stale);
  expect(await page.evaluate(() => (window as any).savedTransfer.requests.map((request: { type: string }) => request.type)))
    .toEqual(["DR_SAVED_MEMORY_PREVIEW", "DR_SAVED_MEMORY_PREVIEW"]);
});

test("a different selected world keeps confirmation for the only saved game", async ({ page }) => {
  const t = savedMemoryText("ru");
  await narrow(page);
  await page.goto("/tests/fixtures/sidepanel.html?play=waiting&saved=single");
  await expect(page.locator(".dr-play-start").getByText(playStartText("ru").first, { exact: true })).toBeVisible();
  await expect(page.locator(".dr-play-start").getByText(playStartText("ru").resumeHint)).toHaveCount(0);
  await page.locator('[data-dr-guide="continuation-toggle"]').press("Enter");
  await expect(page.getByRole("button", { name: t.viewScene, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: t.title, exact: true }).press("Enter");
  const dialog = page.getByRole("dialog", { name: t.title });
  await expect(dialog.locator("blockquote")).toContainText("saved-a");
  await expect(dialog.getByRole("button", { name: t.connect, exact: true })).toBeEnabled();
  const requests = await page.evaluate(() => (window as any).savedTransfer.requests);
  expect(requests).toMatchObject([{ type: "DR_SAVED_MEMORY_PREVIEW", worldId: "saved-a" }]);
});

test("an active chat groups saved-memory fallback with ordinary continuation", async ({ page }) => {
  const t = savedMemoryText("ru");
  await narrow(page);
  await page.goto("/tests/fixtures/sidepanel.html?play=active&saved=source");
  const open = page.getByRole("button", { name: t.title, exact: true });
  await expect(open).toHaveCount(0);
  await page.locator('[data-dr-guide="continuation-toggle"]').press("Enter");
  const continuation = page.locator('[data-dr-guide="continuation-content"]');
  await expect(continuation.getByRole("button", { name: "Продолжить в новом чате", exact: true })).toBeEnabled();
  await expect(continuation.getByRole("button", { name: t.title, exact: true })).toBeVisible();
  await expect(open).toHaveClass(/secondary/);
  await open.press("Enter");
  const dialog = page.getByRole("dialog", { name: t.title });
  await expect(dialog.getByRole("button", { name: t.open, exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).savedTransfer.requests.map((request: { type: string }) => request.type)))
    .toEqual(["DR_SAVED_MEMORY_PREVIEW"]);
});

test("reloading a connected game keeps the play instruction while history is loading", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html?play=active&saved=source&loadingHistory");
  const card = page.locator(".dr-play-start");
  await expect(card.getByText(playStartText("ru").play, { exact: true })).toBeVisible();
  await expect(card.getByText(playStartText("ru").resumeHint)).toHaveCount(0);
  await page.locator('[data-dr-guide="continuation-toggle"]').press("Enter");
  await expect(page.getByRole("button", { name: savedMemoryText("ru").title })).toBeEnabled();
});
