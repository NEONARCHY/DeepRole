import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { captureWorldGame } from "../../src/storage/world-game";
import { boundStory } from "../../src/core/story-continuation";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { automationMarker } from "../../src/core/story-automation";

const origin = "https://chat.deepseek.com", target = "followup-target";
const html = '<!doctype html><html><head><style>main{margin:30px 30px 130px 360px}form{position:fixed;bottom:20px;left:360px}textarea{width:420px}</style></head><body><main><section id="conversation"></section><form><textarea aria-label="Message"></textarea><button>Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; };
}));
const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role,
  status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });

for (const locale of ["ru", "en"] as const) for (const scenario of ["recovered-auto", "recovered-review", "direct-auto", "direct-review", "ooc-to-game", "game-to-ooc", "direct-late-history"] as const) {
 test(`continuation followup ${locale} ${scenario}`, async () => {
  test.setTimeout(60000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  let finishPending: (() => void) | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 2), copy = savedMemoryText(locale), review = scenario.endsWith("review"), ooc = scenario === "ooc-to-game";
    const toggle = ooc || scenario === "game-to-ooc", recovered = !scenario.startsWith("direct");
    const lateHistory = scenario === "direct-late-history";
    let historyAvailable = !lateHistory;
    f.world.contextBudget = 8000; f.world.bracketedOoc = ooc; f.entry.activation = "always";
    f.world.storyAutomation = { mode: review ? "review" : "automatic", revision: "rp386-policy" };
    const savedScene = "Nora waits at the ferry workshop. The copper box is empty.";
    f.world.sharedGame = { ...captureWorldGame(f.records, f.world, f.binding), recentChatId: f.binding.chatId, recentStory: boundStory([{ role: "assistant", text: savedScene }], "history") };
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "rp386-seed" } });
    }, { records: f.records, locale });
    const firstFact = "Nora placed the silver token inside the copper box.";
    const uncertain = "If the ferry arrives, Nora may lend the lantern.";
    const secondFact = "Nora placed the wooden seal inside the green drawer.";
    const reply = (facts: { text: string; risk: string; kind: string }[]) => facts.map(f => f.text).join("\n") + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: f.world.id, chat: target,
      facts: facts.map(f => ({ ...f, quote: f.text })) }) + "</deeprole_characters>";
    const replies = [reply([{ text: firstFact, kind: "event", risk: "ordinary" }, { text: uncertain, kind: "plan", risk: "uncertain" }]), reply([{ text: secondFact, kind: "event", risk: "ordinary" }])];
    const firstDraft = toggle ? "[Tell me where Nora puts the silver token.]" : "  I watch Nora store the silver token.\n";
    const nextDraft = "I look inside Nora's copper box for the silver token, then ask her to store the wooden seal.";
    const history: ReturnType<typeof message>[] = [], sent: string[] = [];
    let releaseFirst!: () => void, historyReads = 0;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    finishPending = releaseFirst;
    await context.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/history_messages")) {
        const id = url.searchParams.get("chat_session_id");
        if (id === f.binding.chatId) return route.fulfill({ status: 403, json: {} });
        historyReads++;
        if (history.length && !historyAvailable) return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: history.at(-1)?.message_id ?? null }, chat_messages: history } } } });
      }
      if (url.pathname.endsWith("/completion")) {
        const payload = route.request().postDataJSON(), turn = sent.length;
        expect(payload.chat_session_id).toBe(target); expect(payload.parent_message_id).toBe(turn ? 4 : null);
        expect(turn).toBeLessThan(2); sent.push(payload.prompt);
        if (turn === 0 && recovered) {
          await firstGate;
          try { await route.abort("failed"); } catch { /* Unloaded source document. */ }
          return;
        }
        const user = turn ? 5 : 3, answer = user + 1;
        history.push(message(user, turn ? 4 : null, "USER", payload.prompt), message(answer, user, "ASSISTANT", replies[turn]!));
        return route.fulfill({ contentType: "text/event-stream", body:
          "event: ready\ndata: " + JSON.stringify({ request_message_id: user, response_message_id: answer }) + "\n\n"
          + "data: " + JSON.stringify({ p: "response/content", o: "APPEND", v: replies[turn] }) + "\n\n"
          + 'data: {"p":"response/status","o":"SET","v":"FINISHED"}\n\nevent: close\ndata: {"auto_resume":false}\n\n' });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: html });
    });
    const chat = await context.newPage();
    await chat.addInitScript(({ target, xhr }) => {
      window.addEventListener("DOMContentLoaded", () => {
        const root = document.querySelector("#conversation")!, form = document.querySelector("form")!;
        let parent: number | null = null;
        const render = async () => {
          const response = await fetch("/api/v0/chat/history_messages?chat_session_id=" + target);
          if (!response.ok) return;
          const result = await response.json();
          const messages = result.data?.biz_data?.chat_messages ?? [];
          parent = messages.at(-1)?.message_id ?? null;
          root.replaceChildren(...messages.map((m: any) => {
            const article = document.createElement("article"), markdown = document.createElement("div");
            article.dataset.role = m.role.toLowerCase(); article.dataset.messageId = String(m.message_id);
            markdown.className = "ds-markdown"; markdown.textContent = m.fragments[0].content; article.append(markdown); return article;
          }));
        };
        if (location.pathname.endsWith(target)) void render();
        form.addEventListener("submit", async event => {
          event.preventDefault(); const editor = document.querySelector("textarea")!, prompt = editor.value; editor.value = "";
          if (location.pathname === "/") { window.history.pushState({}, "", "/a/chat/s/" + target); await new Promise(resolve => setTimeout(resolve, 100)); }
          const body = JSON.stringify({ chat_session_id: target, parent_message_id: parent, prompt });
          try {
            const stream = xhr ? await new Promise<string>((resolve, reject) => { const request = new XMLHttpRequest(); request.open("POST", "/api/v0/chat/completion"); request.onload = () => resolve(request.responseText); request.onerror = reject; request.send(body); })
              : await (await fetch("/api/v0/chat/completion", { method: "POST", body })).text();
            const ready = stream.split("\n").find(line => line.startsWith('data: {"request_message_id":'));
            if (ready) parent = JSON.parse(ready.slice(6)).response_message_id;
            await render();
          } catch { /* Reload interrupted the first request. */ }
        });
      }, { once: true });
    }, { target, xhr: locale === "en" });
    await chat.goto(f.binding.chatUrl); await chat.bringToFront(); await panel.reload();
    const open = panel.getByRole("button", { name: copy.title, exact: true });
    await expect(open).toBeVisible(); await open.click();
    const dialog = panel.getByRole("dialog", { name: copy.title });
    await expect(dialog.locator("blockquote")).toHaveText(savedScene);
    await dialog.getByRole("button", { name: copy.open, exact: true }).click();
    await expect(chat).toHaveURL(origin + "/");
    await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    const editor = chat.getByRole("textbox", { name: "Message", exact: true });
    await chat.bringToFront(); await editor.fill(firstDraft); await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    if (toggle) await panel.evaluate(async ({ worldId, enabled }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onsuccess = () => {
        const db = open.result, tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"), read = store.get("world:" + worldId);
        read.onsuccess = () => store.put({ ...read.result, data: { ...read.result.data, bracketedOoc: enabled } });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
    }, { worldId: f.world.id, enabled: !ooc });
    if (recovered) {
      history.push(message(3, null, "USER", sent[0]!), message(4, 3, "ASSISTANT", replies[0]!));
      await chat.reload(); releaseFirst();
    }
    const revisions = async () => (await rows(panel)).filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.data);
    const game = async () => (await rows(panel)).find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame;
    if (lateHistory) {
      const recovery = chat.locator(".dr-continuation-draft");
      await expect(recovery).toBeVisible();
      const check = recovery.getByRole("button", { name: locale === "ru" ? "Проверить ответ DeepSeek" : "Check DeepSeek response", exact: true });
      await expect(check).toBeEnabled();
      expect(await revisions()).toEqual([]); expect((await game()).activeChatId).toBe(f.binding.chatId); expect(sent).toHaveLength(1);
      historyAvailable = true; await check.click();
    }
    await expect.poll(async () => (await revisions()).map(r => r.content).sort(), { timeout: 12000 }).toEqual([firstDraft, replies[0]].sort());
    const firstRevisions = await revisions(), firstGame = await game();
    expect(firstRevisions.map(r => r.storyPurpose)).toEqual([ooc ? "out-of-character" : "game", ooc ? "out-of-character" : "game"]);
    expect(firstGame.facts.map((f: any) => f.text)).toEqual(ooc || review ? [] : [firstFact]);
    expect(firstGame.pendingReviewIds ?? []).toHaveLength(ooc ? 0 : review ? 2 : 1);
    await editor.fill(nextDraft); await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]).toContain(automationMarker(f.world));
    if (!ooc && !review) expect(sent[1]).toContain(firstFact);
    await expect.poll(async () => (await revisions()).map(r => r.content).sort(), { timeout: 12000 }).toEqual([firstDraft, replies[0], nextDraft, replies[1]].sort());
    const after = await game();
    expect(after.facts.map((f: any) => f.text).sort()).toEqual((review ? [] : ooc ? [secondFact] : [firstFact, secondFact]).sort());
    expect(after.pendingReviewIds ?? []).toHaveLength(review ? 3 : ooc ? 0 : 1);
    for (const id of firstGame.pendingReviewIds ?? []) expect(after.pendingReviewIds).toContain(id);
    const saved = await revisions(), previousReads = historyReads;
    await chat.reload();
    await expect(chat.locator('[data-role="assistant"][data-message-id="6"]')).toBeVisible();
    await expect.poll(() => historyReads).toBeGreaterThan(previousReads);
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-story-game", "active");
    await editor.fill("NEW_DRAFT_KEEP");
    await expect.poll(revisions).toEqual(saved);
    expect((await game()).facts).toEqual(after.facts); expect((await game()).pendingReviewIds).toEqual(after.pendingReviewIds);
    expect(sent).toHaveLength(2); await expect(editor).toHaveValue("NEW_DRAFT_KEEP");
  } finally { finishPending?.(); await context.close(); }
 });
}
