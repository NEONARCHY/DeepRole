import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { EMPTY_STATUS } from "../../src/core/characters";
import { storyReviewText } from "../../src/core/story-review-i18n";
import { storyUxText } from "../../src/core/story-ux-i18n";
async function rows(panel: Page) {
  return panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
  }));
}
for (const locale of ["ru", "en"] as const) test(`installed playable story ${locale}: alternatives, edit, undo, reload and two tabs`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3; wholly synthetic site, no personal account"); test.setTimeout(120_000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale), turn = (condition: string) => `${condition}.\n<deeprole_characters>${JSON.stringify({ world: f.world.id, chat: f.binding.chatId, base: "model-is-not-authority", present: ["person-1"], updates: [{ id: "person-1", state: { ...EMPTY_STATUS, condition } }] })}</deeprole_characters>`;
    const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "The workshop opens.")]; let selected = 41, posts = 0, editedPrompt = "", outgoing = "";
    let historyGate: Promise<void> | null = null, historyRequested: (() => void) | null = null;
    await panel.evaluate(async ({ seed, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of seed) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false }, deeprole_library_change: { token: "synthetic-game-seed" } });
    }, { seed: f.records, locale });
    await context.route("https://chat.deepseek.com/**", async route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) { if (historyGate) { const gate = historyGate; historyGate = null; historyRequested?.(); await gate; } return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } }); }
      if (url.endsWith("/api/v0/chat/edit_message")) { posts++; const body = route.request().postDataJSON(); editedPrompt = body.prompt; return body.message_id === 48 ? route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":52,"response_message_id":53}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' }) : route.fulfill({ json: {} }); }
      if (url.endsWith("/api/v0/chat/completion")) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":48,"response_message_id":49}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' }); }
      if (url.includes("/api/v0/")) { if (route.request().method() === "POST") posts++; return route.fulfill({ json: {} }); }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="41"><div class="ds-markdown">The workshop opens.</div></article></section><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(); const errors: string[] = []; chat.on("pageerror", error => errors.push(error.stack ?? error.message)); chat.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); }); await chat.setViewportSize({ width: 320, height: 950 }); await chat.goto(f.binding.chatUrl!); await chat.bringToFront();
    try { await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 }); }
    catch (error) { throw new Error(JSON.stringify({ error: String(error), errors, html: (await chat.content()).slice(0, 6000), records: (await rows(panel)).map(r => ({ kind: r.kind, id: r.id })) })); }
    const game = (operation: string, manual = "stop", targetUrl = f.binding.chatUrl!) => panel.evaluate(async ({ operation, manual, targetUrl }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url: targetUrl, active: true }); if (!tab) throw Error("no active chat"); return api.tabs.sendMessage(tab.id, { type: "DR_STORY_GAME", operation, manual }); }, { operation, manual, targetUrl });
    const display = (page: Page, id: number, content: string) => page.evaluate(({ id, content }) => { const article = document.createElement("article"), body = document.createElement("div"); article.dataset.role = "assistant"; article.dataset.messageId = String(id); body.className = "ds-markdown"; body.textContent = content; article.append(body); document.querySelector("#story")!.replaceChildren(article); }, { id, content });
    const condition = async () => (await rows(panel)).find(r => r.kind === "binding").data.characterScenes[f.world.id].states["person-1"].condition;
    for (const scope of [{ chatId: f.binding.chatId, worldId: "wrong-world" }, { chatId: "wrong-chat", worldId: f.world.id }]) {
      const denied = await panel.evaluate(async ({ scope, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, { type: "DR_STORY_GAME", operation: "restart", manual: "stop", scope }); }, { scope, url: f.binding.chatUrl! });
      expect(denied).toMatchObject({ ok: false, error: "story-binding-conflict" });
    }
    expect((await rows(panel)).filter(r => r.kind === "story")).toHaveLength(0);
    expect(await game("start")).toMatchObject({ ok: true });
    messages.push(message(42, 41, "USER", "Choose"), message(43, 42, "ASSISTANT", turn("A")), message(44, 42, "ASSISTANT", turn("B")), message(45, 42, "ASSISTANT", turn("C")));
    selected = 43; await display(chat, 43, turn("A")); await expect.poll(condition, { timeout: 12000 }).toBe("A");
    // Deliberately leave the server pointer on A: the displayed native identity wins.
    for (const [id, value] of [[44, "B"], [45, "C"], [43, "A"]] as const) { await display(chat, id, turn(value)); await expect.poll(condition, { timeout: 12000 }).toBe(value); }
    // Switch again DURING an in-flight snapshot. The old result must not win,
    // and the new selection must be retried without another user click.
    let releaseHistory!: () => void;
    historyGate = new Promise(resolve => { releaseHistory = resolve; });
    const requested = new Promise<void>(resolve => { historyRequested = resolve; });
    await display(chat, 44, turn("B")); await requested; await display(chat, 45, turn("C")); releaseHistory();
    await expect.poll(condition, { timeout: 12000 }).toBe("C");
    await display(chat, 43, turn("A")); await expect.poll(condition, { timeout: 12000 }).toBe("A");
    await expect(chat.getByText(storyReviewText(locale, "sourceUnavailable"), { exact: true })).toHaveCount(0);
    const first = (await rows(panel)).filter(r => r.kind === "story"); expect(first.filter(r => r.data.type === "event")).toHaveLength(3);
    await chat.reload(); await display(chat, 43, turn("A")); await expect.poll(condition, { timeout: 12000 }).toBe("A");
    const second = await context.newPage(); await second.goto(f.binding.chatUrl!); await second.bringToFront(); await display(second, 44, turn("B")); await expect.poll(condition, { timeout: 12000 }).toBe("B");
    expect((await rows(panel)).filter(r => r.kind === "story" && r.data.type === "event")).toHaveLength(3);
    expect(await game("undo")).toMatchObject({ ok: true }); await expect.poll(condition, { timeout: 12000 }).toBe(locale === "ru" ? "В мастерской." : "In the workshop.");
    expect(await game("sync")).toMatchObject({ ok: true }); await expect.poll(condition, { timeout: 12000 }).toBe("B");
    // Editing the earlier user message receives baseline state, never B's future.
    await second.evaluate(() => fetch("/api/v0/chat/edit_message", { method: "POST", body: JSON.stringify({ chat_session_id: "synthetic-a", message_id: 42, prompt: "Choose differently", action: "REGENERATE" }) }));
    expect(editedPrompt).toContain("Choose differently"); expect(editedPrompt).toContain(locale === "ru" ? "В мастерской." : "In the workshop."); expect(editedPrompt).not.toContain('"condition":"B"'); expect(posts).toBe(1);
    messages.push(message(46, 41, "USER", "Choose differently"), message(47, 46, "ASSISTANT", turn("Edited"))); selected = 47; await display(second, 47, turn("Edited")); await expect.poll(condition, { timeout: 12000 }).toBe("Edited");
    await second.evaluate(() => new Promise<void>((resolve, reject) => { const request = new XMLHttpRequest(); request.open("POST", "/api/v0/chat/completion"); request.onload = () => resolve(); request.onerror = () => reject(Error("synthetic network")); request.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: 47, prompt: "Continue the story" })); }));
    expect(outgoing).toContain("<deeprole_character_mode>"); expect(outgoing).toContain("[User message]\nContinue the story");
    messages.push(message(48, 47, "USER", outgoing), message(49, 48, "ASSISTANT", turn("Final"))); selected = 49; await display(second, 49, turn("Final")); await expect.poll(condition, { timeout: 12000 }).toBe("Final");
    await second.evaluate(old => new Promise<void>((resolve, reject) => { const request = new XMLHttpRequest(); request.open("POST", "/api/v0/chat/edit_message"); request.onload = () => resolve(); request.onerror = () => reject(Error("synthetic network")); request.send(JSON.stringify({ chat_session_id: "synthetic-a", message_id: 48, prompt: old.replace("[User message]\nContinue the story", "[User message]\nMy edited story"), action: "REGENERATE" })); }), outgoing);
    expect(editedPrompt).toContain("[User message]\nMy edited story"); expect(editedPrompt.split("[User message]\n")).toHaveLength(2); expect(editedPrompt).toContain('"condition":"Edited"'); expect(editedPrompt).not.toContain('"condition":"Final"');
    messages.push(message(52, 47, "USER", editedPrompt), message(53, 52, "ASSISTANT", turn("Edited final"))); selected = 53; await display(second, 53, turn("Edited final")); await expect.poll(condition, { timeout: 12000 }).toBe("Edited final");
    expect((await rows(panel)).filter(r => r.kind === "dispatch").some(r => r.data.originalDraft === "My edited story" && r.data.wire.link?.userMessageKey === '["message","52"]')).toBe(true);
    const review = await panel.evaluate(async () => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/chat/s/synthetic-a", active: true }); return api.tabs.sendMessage(tab.id, { type: "DR_STORY_REVIEW_READ", cursor: null }); });
    expect(review).toMatchObject({ ok: true, data: { managed: true } }); expect(JSON.stringify(review.data.entries)).not.toContain("<deeprole_characters>");
    await panel.reload(); await panel.setViewportSize({ width: 320, height: 1000 }); await second.bringToFront();
    await panel.locator(".bottom-nav").getByRole("button", { name: storyUxText(locale, "nav"), exact: true }).click();
    await expect(panel.getByText(storyUxText(locale, "active"), { exact: true })).toBeVisible({ timeout: 12000 });
    await panel.getByRole("button", { name: storyUxText(locale, "timeline"), exact: true }).click();
    await expect(panel.getByText(storyUxText(locale, "timelineHint"), { exact: true })).toBeVisible();
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.screenshot({ path: info.outputPath(`story-hub-native-${locale}.png`), fullPage: true });
    await second.screenshot({ path: info.outputPath(`working-story-${locale}.png`), fullPage: true }); expect(posts).toBe(3); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
