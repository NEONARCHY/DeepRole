import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { captureWorldGame } from "../../src/storage/world-game";
import { boundStory } from "../../src/core/story-continuation";
import { openSavedPreview } from "./continuation-helpers";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { automationMarker } from "../../src/core/story-automation";
import { storyUpdateText } from "../../src/core/story-update-i18n";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
import type { ChatBinding, WorldProfile } from "../../src/core/types";

const origin = "https://chat.deepseek.com", target = "followup-target";
const html = '<!doctype html><html><head><style>main{margin:30px 30px 130px 360px}form{position:fixed;bottom:20px;left:360px}textarea{width:420px}</style></head><body><main><section id="conversation"></section><form><textarea aria-label="Message"></textarea><button>Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; };
}));
const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role,
  status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });

function addSecondTabGame(fixture: ReturnType<typeof storyWorld>, independent: boolean) {
  const world: WorldProfile = independent ? { id: "harbor", name: "Harbor", description: "The harbor bell is brass.", color: "#485745",
    contextBudget: 2000, relevanceThreshold: 6, createdAt: 10, updatedAt: 20 } : fixture.world;
  const binding = (chatId: string): ChatBinding => ({ id: "binding:" + chatId, chatId, chatUrl: origin + "/a/chat/s/" + chatId,
    worldId: world.id, focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 10, updatedAt: 20 });
  if (independent) {
    const source = binding("harbor-current");
    world.sharedGame = captureWorldGame(fixture.records, world, source);
    fixture.records.push({ kind: "world", id: world.id, data: world }, { kind: "binding", id: source.id, data: source });
  }
  const previous = binding("second-tab");
  fixture.records.push({ kind: "binding", id: previous.id, data: previous });
  return { world, previous };
}

for (const locale of ["ru", "en"] as const) for (const scenario of ["recovered-auto", "recovered-review", "direct-auto", "direct-review", "ooc-to-game", "game-to-ooc", "direct-late-history", "direct-no-update", "direct-switch-same", "direct-switch-other"] as const) {
 test(`continuation followup ${locale} ${scenario}`, async () => {
  test.setTimeout(60000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  let finishPending: (() => void) | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    await expect(panel.locator(".onboarding")).toBeVisible({ timeout: 15000 });
    const f = storyWorld(locale, 2), copy = savedMemoryText(locale), review = scenario.endsWith("review"), ooc = scenario === "ooc-to-game";
    const toggle = ooc || scenario === "game-to-ooc", recovered = !scenario.startsWith("direct");
    const lateHistory = scenario === "direct-late-history";
    const missingUpdate = scenario === "direct-no-update";
    let historyAvailable = !lateHistory;
    f.world.contextBudget = 8000; f.world.bracketedOoc = ooc; f.entry.activation = "always";
    f.world.storyAutomation = { mode: review ? "review" : "automatic", revision: "rp386-policy" };
    const savedScene = "Nora waits at the ferry workshop. The copper box is empty.";
    f.world.sharedGame = { ...captureWorldGame(f.records, f.world, f.binding), recentChatId: f.binding.chatId, recentStory: boundStory([{ role: "assistant", text: savedScene }], "history") };
    const secondGame = scenario.startsWith("direct-switch") ? addSecondTabGame(f, scenario === "direct-switch-other") : undefined;
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
    if (missingUpdate) replies[0] = firstFact;
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
        if (secondGame && id === secondGame.previous.chatId) return route.fulfill({ json: { code: 0, data: { biz_code: 0,
          biz_data: { chat_session: { id, current_message_id: null }, chat_messages: [] } } } });
        historyReads++;
        if (history.length && !historyAvailable) return route.fulfill({ status: 503, json: {} });
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: history.at(-1)?.message_id ?? null }, chat_messages: history } } } });
      }
      if (url.pathname.endsWith("/completion")) {
        const payload = route.request().postDataJSON(), turn = sent.length;
        expect(payload.chat_session_id).toBe(target); expect(payload.parent_message_id).toBe(turn ? 4 : null);
        expect(turn).toBeLessThan(2); sent.push(payload.prompt);
        if (turn === 0 && secondGame) await firstGate;
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
    await openSavedPreview(panel, locale);
    const dialog = panel.getByRole("dialog", { name: copy.title });
    await expect(dialog.locator("blockquote")).toHaveText(savedScene);
    await dialog.getByRole("button", { name: copy.open, exact: true }).click();
    await expect(chat).toHaveURL(origin + "/");
    await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    const editor = chat.getByRole("textbox", { name: "Message", exact: true });
    await chat.bringToFront(); await editor.fill(firstDraft); await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    if (secondGame) {
      await expect(chat.getByText(copy.waitingForReply, { exact: true })).toBeVisible();
      const second = await context.newPage();
      await second.goto(secondGame.previous.chatUrl);
      await second.bringToFront();
      const notice = oldChatNoticeText(locale);
      const otherEditor = second.getByRole("textbox", { name: "Message", exact: true });
      await otherEditor.fill("Unsent text from the second tab.");
      const stay = second.getByRole("region", { name: notice.title }).getByRole("button", { name: notice.stay });
      await expect(stay).toBeVisible();
      await stay.click();
      const activeGame = async (worldId: string) => (await rows(panel)).find(row => row.kind === "world" && row.id === worldId).data.sharedGame;
      await expect.poll(async () => (await activeGame(secondGame.world.id)).activeChatId).toBe(secondGame.previous.chatId);
      await expect(stay).toHaveCount(0);
      if (secondGame.world.storyAutomation) await expect(second.locator("html")).toHaveAttribute("data-deeprole-story-game", "active");
      const secondBeforeResponse = await activeGame(secondGame.world.id);
      expect(history).toHaveLength(0);
      expect(sent[0]).toContain(f.entry.content);
      releaseFirst();
      await expect(chat.locator('[data-role="assistant"][data-message-id="4"]')).toContainText(firstFact);
      const distinctWorlds = secondGame.world.id !== f.world.id;
      if (distinctWorlds) {
        await expect.poll(async () => (await activeGame(f.world.id)).activeChatId).toBe(target);
        expect((await activeGame(f.world.id)).facts.map((fact: any) => fact.text)).toEqual([firstFact]);
      } else {
        await expect(chat.locator(".dr-continuation-draft")).toBeVisible({ timeout: 12000 });
        expect((await rows(panel)).some(row => row.kind === "binding" && row.data.chatId === target)).toBe(false);
      }
      await chat.reload();
      await expect(chat.locator('[data-role="assistant"][data-message-id="4"]')).toContainText(firstFact);
      if (distinctWorlds) {
        await expect(chat.locator("html")).toHaveAttribute("data-deeprole-story-game", "active");
      } else {
        const retained = chat.locator(".dr-continuation-draft");
        await expect(retained).toContainText(copy.movedGame);
        await expect(chat.getByText(copy.queued, { exact: true })).toHaveCount(0);
        await chat.bringToFront(); await panel.reload();
        await expect(panel.getByText(copy.movedGame, { exact: true })).toBeVisible({ timeout: 12000 });
        await expect(panel.getByText(copy.queued, { exact: true })).toHaveCount(0);
        await panel.setViewportSize({ width: 320, height: 470 });
        await panel.addStyleTag({ content: "html { font-size: 125% }" });
        const activeLink = panel.getByRole("link", { name: locale === "ru" ? "Открыть активный чат" : "Open active chat" });
        await expect(activeLink).toHaveAttribute("href", secondGame.previous.chatUrl);
        await activeLink.focus();
        await chat.setViewportSize({ width: 320, height: 470 });
        await chat.addStyleTag({ content: "html { font-size: 125% }" });
        await retained.locator("summary").focus();
        await retained.locator("summary").press("Enter");
        await expect(retained.getByRole("textbox")).toHaveValue(firstDraft);
        for (const colorScheme of ["light", "dark"] as const) {
          await panel.emulateMedia({ colorScheme });
          expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect((await activeLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          await panel.screenshot({ path: test.info().outputPath("active-chat-" + colorScheme + ".png") });
          await chat.emulateMedia({ colorScheme });
          const box = await retained.boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(320);
          expect(await retained.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
          for (const action of await retained.locator("button, summary").all()) {
            await action.focus();
            const bounds = await action.boundingBox();
            expect(bounds!.height).toBeGreaterThanOrEqual(44);
            expect(bounds!.width).toBeGreaterThanOrEqual(44);
          }
          await retained.locator("summary").focus();
          await retained.screenshot({ path: test.info().outputPath("transfer-" + colorScheme + ".png") });
        }
      }
      const after = await rows(panel);
      const targetBindings = after.filter(row => row.kind === "binding" && row.data.chatId === target);
      expect(targetBindings.map(row => row.data.worldId)).toEqual(distinctWorlds ? [f.world.id] : []);
      const revisions = after.filter(row => row.kind === "story" && row.data.type === "revision");
      expect(revisions.map(row => row.data.content).sort()).toEqual(distinctWorlds ? [firstDraft, replies[0]].sort() : []);
      expect(await activeGame(secondGame.world.id)).toEqual(secondBeforeResponse);
      await expect(otherEditor).toHaveValue("Unsent text from the second tab.");
      expect(sent).toHaveLength(1);
      return;
    }
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
    expect(firstGame.facts.map((f: any) => f.text)).toEqual(ooc || review || missingUpdate ? [] : [firstFact]);
    expect(firstGame.pendingReviewIds ?? []).toHaveLength(ooc || missingUpdate ? 0 : review ? 2 : 1);
    if (missingUpdate) {
      expect(sent[0]).toContain(f.entry.content);
      await panel.reload();
      const preview = panel.locator(".dr-memory-status");
      await expect(preview.getByRole("status")).toHaveText(storyUpdateText(locale, "missing"), { timeout: 12000 });
      await panel.setViewportSize({ width: 320, height: 470 });
      await panel.addStyleTag({ content: "html { font-size: 125% } .dr-memory-status { zoom: 1.25 }" });
      const inspect = preview.getByRole("button", { expanded: false });
      await inspect.focus(); await inspect.press("Enter");
      for (const colorScheme of ["light", "dark"] as const) {
        await panel.emulateMedia({ colorScheme });
        await expect(preview.locator(".dr-memory-preview-list")).toContainText(f.entry.content);
        const toggle = preview.getByRole("button", { expanded: true });
        const box = await toggle.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= 320
          && document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const notice = preview.getByRole("status");
        await notice.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
        expect(await notice.evaluate(el => {
          const rect = el.getBoundingClientRect(), x = rect.left + rect.width / 2;
          return [rect.top + 2, rect.bottom - 2].every(y => el.contains(document.elementFromPoint(x, y)));
        })).toBe(true);
        await panel.screenshot({ path: test.info().outputPath("preview-" + colorScheme + ".png") });
      }
      await chat.bringToFront();
    }
    await editor.fill(nextDraft); await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1]).toContain(automationMarker(f.world));
    if (!ooc && !review && !missingUpdate) expect(sent[1]).toContain(firstFact);
    await expect.poll(async () => (await revisions()).map(r => r.content).sort(), { timeout: 12000 }).toEqual([firstDraft, replies[0], nextDraft, replies[1]].sort());
    const after = await game();
    expect(after.facts.map((f: any) => f.text).sort()).toEqual((review ? [] : ooc || missingUpdate ? [secondFact] : [firstFact, secondFact]).sort());
    expect(after.pendingReviewIds ?? []).toHaveLength(review ? 3 : ooc || missingUpdate ? 0 : 1);
    if (missingUpdate) {
      await panel.reload();
      await expect(panel.locator(".dr-memory-status")).toBeVisible();
      await expect(panel.locator(".dr-memory-status")).not.toContainText(storyUpdateText(locale, "missing"));
    }
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
