import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { nativeReplyPayload } from "../fixtures/story-native-reply";
import { captureStoryBaselineEffects } from "../../src/core/story-baseline-effects";

async function readRecords(panel: Page) {
  return panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), rows = tx.objectStore("records").getAll(); rows.onsuccess = () => resolve(rows.result); rows.onerror = () => reject(rows.error); tx.oncomplete = () => db.close(); };
  }));
}
for (const locale of ["ru", "en"] as const) for (const transport of ["xhr", "fetch"] as const) test(`installed durable source journal ${locale} ${transport}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Real MV3 repository RPC; pure bridge/storage are covered separately"); test.setTimeout(60_000);
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    const fixture = storyWorld(locale);
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false }, deeprole_library_change: { token: "synthetic-capture-seed" } });
    }, { records: fixture.records, locale });
    let requests = 0; const outgoing: string[] = [];
    await context.route("https://chat.deepseek.com/**", async route => {
      if (route.request().url().endsWith("/api/v0/chat/completion")) {
        requests++; outgoing.push(route.request().postDataJSON().prompt);
        return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":42,"response_message_id":43}\n\ndata: {"v":"PRIVATE_REPLY_PRIVATE_REASONING"}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' });
      }
      if (route.request().url().includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><h1>Synthetic workshop</h1><form><textarea aria-label="Message"></textarea><button type="button">Send</button></form></main></body></html>' });
    });
    const chat = await context.newPage(); await chat.goto(fixture.binding.chatUrl!); await chat.bringToFront();
    await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    await chat.setViewportSize({ width: 320, height: 950 });
    const before = (await readRecords(panel)).filter(row => row.kind !== "dispatch");
    await chat.evaluate(async transport => {
      const body = JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: 41, prompt: "PRIVATE_ORIGINAL_DRAFT", token: "PRIVATE_TOKEN" });
      if (transport === "xhr") await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.onerror = () => reject(Error("synthetic-network-error")); xhr.send(body); });
      else { const response = await fetch("/api/v0/chat/completion", { method: "POST", body }); if (response.bodyUsed) throw Error("bridge consumed reply"); }
    }, transport);
    await expect.poll(async () => (await readRecords(panel)).filter(row => row.kind === "dispatch").map(row => ({ started: row.data.started, delivery: row.data.delivery, wire: row.data.wire.phase }))).toEqual([
      { started: true, delivery: { status: "accepted", httpStatus: 200 }, wire: transport === "xhr" ? "closed" : "waiting" },
    ]);
    const capture = (await readRecords(panel)).find(row => row.kind === "dispatch").data;
    expect(capture).toMatchObject({ purpose: "user-turn", origin: "local", originalDraft: "PRIVATE_ORIGINAL_DRAFT", injection: "context", sceneRevision: "legacy-scene-a", transport, identity: { chatId: "synthetic-a", nativeParentKey: '["message","41"]' } });
    expect(outgoing).toEqual([`${capture.proposedContext}\n\n[User message]\n${capture.originalDraft}`]);
    expect(JSON.stringify(capture)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_REPLY|PRIVATE_REASONING/);
    if (transport === "xhr") expect(capture.wire).toEqual({ phase: "closed", sawFinish: true, issue: null, link: { requestId: capture.id, chatId: "synthetic-a", nativeParentKey: '["message","41"]', userMessageKey: '["message","42"]', assistantMessageKey: '["message","43"]' } });
    // Reload never promotes a capture into a selected story event or resends the model call.
    await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    const after = await readRecords(panel); expect(after.find(row => row.kind === "dispatch").data).toEqual(capture);
    expect(after.filter(row => row.kind !== "dispatch")).toEqual(before); expect(requests).toBe(1);
    expect(after.some(row => row.kind === "story")).toBe(false);
  } finally { await context.close(); }
});

for (const locale of ["ru", "en"] as const) for (const mode of ["success", "reload", "wrong-source"] as const) test(`installed exact response source ${locale} ${mode}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 driver, no personal account"); test.setTimeout(60_000);
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    await context.addInitScript(() => {
      // The existing context meter also reads this endpoint on reload. Attribute
      // actual GETs to their bridge trigger; don't count it as a second reply probe.
      let purpose = "unknown"; const reads: string[] = []; (window as any).syntheticHistoryReadPurposes = reads;
      window.addEventListener("message", event => { if (event.source === window && event.data?.source === "deeprole-extension") purpose = event.data.type; });
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (...args) => { const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : args[0].href; if (url.includes("/api/v0/chat/history_messages")) reads.push(purpose); return nativeFetch(...args); };
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const fixture = storyWorld(locale);
    if (mode === "success") {
      const scene = fixture.binding.characterScenes![fixture.world.id]!;
      scene.lastReply = "synthetic-before-checkpoint"; scene.progress = { status: "changed", rejected: 0 }; scene.relationshipNotice = "limited";
      scene.portraitCycles = { [fixture.entities[0]!.id]: { neutral: { key: "synthetic-cycle", order: [0], cursor: 0 } } };
      fixture.binding.scenePhotos = [{ worldId: fixture.world.id, entityId: fixture.entities[0]!.id, messageKey: "synthetic-before-message", turnKey: "synthetic-before-turn", categoryId: "ordinary", imageKey: "synthetic-before-image", createdAt: 20 }];
    }
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false }, deeprole_library_change: { token: "synthetic-reply-seed" } });
    }, { records: fixture.records, locale });
    let modelRequests = 0, historyReads = 0, outgoing = "", allowComplete = mode !== "reload", nextTurn = false;
    await context.route("https://chat.deepseek.com/**", async route => {
      if (route.request().url().endsWith("/api/v0/chat/completion")) {
        modelRequests++; outgoing = route.request().postDataJSON().prompt;
        if (nextTurn) {
          // Pre-send authority must exist before the native server sees this POST.
          const rows = await readRecords(panel), capture = rows.find(r => r.kind === "dispatch" && r.data.originalDraft === "PRIVATE_NEXT_USER_DRAFT").data;
          expect(rows.find(r => r.kind === "story" && r.id === capture.id).data).toMatchObject({ type: "request", branchId: capture.storyBranchId,
            delivery: { status: "prepared" }, nativeParentKey: '["message","43"]', parentRevisionId: null, selectedHeadRevisionId: null, selectionVersion: 0 });
          return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":44,"response_message_id":45}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' });
        }
        return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":42,"response_message_id":43}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' });
      }
      if (route.request().url().includes("/api/v0/chat/history_messages") && outgoing) {
        historyReads++; expect(route.request().method()).toBe("GET");
        const payload = nativeReplyPayload(mode === "wrong-source" ? "PRIVATE_OTHER_USER_TEXT" : outgoing);
        if (nextTurn) {
          payload.data.biz_data.chat_messages[2]!.message_id = 44; payload.data.biz_data.chat_messages[2]!.parent_id = 43;
          payload.data.biz_data.chat_messages[3]!.message_id = 45; payload.data.biz_data.chat_messages[3]!.parent_id = 44;
          payload.data.biz_data.chat_messages[3]!.fragments = [{ type: "THINK", content: "PRIVATE_NEXT_THOUGHTS" }, { type: "RESPONSE", content: "The clock starts ticking." }];
        }
        // Deliberately show that the stored final source need not be the server-selected variant.
        payload.data.biz_data.chat_session.current_message_id = 99;
        if (!allowComplete) payload.data.biz_data.chat_messages[3]!.status = "WIP";
        return route.fulfill({ json: payload });
      }
      if (route.request().url().includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><h1>Synthetic workshop</h1><form><textarea aria-label="Message"></textarea><button type="button">Send</button></form></main></body></html>' });
    });
    const chat = await context.newPage(); await chat.goto(fixture.binding.chatUrl!); await chat.bringToFront(); await chat.setViewportSize({ width: 320, height: 950 }); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    const before = (await readRecords(panel)).filter(row => row.kind !== "dispatch");
    await chat.evaluate(async () => { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.onerror = () => reject(Error("synthetic-network-error")); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: 41, prompt: "PRIVATE_DRAFT [User message] literal", token: "PRIVATE_TOKEN" })); }); });
    const replyReads = () => chat.evaluate(() => (window as any).syntheticHistoryReadPurposes.filter((p: string) => p === "NATIVE_STORY_REPLY_REQUEST").length);
    await expect.poll(replyReads).toBe(1); expect(historyReads).toBeGreaterThanOrEqual(1);
    if (mode === "reload") {
      expect((await readRecords(panel)).find(row => row.kind === "dispatch").data.reply).toBeUndefined();
      allowComplete = true; await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    }
    if (mode !== "wrong-source") {
      await expect.poll(async () => (await readRecords(panel)).find(row => row.kind === "dispatch")?.data.reply?.assistant.content).toBe("Мира передала ключ. Mira delivered the key.");
      const capture = (await readRecords(panel)).find(row => row.kind === "dispatch").data;
      expect(capture.reply.serverSelection).toBe("different"); expect(capture.originalDraft).toBe("PRIVATE_DRAFT [User message] literal"); expect(JSON.stringify(capture)).not.toMatch(/THOUGHTS|EARLIER|FOREIGN_BRANCH|PRIVATE_TOKEN|wireUserText/);
      expect(outgoing).toBe(`${capture.proposedContext}\n\n[User message]\n${capture.originalDraft}`);
      expect(await replyReads()).toBe(1);
      await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2); expect((await readRecords(panel)).find(row => row.kind === "dispatch").data).toEqual(capture);
      expect(await replyReads()).toBe(0);
    } else {
      await expect.poll(async () => (await readRecords(panel)).find(row => row.kind === "dispatch")?.data.wire.phase).toBe("closed");
      expect((await readRecords(panel)).find(row => row.kind === "dispatch").data.reply).toBeUndefined();
      expect(await replyReads()).toBe(1);
    }
    expect(modelRequests).toBe(1);
    expect((await readRecords(panel)).filter(row => row.kind !== "dispatch")).toEqual(before);
    if (mode === "success") {
      // Real content -> background port and vault-owned repository, not fixture-only UI.
      const read = await panel.evaluate(async () => {
        const [tab] = await (globalThis as any).chrome.tabs.query({ active: true, currentWindow: true });
        return (globalThis as any).chrome.tabs.sendMessage(tab.id, { type: "DR_STORY_CHECKPOINT_READ" });
      });
      expect(read.ok).toBe(true); expect(read.data).toMatchObject({ chatId: fixture.binding.chatId, worldId: fixture.world.id, availableCount: 1, checkpoint: null });
      expect(read.data.candidates[0]).toMatchObject({ draft: "PRIVATE_DRAFT [User message] literal", answer: "Мира передала ключ. Mira delivered the key.", serverSelection: "different" });
      expect(JSON.stringify(read.data)).not.toMatch(/THOUGHTS|FOREIGN_BRANCH|PRIVATE_TOKEN|proposedContext/);
      const data = read.data, choice = { chatId: data.chatId, worldId: data.worldId, bindingId: data.bindingId, requestId: data.candidates[0].requestId, expectedSceneRevision: data.sceneRevision, expectedSnapshot: data.snapshot };
      const save = await panel.evaluate(async choice => {
        const [tab] = await (globalThis as any).chrome.tabs.query({ active: true, currentWindow: true });
        return (globalThis as any).chrome.tabs.sendMessage(tab.id, { type: "DR_STORY_CHECKPOINT_SAVE", choice });
      }, choice);
      expect(save.ok).toBe(true); const rows = await readRecords(panel), story = rows.filter(row => row.kind === "story"); expect(story).toHaveLength(2);
      expect(story.find(row => row.data.type === "baseline").data).toMatchObject({ snapshot: data.snapshot, legacyEffects: captureStoryBaselineEffects(fixture.binding, fixture.world.id), origin: { nativeAnchor: { nativeMessageKey: '["message","43"]', role: "assistant" } } });
      expect(story.find(row => row.data.type === "branch").data).toMatchObject({ id: save.data.branchId, headRevisionId: null, selectionVersion: 0 });
      expect(rows.filter(row => !["dispatch", "story"].includes(row.kind))).toEqual(before); expect(modelRequests).toBe(1); expect(await replyReads()).toBe(0);
      nextTurn = true;
      await chat.evaluate(async () => { await new Promise<void>((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.onerror = () => reject(Error("synthetic-network-error")); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: 43, prompt: "PRIVATE_NEXT_USER_DRAFT" })); }); });
      await expect.poll(async () => (await readRecords(panel)).filter(r => r.kind === "story" && r.data.type === "revision").length).toBe(2);
      const observed = await readRecords(panel), revisions = observed.filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.data);
      const user = revisions.find(r => r.role === "user"), assistant = revisions.find(r => r.role === "assistant");
      expect(user).toMatchObject({ content: "PRIVATE_NEXT_USER_DRAFT", nativeMessageKey: '["message","44"]', parentRevisionId: null });
      expect(assistant).toMatchObject({ content: "The clock starts ticking.", nativeMessageKey: '["message","45"]', parentRevisionId: user.id, completion: "complete" });
      expect(observed.filter(r => r.kind === "story")).toHaveLength(5);
      expect(observed.find(r => r.kind === "story" && r.data.type === "branch").data).toMatchObject({ headRevisionId: null, selectionVersion: 0 });
      expect(observed.filter(r => !["dispatch", "story"].includes(r.kind))).toEqual(before); expect(modelRequests).toBe(2);
      expect(JSON.stringify(revisions)).not.toMatch(/PRIVATE_NEXT_THOUGHTS|deeprole_context|THOUGHTS|FOREIGN_BRANCH/);
      const review = await panel.evaluate(async () => {
        const [tab] = await (globalThis as any).chrome.tabs.query({ active: true, currentWindow: true });
        return (globalThis as any).chrome.tabs.sendMessage(tab.id, { type: "DR_STORY_REVIEW_READ", cursor: null });
      });
      expect(review.ok).toBe(true); expect(review.data.guard).toMatchObject({ headRevisionId: null, selectionVersion: 0, revisionCount: 2 }); expect(review.data.entries).toHaveLength(2);
      expect(review.data.entries.find((e: any) => e.role === "assistant")).toMatchObject({ id: assistant.id, content: "The clock starts ticking.", parentExcerpt: "PRIVATE_NEXT_USER_DRAFT", selected: false, appliedCount: 0 });
      const preview = await panel.evaluate(async input => {
        const [tab] = await (globalThis as any).chrome.tabs.query({ active: true, currentWindow: true });
        return (globalThis as any).chrome.tabs.sendMessage(tab.id, { type: "DR_STORY_REVIEW_PREVIEW", input });
      }, { chatId: review.data.chatId, worldId: review.data.worldId, guard: review.data.guard, headRevisionId: assistant.id });
      expect(preview.ok).toBe(true); expect(preview.data).toMatchObject({ snapshot: data.snapshot, addedEvents: 0, removedEvents: 0, manualConflict: false });
      expect(await readRecords(panel)).toEqual(observed); expect(modelRequests).toBe(2);
      await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
      expect((await readRecords(panel)).filter(r => r.kind === "story")).toEqual(observed.filter(r => r.kind === "story"));
      expect(modelRequests).toBe(2); expect(await replyReads()).toBe(0);
    }
  } finally { await context.close(); }
});
