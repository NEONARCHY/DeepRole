import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { buildBdsImport } from "../../src/core/bds-import";
import { automationMarker } from "../../src/core/story-automation";
import { storyAutomationText } from "../../src/core/story-automation-i18n";
import { storyUpdateText } from "../../src/core/story-update-i18n";
import { navigationText } from "../../src/core/navigation-i18n";
import { castText } from "../../src/core/cast-i18n";
import { menuText } from "../../src/core/menu-i18n";
import { sceneText } from "../../src/core/scene-i18n";
import { playStartText } from "../../src/entrypoints/sidepanel/PlayStart";
import type { DataRecord, WorldProfile } from "../../src/core/types";
import type { StoryRecord } from "../../src/core/story-records";

const origin = "https://chat.deepseek.com";
const chatId = "first-game";
const chatUrl = origin + "/a/chat/s/" + chatId;
const html = '<!doctype html><html><body><main><section id="story"></section><form><textarea aria-label="Message"></textarea><button>Send</button></form></main></body></html>';
const rows = (panel: Page): Promise<DataRecord[]> => panel.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open("deeprole");
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll();
    read.onsuccess = () => resolve(read.result);
    read.onerror = () => reject(read.error);
    tx.oncomplete = () => db.close();
  };
}));

for (const [locale, transport, historyUnavailable, pendingRows] of [
  ["ru", "fetch", false, false], ["en", "fetch", false, false],
  ["ru", "fetch", true, false], ["ru", "xhr", true, false],
  ["ru", "fetch", false, true], ["ru", "xhr", false, true],
  ["ru", "fetch", true, true], ["ru", "xhr", true, true],
] as const) test(`automatic memory from first game turn ${locale}${historyUnavailable ? " after history unavailable and reload " + transport : ""}${pendingRows ? " with pending native rows " + transport : ""}`, async ({}, info) => {
  const deferred = historyUnavailable ? transport : null;
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 on a synthetic chat");
  test.setTimeout(60_000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    await expect(panel.locator(".onboarding")).toBeVisible();
    const worldRecords = buildBdsImport([{ title: "Workshop", content: "The workshop is beside the harbor.", importance: "always" }], "The Harbor Workshop", "smart");
    let world: WorldProfile;
    const offWorld = { ...worldRecords.find(r => r.kind === "world")!.data as WorldProfile, id: "paused-world", name: "Paused world", storyAutomation: { mode: "off", revision: "explicit-off" } };
    await panel.evaluate(async ({ seed, locale }) => {
      const open = indexedDB.open("deeprole");
      await new Promise<void>((resolve, reject) => {
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction("records", "readwrite");
          for (const record of seed) tx.objectStore("records").put({ ...record, pk: record.kind + ":" + record.id, updatedAt: Date.now() });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, characterSheetsEnabled: locale === "ru" }, deeprole_library_change: { token: "new-world" } });
    }, { seed: [{ kind: "world", id: offWorld.id, data: offWorld }], locale });

    const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({
      message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false,
      fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }],
    });
    const fromHome = locale === "ru";
    const previous = "An old note unrelated to the game.";
    const history = fromHome ? [] : [message(1, null, "USER", "Before the game"), message(2, 1, "ASSISTANT", previous)];
    const prompts: string[] = [];
    let unavailable = 0;
    const fact = "Nora put the brass token into the blue box.";
    const uncertain = "If the ship docks, Nora may lend her lantern.";
    const progress = async () => ((await rows(panel)).find(r => r.id === world.id)?.data as WorldProfile).sharedGame;
    const story = async () => (await rows(panel)).flatMap(r => r.kind === "story" ? [r.data as StoryRecord] : []);
    await context.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/history_messages")) {
        const id = url.searchParams.get("chat_session_id");
        const messages = id === chatId ? history : [];
        if (deferred && id === chatId && !messages.length) { unavailable++; return route.fulfill({ status: 404, json: {} }); }
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: messages.at(-1)?.message_id ?? null }, chat_messages: messages } } } });
      }
      if (url.pathname.endsWith("/completion")) {
        const payload = route.request().postDataJSON();
        prompts.push(payload.prompt);
        return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":3,"response_message_id":4}\n\ndata: {"p":"response/status","o":"SET","v":"FINISHED"}\n\nevent: close\ndata: {"auto_resume":false}\n\n' });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: html });
    });

    const chat = await context.newPage();
    await chat.setViewportSize({ width: 320, height: 520 });
    await chat.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
    await chat.addInitScript(({ fromHome, previous, chatId, transport, pendingRows }) => {
      window.addEventListener("DOMContentLoaded", () => {
        if (!fromHome && location.pathname.endsWith(chatId)) {
          document.querySelector("#story")!.innerHTML = '<article data-role="assistant" data-message-id="2"><div class="ds-markdown"></div></article>';
          document.querySelector(".ds-markdown")!.textContent = previous;
        }
        document.querySelector("form")!.addEventListener("submit", async event => {
          event.preventDefault();
          const prompt = document.querySelector("textarea")!.value;
          if (location.pathname === "/") window.history.pushState({}, "", "/a/chat/s/" + chatId);
          // Native UI may display the outgoing user and an empty assistant row
          // before the first HTTP request. Neither is a previous played scene.
          // Expected before the first run: one send includes the memory protocol,
          // starts at the verified empty server history, then records both turns.
          if (pendingRows) {
            document.querySelector("#story")!.innerHTML = '<article data-role="user" data-message-id="3"></article><article data-role="assistant" data-message-id="4"><div class="ds-markdown"></div></article>';
            document.querySelector('[data-role="user"]')!.textContent = prompt;
          }
          const body = JSON.stringify({ chat_session_id: chatId, parent_message_id: fromHome ? null : 2, prompt });
          if (transport === "xhr") {
            const request = new XMLHttpRequest();
            request.open("POST", "/api/v0/chat/completion");
            request.send(body);
          } else await fetch("/api/v0/chat/completion", { method: "POST", body });
        });
      }, { once: true });
    }, { fromHome, previous, chatId, transport, pendingRows });
    const attach = async (worldId: string) => panel.evaluate(async worldId => {
      const api = (globalThis as any).chrome, [active] = await api.tabs.query({ active: true, lastFocusedWindow: true });
      return api.tabs.sendMessage(active.id, { type: "DR_SET_SCENE", scene: { worldId, bookId: null, focusIds: [] } });
    }, worldId);
    await chat.goto(fromHome ? origin + "/" : chatUrl);
    await chat.bringToFront();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", "");
    await panel.setViewportSize({ width: 320, height: 520 });
    await panel.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
    await panel.getByRole("button", { name: playStartText(locale).importWorld, exact: true }).click();
    const importer = panel.getByRole("dialog", { name: sceneText(locale, "importFile"), exact: true });
    await importer.getByLabel(sceneText(locale, "chooseFile"), { exact: true }).setInputFiles({
      name: "harbor-workshop.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ name: "The Harbor Workshop", entries: [{ title: "Workshop", content: "The workshop is beside the harbor.", activation: "always" }] })),
    });
    const attachImport = importer.getByRole("checkbox", { name: menuText(locale, "attachImport"), exact: true });
    if (fromHome) await expect(attachImport).toBeChecked();
    else { await expect(attachImport).not.toBeChecked(); await attachImport.check(); }
    await importer.getByRole("checkbox", { name: castText(locale, "auto"), exact: true }).uncheck();
    const submit = importer.getByRole("button", { name: menuText(locale, "importAndAttach"), exact: true });
    expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await importer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await submit.press("Enter");
    await expect(panel.locator('[data-dr-guide="page-overview"]')).toBeVisible();
    await expect(panel.getByText(menuText(locale, "importedAndAttached"), { exact: true })).toBeVisible();
    world = (await rows(panel)).find(r => r.kind === "world" && (r.data as WorldProfile).name === "The Harbor Workshop")!.data as WorldProfile;
    if (!fromHome) await expect.poll(progress).toMatchObject({ managed: true });
    expect(prompts).toHaveLength(0);

    const draft = "I ask Nora to put the brass token away.";
    await chat.getByRole("textbox", { name: "Message" }).fill(draft);
    await chat.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect.poll(() => prompts.length).toBe(1);
    expect(prompts[0]).toContain(automationMarker(world));
    expect(prompts[0]).toContain("The workshop is beside the harbor.");
    expect(prompts[0]).toContain("[User message]\n" + draft);
    const baseline = (await story()).find(record => record.type === "baseline");
    if (deferred) {
      expect(unavailable).toBeGreaterThan(0);
      expect(baseline?.origin.nativeAnchor).toBeUndefined();
      await expect.poll(async () => (await rows(panel)).find(row => row.kind === "dispatch")?.data).toMatchObject({
        opening: true, injection: "context", delivery: { status: "accepted" },
        ...(deferred === "xhr" ? { wire: { link: { userMessageKey: '["message","3"]', assistantMessageKey: '["message","4"]' } } } : {}),
      });
    } else expect(baseline?.origin.nativeAnchor?.nativeMessageKey).toBe(fromHome ? null : '["message","2"]');
    const reply = fact + "\n" + uncertain + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: world.id, chat: chatId, facts: [
      { text: fact, quote: fact, kind: "event", risk: "ordinary" },
      { text: uncertain, quote: uncertain, kind: "plan", risk: "uncertain" },
    ] }) + "</deeprole_characters>";
    history.push(message(3, fromHome ? null : 2, "USER", prompts[0]!), message(4, 3, "ASSISTANT", reply));
    if (deferred) await chat.reload();
    await chat.locator("#story").evaluate((root, prose) => {
      const article = document.createElement("article"), markdown = document.createElement("div");
      article.dataset.role = "assistant";
      article.dataset.messageId = "4";
      markdown.className = "ds-markdown";
      markdown.textContent = prose;
      article.append(markdown);
      root.replaceChildren(article);
    }, reply);
    await expect.poll(progress, { timeout: 12_000 }).toMatchObject({
      facts: [{ text: fact }], pendingReviewIds: [expect.any(String)],
    });
    const [reviewId] = (await progress())?.pendingReviewIds ?? [];
    expect(reviewId).toBeTruthy();
    const journal = await story();
    expect(journal.filter(r => r.type === "revision").map(r => r.content)).not.toContain(previous);
    expect(journal.filter(r => r.type === "revision")).toHaveLength(2);
    if (deferred) expect(journal.find(r => r.type === "baseline")?.origin.nativeAnchor?.nativeMessageKey).toBeNull();
    expect(prompts).toHaveLength(1);

    await panel.setViewportSize({ width: 320, height: 520 });
    await panel.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
    await panel.reload();
    await chat.bringToFront();
    await panel.locator(".bottom-nav").getByRole("button", { name: navigationText(locale, "story"), exact: true }).click();
    const config = storyAutomationText(locale);
    const review = panel.getByRole("region", { name: config.inbox, exact: true });
    await expect(review).toBeVisible();
    const mode = panel.getByRole("combobox", { name: config.mode, exact: true });
    await expect(mode).toHaveCount(0);
    const card = panel.locator(".dr-story-automation-settings");
    await card.locator("summary").press("Enter");
    await expect(mode).toHaveValue("automatic");
    await expect(panel.getByRole("button", { name: config.start, exact: true })).toHaveCount(0);
    await panel.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Chromium can report 43.999938 for a 44px control after text scaling.
    expect((await mode.boundingBox())!.height).toBeGreaterThanOrEqual(44 - 0.001);
    const workNavigation = panel.locator(".dr-workspace-nav");
    expect(await workNavigation.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await review.getByRole("button", { name: config.accept, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await mode.focus();
    await expect(mode).toBeFocused();
    await panel.screenshot({ path: info.outputPath("automatic-memory.png"), fullPage: true });
    const beforeConfirmation = await progress();
    await review.getByRole("button", { name: config.accept, exact: true }).press("Enter");
    await expect(review.getByRole("button", { name: storyUpdateText(locale, "confirmSave"), exact: true })).toBeVisible();
    await review.getByRole("button", { name: storyUpdateText(locale, "cancelDecision"), exact: true }).press("Enter");
    expect((await progress())?.facts).toEqual(beforeConfirmation?.facts);
    expect((await progress())?.pendingReviewIds).toEqual(beforeConfirmation?.pendingReviewIds);
    await review.getByRole("button", { name: config.decline, exact: true }).click();
    await expect(review.getByText(config.empty, { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const game = await progress();
      return {
        facts: game?.facts,
        pending: game?.pendingReviewIds ?? [],
        resolution: game?.reviewResolutions?.[reviewId!],
      };
    }).toMatchObject({ facts: [{ text: fact }], pending: [], resolution: "dismissed" });
    expect(prompts).toHaveLength(1);

    const paused = await context.newPage();
    await paused.goto(origin + "/a/chat/s/paused");
    await paused.bringToFront();
    await expect(paused.locator("html")).toHaveAttribute("data-deeprole-context", "");
    expect(await attach(offWorld.id)).toEqual({ ok: true });
    await expect.poll(async () => ((await rows(panel)).find(r => r.id === offWorld.id)?.data as WorldProfile).sharedGame?.managed).toBe(false);
    expect((await story()).some(r => r.worldId === offWorld.id)).toBe(false);
    expect(prompts).toHaveLength(1);
  } finally { await context.close(); }
});
