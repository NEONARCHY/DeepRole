import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { captureWorldGame } from "../../src/storage/world-game";
import { boundStory } from "../../src/core/story-continuation";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
import { menuText } from "../../src/core/menu-i18n";
import { navigationText } from "../../src/core/navigation-i18n";
import { storyAutomationText } from "../../src/core/story-automation-i18n";
import { automationMarker } from "../../src/core/story-automation";

const origin = "https://chat.deepseek.com", second = "repeat-second", third = "repeat-third";
const html = '<!doctype html><html><head><style>main{margin:30px 30px 130px 360px}form{position:fixed;bottom:20px;left:360px}textarea{width:420px}</style></head><body><main><section id="conversation"></section><form><textarea aria-label="Message"></textarea><button>Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; };
}));
const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role,
  status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });

// Frozen expectations: docs/RP387-REPEATED-CONTINUATION.md, before first run.
const scenarios: { recover: boolean; decision?: "accept" | "dismiss"; fail?: boolean }[] = [
  { recover: false }, { recover: true },
  ...(["accept", "dismiss"] as const).flatMap(decision => [false, true].map(fail => ({ recover: false, decision, fail }))),
];
for (const locale of ["ru", "en"] as const) for (const mode of ["automatic", "review"] as const) for (const scenario of scenarios) {
 const { recover, decision, fail } = scenario;
 test(`repeated continuation ${locale} ${mode} ${decision ? `resolve-${decision}-${fail ? "abort" : "direct"}` : recover ? "reload" : "direct"}`, async () => {
  test.setTimeout(90000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  let finishPending: (() => void) | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 2), copy = savedMemoryText(locale);
    f.world.contextBudget = 8000; f.entry.activation = "always";
    f.world.storyAutomation = { mode, revision: "rp387-policy" };
    const initialScene = "Nora waits at the ferry workshop. The copper box is empty.";
    f.world.sharedGame = { ...captureWorldGame(f.records, f.world, f.binding), recentChatId: f.binding.chatId, recentStory: boundStory([{ role: "assistant", text: initialScene }], "history") };
    const gameId = f.world.sharedGame.id;
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "rp387-seed" } });
    }, { records: f.records, locale });
    const firstFact = "Nora placed the silver token inside the copper box.", secondFact = "Nora placed the wooden seal inside the green drawer.";
    const thirdFact = "Nora placed the blue ribbon inside the brass casket.", uncertain = "If the ferry arrives, Nora may lend the lantern.";
    const reply = (chat: string, facts: { text: string; risk: string; kind: string }[]) => facts.map(f => f.text).join("\n") + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: f.world.id, chat,
      facts: facts.map(f => ({ ...f, quote: f.text })) }) + "</deeprole_characters>";
    const probe = !decision && !recover;
    const olderMove = locale === "ru" ? "Нора кладёт кисть в холщовый мешок." : "Nora placed the brush inside the canvas bag.";
    const hearsay = locale === "ru" ? "— Думаю, кисть поставили на подоконник." : "“Someone placed the brush on the windowsill.”";
    const locationDraft = locale === "ru" ? "  Напомни, где сейчас кисть и печать?\n" : "  Where are the brush and the seal now?\n";
    const drafts = ["I watch Nora store the silver token.", "I ask Nora to store the wooden seal.", probe ? locationDraft : "  I check Nora's copper box and green drawer, then ask her to store the blue ribbon.\n", "I check the token, the seal and the ribbon; remind me about the lantern."];
    const replies = [reply(second, [{ text: firstFact, kind: "event", risk: "ordinary" }, { text: uncertain, kind: "plan", risk: "uncertain" }]),
      reply(second, [{ text: secondFact, kind: "event", risk: "ordinary" }]), reply(third, [{ text: thirdFact, kind: "event", risk: "ordinary" }]), "Nora nods. Nothing changes in the workshop."];
    if (probe) replies[0] = olderMove + "\n" + hearsay + "\n" + replies[0];
    const histories = new Map([[second, [] as ReturnType<typeof message>[]], [third, [] as ReturnType<typeof message>[]]]);
    const blocked = new Set([f.binding.chatId]), sent: { chat: string; prompt: string }[] = [];
    let destination = second, releaseThird!: () => void, reads = 0;
    const thirdGate = new Promise<void>(resolve => { releaseThird = resolve; }); finishPending = releaseThird;
    await context.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/fixture/next-chat") return route.fulfill({ json: { id: destination } });
      if (url.pathname.endsWith("/history_messages")) {
        const id = url.searchParams.get("chat_session_id")!; reads++;
        if (blocked.has(id)) return route.fulfill({ status: 403, json: {} });
        const history = histories.get(id) ?? [];
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: history.at(-1)?.message_id ?? null }, chat_messages: history } } } });
      }
      if (url.pathname.endsWith("/completion")) {
        const payload = route.request().postDataJSON(), turn = sent.length, target = turn < 2 ? second : third;
        expect(blocked.has(payload.chat_session_id)).toBe(false);
        expect(payload.chat_session_id).toBe(target); expect(payload.parent_message_id).toBe(turn % 2 ? 4 : null); expect(turn).toBeLessThan(4);
        sent.push({ chat: target, prompt: payload.prompt });
        if (turn === 2 && recover) { await thirdGate; try { await route.abort("failed"); } catch { /* Unloaded document. */ } return; }
        const user = turn % 2 ? 5 : 3, answer = user + 1;
        histories.get(target)!.push(message(user, turn % 2 ? 4 : null, "USER", payload.prompt), message(answer, user, "ASSISTANT", replies[turn]!));
        return route.fulfill({ contentType: "text/event-stream", body:
          "event: ready\ndata: " + JSON.stringify({ request_message_id: user, response_message_id: answer }) + "\n\n"
          + "data: " + JSON.stringify({ p: "response/content", o: "APPEND", v: replies[turn] }) + "\n\n"
          + 'data: {"p":"response/status","o":"SET","v":"FINISHED"}\n\nevent: close\ndata: {"auto_resume":false}\n\n' });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: html });
    });
    const chat = await context.newPage();
    await chat.addInitScript(({ xhr }) => {
      window.addEventListener("DOMContentLoaded", () => {
        const root = document.querySelector("#conversation")!, form = document.querySelector("form")!;
        let parent: number | null = null;
        const render = async () => {
          if (location.pathname === "/") return;
          const id = location.pathname.split("/").at(-1), response = await fetch("/api/v0/chat/history_messages?chat_session_id=" + id);
          if (!response.ok) return;
          const result = await response.json(), messages = result.data?.biz_data?.chat_messages ?? [];
          parent = messages.at(-1)?.message_id ?? null;
          root.replaceChildren(...messages.map((m: any) => {
            const article = document.createElement("article"), markdown = document.createElement("div"); article.dataset.role = m.role.toLowerCase(); article.dataset.messageId = String(m.message_id);
            markdown.className = "ds-markdown"; markdown.textContent = m.fragments[0].content; article.append(markdown); return article;
          }));
        };
        void render();
        form.addEventListener("submit", async event => {
          event.preventDefault(); const editor = document.querySelector("textarea")!, prompt = editor.value; editor.value = "";
          if (location.pathname === "/") {
            const next = await (await fetch("/fixture/next-chat")).json(); window.history.pushState({}, "", "/a/chat/s/" + next.id);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const body = JSON.stringify({ chat_session_id: location.pathname.split("/").at(-1), parent_message_id: parent, prompt });
          try {
            if (xhr) await new Promise<void>((resolve, reject) => { const request = new XMLHttpRequest(); request.open("POST", "/api/v0/chat/completion"); request.onload = () => resolve(); request.onerror = reject; request.send(body); });
            else await (await fetch("/api/v0/chat/completion", { method: "POST", body })).text();
            await render();
          } catch { /* Reload interrupted the first request. */ }
        });
      }, { once: true });
    }, { xhr: locale === "en" });
    const revisions = async () => (await rows(panel)).filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.data);
    const game = async () => (await rows(panel)).find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame;
    const transfer = async (expectedScene: string) => {
      await chat.bringToFront(); await panel.reload();
      if (expectedScene !== initialScene) await panel.locator("summary").filter({ hasText: menuText(locale, "continue") }).click();
      const open = panel.getByRole("button", { name: copy.title, exact: true }); await expect(open).toBeVisible(); await open.click();
      const dialog = panel.getByRole("dialog", { name: copy.title }); await expect(dialog.locator("blockquote")).toHaveText(expectedScene);
      await dialog.getByRole("button", { name: copy.open, exact: true }).click();
      await expect(chat).toHaveURL(origin + "/"); await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    };
    const editor = chat.getByRole("textbox", { name: "Message", exact: true });
    const send = async (turn: number) => { await chat.bringToFront(); await editor.fill(drafts[turn]!); await chat.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => sent.length).toBe(turn + 1); };
    await chat.goto(f.binding.chatUrl); await transfer(initialScene);
    for (const turn of [0, 1]) {
      await send(turn); await expect.poll(async () => (await revisions()).length, { timeout: 12000 }).toBe((turn + 1) * 2);
    }
    const before = await game(), beforeRevisions = await revisions();
    expect(before.id).toBe(gameId); expect(before.activeChatId).toBe(second);
    expect(before.facts.map((f: any) => f.text).sort()).toEqual(mode === "automatic" ? [firstFact, secondFact].sort() : []);
    expect(before.pendingReviewIds).toHaveLength(mode === "automatic" ? 1 : 3);
    blocked.add(second); destination = third;
    await transfer(secondFact);
    expect(sent).toHaveLength(2); expect((await game()).activeChatId).toBe(second);
    await send(2);
    expect(sent[2]!.prompt).toContain(automationMarker(f.world)); expect(sent[2]!.prompt).toContain(secondFact);
    if (probe) {
      const sceneReference = sent[2]!.prompt.match(/<deeprole_handoff[^>]*>([\s\S]*?)<\/deeprole_handoff>/u)?.[1];
      expect(sceneReference).toContain(olderMove);
      expect(sceneReference).not.toContain(hearsay);
      expect(sent[2]!.prompt.endsWith(locationDraft)).toBe(true);
    }
    if (mode === "automatic") expect(sent[2]!.prompt).toContain(firstFact);
    if (recover) {
      histories.get(third)!.push(message(3, null, "USER", sent[2]!.prompt), message(4, 3, "ASSISTANT", replies[2]!));
      await chat.reload(); releaseThird();
    }
    await expect.poll(async () => (await revisions()).length, { timeout: 12000 }).toBe(6);
    const after = await game(); expect(after.id).toBe(gameId); expect(after.activeChatId).toBe(third);
    const reviewPage = await panel.evaluate(async ({ worldId, chatId }) => {
      const api = (globalThis as any).chrome, tabs = await api.tabs.query({});
      const tab = tabs.find((t: any) => t.url === "https://chat.deepseek.com/a/chat/s/" + chatId);
      return api.tabs.sendMessage(tab.id, { type: "DR_AUTOMATION_READ", input: { worldId, chatId, query: "" } });
    }, { worldId: f.world.id, chatId: third });
    expect(after.facts.map((f: any) => f.text).sort(), JSON.stringify(reviewPage)).toEqual(mode === "automatic" ? [firstFact, secondFact, thirdFact].sort() : []);
    expect(after.pendingReviewIds).toHaveLength(mode === "automatic" ? 1 : 4);
    for (const id of before.pendingReviewIds) expect(after.pendingReviewIds).toContain(id);
    for (const revision of beforeRevisions) expect(await revisions()).toContainEqual(revision);
    expect(reviewPage.ok).toBe(true); expect(reviewPage.data.total).toBe(mode === "automatic" ? 1 : 4);
    const inheritedItem = reviewPage.data.items.find((item: any) => item.text === uncertain);
    let resolvedGame = after;
    const manualDecisions = async () => (await rows(panel)).filter(r => r.kind === "story" && r.data.type === "event" && r.data.originEventId === inheritedItem.id && r.data.automation?.reason === "manual");
    if (decision) {
      await chat.bringToFront(); await panel.reload();
      await panel.setViewportSize({ width: 320, height: 540 });
      await panel.getByRole("navigation").getByRole("button", { name: navigationText(locale, "story"), exact: true }).click();
      const inbox = panel.getByRole("region", { name: storyAutomationText(locale).inbox, exact: true });
      const card = inbox.locator("article").filter({ hasText: uncertain });
      await expect(card).toBeVisible();
      await card.locator("summary").click();
      await expect(card.locator(".dr-story-review-source")).toHaveText(uncertain);
      const action = card.getByRole("button", { name: decision === "accept" ? storyAutomationText(locale).accept : storyAutomationText(locale).decline, exact: true });
      await expect(action).toBeEnabled();
      if (fail) {
        await worker.evaluate(() => {
          const put = IDBObjectStore.prototype.put;
          (globalThis as any).restoreReviewWrites = () => { IDBObjectStore.prototype.put = put; };
          (globalThis as any).failedReviewWrites = 0;
          IDBObjectStore.prototype.put = function(value: any, ...args: any[]) {
            const request = put.call(this, value, ...args);
            if (value.kind === "story" && value.data?.automation?.reason === "manual") {
              (globalThis as any).failedReviewWrites++; this.transaction.abort();
            }
            return request;
          };
        });
        const saved = (await rows(panel)).filter(r => ["story", "world", "entity"].includes(r.kind));
        await action.click(); await expect(inbox.getByRole("alert")).toBeVisible(); await expect(action).toBeEnabled();
        expect(await worker.evaluate(() => (globalThis as any).failedReviewWrites)).toBeGreaterThan(0);
        expect((await rows(panel)).filter(r => ["story", "world", "entity"].includes(r.kind))).toEqual(saved);
        expect(await manualDecisions()).toEqual([]); expect(sent).toHaveLength(3);
        await worker.evaluate(() => (globalThis as any).restoreReviewWrites());
      }
      await action.click(); await expect(card).toHaveCount(0);
      resolvedGame = await game();
      expect(resolvedGame.facts.map((f: any) => f.text).sort()).toEqual([...after.facts.map((f: any) => f.text), ...(decision === "accept" ? [uncertain] : [])].sort());
      expect(resolvedGame.pendingReviewIds ?? []).toEqual(after.pendingReviewIds.filter((id: string) => id !== inheritedItem.id));
      expect(resolvedGame.reviewResolutions[inheritedItem.id]).toBe(decision === "accept" ? "saved" : "dismissed");
      const resolutions = await manualDecisions(); expect(resolutions).toHaveLength(1);
      expect(resolutions[0]!.data.quote).toBe(uncertain);
      if (decision === "accept") expect(resolutions[0]!.data.memory).toMatchObject({ text: uncertain, quote: uncertain, kind: "plan" });
      expect(resolvedGame.id).toBe(gameId); expect((await revisions()).length).toBe(6); expect(sent).toHaveLength(3);
      expect(await inbox.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await send(3); expect(sent[3]!.prompt).toContain(automationMarker(f.world));
    if (mode === "automatic") for (const fact of [firstFact, secondFact, thirdFact]) expect(sent[3]!.prompt).toContain(fact);
    if (decision === "accept") expect(sent[3]!.prompt).toContain(uncertain);
    await expect.poll(async () => (await revisions()).length, { timeout: 12000 }).toBe(8);
    const finalRevisions = await revisions(), finalGame = await game(), priorReads = reads;
    expect(finalRevisions.map(r => r.content).sort()).toEqual([...drafts, ...replies].sort());
    expect(finalGame.facts).toEqual(resolvedGame.facts); expect(finalGame.pendingReviewIds).toEqual(resolvedGame.pendingReviewIds);
    await chat.reload(); await expect.poll(() => reads).toBeGreaterThan(priorReads);
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-story-game", "active"); await editor.fill("KEEP_THIRD_DRAFT");
    for (const old of [f.binding.chatId, second]) {
      const previous = await context.newPage(); await previous.goto(origin + "/a/chat/s/" + old);
      await expect(previous.getByText(oldChatNoticeText(locale).title, { exact: true })).toBeVisible();
      const openCurrent = previous.getByRole("link", { name: oldChatNoticeText(locale).open, exact: true });
      await expect(openCurrent).toHaveAttribute("href", origin + "/a/chat/s/" + third);
      await previous.close();
    }
    await expect.poll(revisions).toEqual(finalRevisions);
    expect((await game()).facts).toEqual(finalGame.facts); expect((await game()).pendingReviewIds).toEqual(finalGame.pendingReviewIds);
    expect((await game()).activeChatId).toBe(third); expect(sent.map(s => s.chat)).toEqual([second, second, third, third]);
    if (decision) {
      expect(await manualDecisions()).toHaveLength(1);
      expect((await game()).reviewResolutions[inheritedItem.id]).toBe(decision === "accept" ? "saved" : "dismissed");
      await chat.bringToFront(); await panel.reload();
      await panel.getByRole("navigation").getByRole("button", { name: navigationText(locale, "story"), exact: true }).click();
      const inbox = panel.getByRole("region", { name: storyAutomationText(locale).inbox, exact: true });
      await expect(inbox).toBeVisible(); await expect(inbox.locator("article").filter({ hasText: uncertain })).toHaveCount(0);
    }
    await expect(editor).toHaveValue("KEEP_THIRD_DRAFT");
  } finally { finishPending?.(); await context.close(); }
 });
}
