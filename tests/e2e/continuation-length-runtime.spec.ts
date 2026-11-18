import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { captureWorldGame } from "../../src/storage/world-game";
import { boundStory } from "../../src/core/story-continuation";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { automationMarker } from "../../src/core/story-automation";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";

const origin = "https://chat.deepseek.com", target = "length-target";
const html = '<!doctype html><html><head><style>main{margin:30px 30px 130px 360px}form{position:fixed;bottom:20px;left:360px}textarea{width:420px}</style></head><body><main><section id="conversation"></section><form><textarea aria-label="Message"></textarea><button>Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; };
}));
const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role,
  status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });

// Expectations frozen before the first run: docs/RP389-LONG-OPENING.md.
// Additional frozen expectations: docs/RP390-MEMORY-OVERFLOW.md.
for (const locale of ["ru", "en"] as const) for (const scenario of ["below", "exact", "over-edit", "over-reload", "over-home", "memory-only", "memory-reload", "session-blocked", "session-send"] as const) {
 test(`long continuation ${locale} ${scenario}`, async () => {
  test.setTimeout(90000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  let diagnosticPage: Page | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 2), copy = savedMemoryText(locale), memoryOnly = scenario.startsWith("memory-"), sessionFailure = scenario.startsWith("session-");
    f.world.contextBudget = 12000; f.entry.activation = "always";
    f.world.storyAutomation = { mode: "automatic", revision: "rp389-policy" };
    const lore = ["Mira owns the copper box; it must not leave the workshop.", "Nora may lend her lantern only after the ferry arrives.", "The blue key belongs to Leon, not Nora; no one has returned it."]
      .map((rule, i) => `PINNED_${i}_BEGIN ${rule}\n` + (`Archive ${i}: untouched fictional workshop inventory. `).repeat(memoryOnly ? 250 : 100) + `\nPINNED_${i}_END`);
    f.entry.content = lore[0]!;
    for (const [i, content] of lore.slice(1).entries()) f.records.push({ kind: "entry", id: "large-" + i, data: { ...f.entry, id: "large-" + i, title: "Archive " + i, content } });
    const savedScene = "LAST_SCENE_BEGIN: Nora is waiting for the answer at the ferry workshop. " + "The ferry is still absent. ".repeat(55) + "LAST_SCENE_END: No loan has occurred.";
    f.world.sharedGame = { ...captureWorldGame(f.records, f.world, f.binding), recentChatId: f.binding.chatId, recentStory: boundStory([{ role: "assistant", text: savedScene }], "history") };
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "rp389-seed" } });
    }, { records: f.records, locale });
    const fact = "Nora placed the silver token inside the copper box.";
    const replies = [fact + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: f.world.id, chat: target, facts: [{ text: fact, quote: fact, kind: "event", risk: "ordinary" }] }) + "</deeprole_characters>", "Nora nods. Nothing changes in the workshop."];
    const history: ReturnType<typeof message>[] = [], sent: string[] = [];
    await context.route(origin + "/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/history_messages")) {
        const id = url.searchParams.get("chat_session_id");
        if (id === f.binding.chatId) return route.fulfill({ status: 403, json: {} });
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: history.at(-1)?.message_id ?? null }, chat_messages: history } } } });
      }
      if (url.pathname.endsWith("/completion")) {
        const payload = route.request().postDataJSON(), turn = sent.length;
        expect(payload.chat_session_id).toBe(target); expect(payload.parent_message_id).toBe(turn ? 4 : null); expect(turn).toBeLessThan(2);
        sent.push(payload.prompt);
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
    diagnosticPage = chat;
    await chat.addInitScript(({ target, xhr }) => {
      (window as any).bridgeLog = [];
      window.addEventListener("message", event => {
        if (event.source !== window || !String(event.data?.source).startsWith("deeprole")) return;
        const { type, ok, reason, oversizedLength, length, draft, context, stage } = event.data;
        (window as any).bridgeLog.push({ type, ok, reason, oversizedLength, length, draftLength: typeof draft === "string" ? draft.length : undefined, contextLength: typeof context === "string" ? context.length : undefined, stage });
      });
      window.addEventListener("DOMContentLoaded", () => {
        const root = document.querySelector("#conversation")!, form = document.querySelector("form")!;
        let parent: number | null = null;
        const render = async () => {
          const response = await fetch("/api/v0/chat/history_messages?chat_session_id=" + target);
          if (!response.ok) return;
          const result = await response.json(), messages = result.data?.biz_data?.chat_messages ?? [];
          parent = messages.at(-1)?.message_id ?? null;
          root.replaceChildren(...messages.map((m: any) => {
            const article = document.createElement("article"), markdown = document.createElement("div"); article.dataset.role = m.role.toLowerCase(); article.dataset.messageId = String(m.message_id);
            markdown.className = "ds-markdown"; markdown.textContent = m.fragments[0].content; article.append(markdown); return article;
          }));
        };
        if (location.pathname.endsWith(target)) void render();
        form.addEventListener("submit", async event => {
          event.preventDefault(); const editor = form.querySelector("textarea")!, prompt = editor.value; editor.value = "";
          if (location.pathname === "/") { window.history.pushState({}, "", "/a/chat/s/" + target); await new Promise(resolve => setTimeout(resolve, 100)); }
          const body = JSON.stringify({ chat_session_id: target, parent_message_id: parent, prompt });
          try {
            // Navigation can update the page marker after the native send starts.
            const flags = document.documentElement.dataset;
            const previousStrict = flags.deeproleStrictMemory;
            if ((window as any).pendingTransferMarker) delete flags.deeproleStrictMemory;
            const pending = xhr ? new Promise<string>((resolve, reject) => { const request = new XMLHttpRequest(); request.open("POST", "/api/v0/chat/completion"); request.onload = () => resolve(request.responseText); request.onerror = reject; request.onabort = reject; request.send(body); })
              : fetch("/api/v0/chat/completion", { method: "POST", body }).then(r => r.text());
            if ((window as any).pendingTransferMarker && previousStrict !== undefined) flags.deeproleStrictMemory = previousStrict;
            (window as any).pendingTransferMarker = false;
            if ((window as any).concurrentDraft) { editor.value = (window as any).concurrentDraft; editor.dispatchEvent(new Event("input", { bubbles: true })); (window as any).concurrentDraft = ""; }
            await pending; await render();
          } catch { /* Expected local block before network. */ }
        });
      }, { once: true });
    }, { target, xhr: locale === "en" });
    await chat.goto(f.binding.chatUrl); await chat.bringToFront(); await panel.reload();
    await panel.getByRole("button", { name: copy.title, exact: true }).click();
    const dialog = panel.getByRole("dialog", { name: copy.title });
    await expect(dialog.locator("blockquote")).toHaveText(savedScene);
    await dialog.getByRole("button", { name: copy.open, exact: true }).click();
    await expect(chat).toHaveURL(origin + "/"); await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    const before = await rows(panel), editor = chat.getByRole("textbox", { name: "Message", exact: true }), notice = chat.locator(".dr-prompt-limit");
    const head = '  💡 "Wait" \\ map\nI examine Mira\'s copper box, ask Leon about his blue key, and tell Nora that I will borrow her lantern only if the ferry arrives. I do not take either object.\n';
    const tail = "\nThen I wait for Nora's answer.  ";
    const draft = (length: number) => { expect(length).toBeGreaterThan(head.length + tail.length); return head + "а".repeat(length - head.length - tail.length) + tail; };
    const submit = async (value: string) => { await chat.bringToFront(); await editor.fill(value); await chat.getByRole("button", { name: "Send", exact: true }).click(); };
    const count = async () => {
      await expect(notice.getByRole("alert")).toContainText(locale === "ru" ? "Сообщение не отправлено" : "Message not sent");
      const counts = (await notice.locator("p").innerText()).match(/[0-9][0-9,\u00a0\u202f]*/gu)!.map(v => Number(v.replace(/[^0-9]/gu, "")));
      expect(counts[1]).toBe(40000); return counts[0]!;
    };
    let accepted: string, acceptedSize: number | undefined;
    if (memoryOnly) {
      accepted = head + tail;
      await submit(accepted); expect(await count() - accepted.length).toBeGreaterThan(40000);
      expect(sent).toEqual([]); expect(await rows(panel)).toEqual(before); await expect(editor).toHaveValue(accepted);
      await notice.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).click();
      await chat.locator('.dr-memory-control > button[aria-haspopup="dialog"]').click();
      const memory = chat.getByRole("dialog", { name: locale === "ru" ? "Подключённая память" : "Selected memory", exact: true });
      const row = memory.locator("label.dr-entry").filter({ has: chat.locator("strong", { hasText: /^Archive 0$/ }) });
      await expect(row.getByRole("checkbox")).toBeChecked(); await row.getByRole("checkbox").click();
      await expect(row).toHaveCount(0);
      await memory.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).click();
      expect(await rows(panel)).toEqual(before);
      if (scenario === "memory-reload") await chat.reload();
      await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    } else if (sessionFailure) {
      accepted = head + tail;
      const failedDraft = scenario === "session-blocked" ? draft(39999) : accepted;
      await worker.evaluate(blocked => {
        const api = (globalThis as any).chrome.storage.session, original = api.set;
        (globalThis as any).failedDraftWrites = 0;
        (globalThis as any).restoreDraftWrites = () => { api.set = original; };
        api.set = function(values: Record<string, any>, ...args: any[]) {
          if (Object.values(values).some(value => value?.continuationDraft && (blocked ? value.continuationDraft.blockedLength : value.continuationDraft.promptDigest))) {
            (globalThis as any).failedDraftWrites++; return Promise.reject(Error("Synthetic session write refusal"));
          }
          return original.call(this, values, ...args);
        };
      }, scenario === "session-blocked");
      await chat.evaluate(en => {
        (window as any).pendingTransferMarker = true;
        if (en) (window as any).concurrentDraft = "NEW_DRAFT_KEEP";
      }, locale === "en");
      await submit(failedDraft);
      await expect.poll(() => worker.evaluate(() => (globalThis as any).failedDraftWrites)).toBeGreaterThan(0);
      const warning = chat.locator(".dr-send-storage");
      await expect(warning.getByRole("alert")).toContainText(locale === "ru" ? "Не удалось сохранить реплику" : "Could not save your message");
      await expect(warning).toContainText(locale === "ru" ? "Скопируйте" : "Copy");
      await warning.locator("summary").click(); await expect(warning.locator("textarea")).toHaveValue(failedDraft);
      await expect(editor).toHaveValue(locale === "en" ? "NEW_DRAFT_KEEP" : failedDraft);
      expect(sent).toEqual([]); expect(await rows(panel)).toEqual(before);
      await chat.setViewportSize({ width: 320, height: 470 }); await chat.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
      const bounds = (await warning.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(470);
      expect(await warning.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await warning.screenshot({ path: test.info().outputPath("storage-notice-320.png") });
      await chat.setViewportSize({ width: 1280, height: 900 });
      await worker.evaluate(() => (globalThis as any).restoreDraftWrites());
    } else {
    // Measurement uses the actual assembled request, not a mocked context or altered guard.
    const probe = draft(39999); await submit(probe); const overhead = await count() - probe.length;
    expect(overhead).toBeGreaterThan(15000); expect(overhead).toBeLessThan(35000);
    expect(sent).toEqual([]); expect(await rows(panel)).toEqual(before); await expect(editor).toHaveValue(probe);
    acceptedSize = scenario === "below" ? 39999 : 40000;
    if (scenario.startsWith("over-")) {
      const blocked = draft(40001 - overhead), concurrent = locale === "en" && scenario === "over-edit";
      if (concurrent) await chat.evaluate(() => { (window as any).concurrentDraft = "NEW_DRAFT_KEEP"; });
      await submit(blocked); await expect.poll(count).toBe(40001); expect(sent).toEqual([]); expect(await rows(panel)).toEqual(before);
      await expect(editor).toHaveValue(concurrent ? "NEW_DRAFT_KEEP" : blocked);
      await notice.locator("summary").click(); await expect(notice.locator("textarea")).toHaveValue(blocked);
      await chat.setViewportSize({ width: 320, height: 470 }); await chat.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
      const bounds = (await notice.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(470);
      expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (scenario === "over-reload") await notice.screenshot({ path: test.info().outputPath("length-notice-320.png") });
      await chat.setViewportSize({ width: 1280, height: 900 });
      if (scenario !== "over-edit") {
        if (scenario === "over-home") await chat.goto(origin + "/"); else await chat.reload();
        await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
        const restored = chat.locator(".dr-prompt-limit");
        await expect(restored).toBeVisible(); await restored.locator("summary").click();
        await expect(restored.locator("textarea")).toHaveValue(blocked);
        expect(sent).toEqual([]); expect(await rows(panel)).toEqual(before);
        if (scenario === "over-home") {
          await restored.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).click();
          await expect(restored).toHaveCount(0); await chat.reload();
          await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible(); await expect(restored).toHaveCount(0);
        }
      }
    }
    accepted = draft(acceptedSize - overhead);
    }
    await submit(accepted);
    await expect.poll(() => sent.length).toBe(1);
    if (acceptedSize !== undefined) expect(sent[0]).toHaveLength(acceptedSize);
    expect(sent[0]!.length).toBeLessThanOrEqual(40000); expect(sent[0]!.endsWith("\n\n[User message]\n" + accepted)).toBe(true);
    for (const [i, text] of lore.entries()) if (memoryOnly && i === 1) expect(sent[0]).not.toContain(text); else expect(sent[0]).toContain(text);
    expect(sent[0]).toContain(savedScene); expect(sent[0]).toContain(automationMarker(f.world));
    const revisions = async () => (await rows(panel)).filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.data);
    const game = async () => (await rows(panel)).find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame;
    await expect.poll(async () => (await revisions()).map(r => r.content).sort(), { timeout: 12000 }).toEqual([accepted, replies[0]].sort());
    expect((await game()).facts.map((f: any) => f.text)).toEqual([fact]);
    await expect(notice).toHaveCount(0);
    await expect(chat.locator(".dr-send-storage")).toHaveCount(0);
    const nextDraft = "Where is Nora's silver token?"; await submit(nextDraft);
    await expect.poll(() => sent.length).toBe(2); expect(sent[1]).toContain(fact);
    if (memoryOnly) expect(sent[1]).not.toContain(lore[1]);
    await expect.poll(async () => (await revisions()).map(r => r.content).sort()).toEqual([accepted, replies[0], nextDraft, replies[1]].sort());
    const saved = await revisions(); await chat.reload();
    await expect(chat.locator('[data-role="assistant"][data-message-id="6"]')).toBeVisible();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-story-game", "active");
    await editor.fill("NEW_DRAFT_KEEP"); await expect.poll(revisions).toEqual(saved); await expect(editor).toHaveValue("NEW_DRAFT_KEEP");
    expect((await game()).facts.map((f: any) => f.text)).toEqual([fact]); await expect(notice).toHaveCount(0); expect(sent).toHaveLength(2);
    const old = await context.newPage(); await old.goto(f.binding.chatUrl);
    await expect(old.getByRole("region", { name: oldChatNoticeText(locale).title, exact: true })).toBeVisible();
    await expect(old.getByRole("link", { name: oldChatNoticeText(locale).open, exact: true })).toHaveAttribute("href", origin + "/a/chat/s/" + target);
    expect((await game()).activeChatId).toBe(target); expect(await revisions()).toEqual(saved);
    expect((await rows(panel)).filter(r => ["entry", "entity"].includes(r.kind))).toEqual(before.filter(r => ["entry", "entity"].includes(r.kind)));
  } catch (error) {
    if (diagnosticPage) console.log("LENGTH_DIAGNOSTIC", JSON.stringify(await diagnosticPage.evaluate(() => ({ url: location.href, attrs: [...document.documentElement.attributes].filter(a => /diagnostic|failure|preparation/.test(a.name)).map(a => [a.name,a.value]), alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent), logs: (window as any).bridgeLog?.slice(-8) }))));
    throw error;
  } finally {
    await context.close();
  }
 });
}
