import { chromium, expect, test, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { continuationText } from "../../src/core/continuation-i18n";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { boundStory } from "../../src/core/story-continuation";
import { captureWorldGame } from "../../src/storage/world-game";

const html = '<!doctype html><html><head><style>body{background:#181818;color:#eee;font:14px system-ui}@media(prefers-color-scheme:light){body{background:#fff;color:#161616}}form{position:fixed;bottom:10px;left:10px}textarea{width:160px}</style></head><body><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; }; }));
const failTransferWrite = (worker: Worker) => worker.evaluate(() => {
 const original = IDBObjectStore.prototype.put;
 (globalThis as any).restoreChainWrites = () => { IDBObjectStore.prototype.put = original; };
 (globalThis as any).failedTransferWrites = 0;
 IDBObjectStore.prototype.put = function(value: any, ...args: any[]) {
  if (value.kind === "snapshot" && value.data?.appliedAt) {
   (globalThis as any).failedTransferWrites++;
   throw new DOMException("Synthetic receipt write failure", "UnknownError");
  }
  return original.call(this, value, ...args);
 };
});
for (const locale of ["ru", "en"] as const) for (const scenario of ["approve", "unchanged", "commit-failure", "receipt-failure", "opening-unavailable", "early-route", "early-route-commit-failure", "early-route-receipt-failure", "early-route-rejected", "old-chat-read-only", "early-route-quota", "saved-memory", "saved-memory-quota", "saved-memory-no-history", "saved-memory-commit-reload", "saved-memory-oversize", "saved-memory-oversize-home", "saved-memory-business-error", "saved-memory-stream-refusal", "saved-memory-redirect", "saved-memory-client-redirect", "saved-memory-route-race", "saved-memory-route-mismatch", "saved-memory-managed"] as const) {
 test(`full continuation chain ${locale} ${scenario}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3; shared UI has Firefox coverage"); test.setTimeout(90000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  try {
   const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
   await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
   const f = storyWorld(locale, 2), t = (key: Parameters<typeof continuationText>[1]) => continuationText(locale, key), recap = "FINAL_SCENE: Resident 2 waits for the answer. Do not replay delivery.", newFact = "APPROVED_CHAIN_FACT: The parcel has been delivered.";
   const commitFailure = scenario === "commit-failure" || scenario === "early-route-commit-failure";
   const receiptFailure = scenario === "receipt-failure" || scenario === "early-route-receipt-failure";
   f.world.contextBudget = 8000; f.entry.activation = "always";
   const sourceScene = structuredClone(f.binding.characterScenes![f.world.id]!);
   const savedMode = scenario.startsWith("saved-memory");
   const savedCommitReload = scenario === "saved-memory-commit-reload";
   const noHistory = scenario === "saved-memory-no-history" || savedCommitReload;
   const managed = scenario === "saved-memory-managed";
   const serverRedirect = scenario === "saved-memory-redirect" || managed;
   const clientRedirect = scenario === "saved-memory-client-redirect";
   const redirected = serverRedirect || clientRedirect;
   const fromPlay = noHistory || clientRedirect || scenario === "saved-memory-redirect" && locale === "ru";
   const multipleSaves = redirected && !clientRedirect;
   const oversizeHome = scenario === "saved-memory-oversize-home";
   const oversized = scenario === "saved-memory-oversize" || oversizeHome;
   const destination = oversizeHome ? "chain-retry" : "chain-target";
   const businessError = scenario === "saved-memory-business-error";
   const streamRefusal = scenario === "saved-memory-stream-refusal";
   const refused = businessError || streamRefusal;
   const wrongRoute = scenario === "saved-memory-route-mismatch";
   const routeRace = wrongRoute ? "unexpected-target" : scenario === "saved-memory-route-race" ? "chain-target" : "";
   const useXhr = locale === "en" && (refused || noHistory || oversized || redirected || routeRace);
   const concurrentDraft = locale === "en" && (oversized || streamRefusal) ? "A newer draft typed while preparing the request." : "";
   const earlyRoute = scenario.startsWith("early-route") || scenario === "saved-memory-quota" || refused || Boolean(concurrentDraft) || managed || oversizeHome || redirected && useXhr;
   const savedScene = "SAVED_SCENE: Mira waits by the blue clock. The key is still on the table.";
   if (savedMode) f.world.sharedGame = { ...captureWorldGame(f.records, f.world, f.binding), ...(managed ? { managed: true } : { recentChatId: f.binding.chatId, recentStory: boundStory([{ role: "assistant", text: savedScene }, { role: "user", text: "UNANSWERED: I leave the workshop." }], "history") }) };
   let otherGame: (typeof f.records)[number][] = [];
   if (multipleSaves) {
    const otherWorld = { ...f.world, id: "other-world", name: locale === "ru" ? "Другая игра у маяка" : "Another game by the lighthouse" };
    const otherBinding = { ...f.binding, id: "binding:other", chatId: "other", chatUrl: "https://chat.deepseek.com/chat/s/other", worldId: otherWorld.id, characterScenes: {} };
    otherWorld.sharedGame = { ...captureWorldGame([], otherWorld, otherBinding),
     recentChatId: otherBinding.chatId, recentStory: boundStory([{ role: "assistant", text: "OTHER_SCENE_NOT_SELECTED" }], "history") };
    otherGame = [{ kind: "world", id: otherWorld.id, data: otherWorld }, { kind: "binding", id: otherBinding.id, data: otherBinding }];
   }
   await panel.evaluate(async ({ records, locale }) => {
    await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
    await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "chain-seed" } });
   }, { records: [...f.records, ...otherGame], locale });
   const sent: { kind: string; prompt: string }[] = []; let homeAttempts = 0, redirects = 0, refusedHistoryReads = 0;
   await context.route("https://chat.deepseek.com/**", async route => {
    const url = route.request().url();
    if (serverRedirect && url === f.binding.chatUrl) {
     redirects++;
     return route.fulfill({ status: 302, headers: { location: "https://chat.deepseek.com/" } });
    }
    if (url.includes("/api/v0/chat/completion")) {
     const prompt = route.request().postDataJSON().prompt;
     sent.push({ kind: prompt.includes("[DeepRole Scene Handoff]") ? "summary" : prompt.startsWith("[DeepRole Service]") ? "analysis" : "game", prompt });
     if (sent.at(-1)!.kind === "game") {
      const before = await rows(panel);
      expect(before.find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame.activeChatId).toBe(f.binding.chatId);
      expect(before.some(r => r.kind === "binding" && [destination, "chain-target"].includes(r.data.chatId))).toBe(false);
     }
     const kind = sent.at(-1)!.kind;
     if (kind === "game" && businessError) return route.fulfill({ json: { code: 0, data: { biz_code: 1, biz_msg: "Usage limit reached", biz_data: null } } });
     if (kind === "game" && streamRefusal && sent.filter(request => request.kind === "game").length === 1) return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":3,"response_message_id":4}\n\nevent: hint\ndata: {"type":"error","finish_reason":"rate_limit_reached","content":"PRIVATE_PROVIDER_TEXT"}\n\nevent: close\ndata: {"click_behavior":"none"}\n\n' });
     if (kind === "game" && oversized && prompt.length > 40_000) return route.fulfill({ status: 413, json: { message: "Prompt too long" } });
     const status = kind === "analysis" && (scenario === "old-chat-read-only" || savedMode) ? 403 : kind === "game" && (scenario === "early-route-quota" || scenario === "saved-memory-quota") ? 429 : kind === "game" && scenario === "early-route-rejected" ? 503 : 200;
     if (kind === "game" && status === 200) {
      const terminal = managed || clientRedirect ? 'data: {"p":"response/status","o":"SET","v":"FINISHED"}\n\n' : 'event: finish\ndata: {}\n\n';
      const body = 'event: ready\ndata: {"request_message_id":3,"response_message_id":4}\n\n'
       + 'event: delta\ndata: ' + JSON.stringify({ wirePrompt: prompt }) + '\n\n'
       + terminal + 'event: close\ndata: {"click_behavior":"none","auto_resume":false}\n\n';
      return route.fulfill({ contentType: "text/event-stream", body });
     }
     return route.fulfill({ status, json: { wirePrompt: prompt } });
    }
    if (url.includes("/api/v0/chat/history_messages") && (noHistory || clientRedirect && new URL(url).searchParams.get("chat_session_id") === f.binding.chatId)) {
     refusedHistoryReads++;
     return route.fulfill({ status: 403, json: { message: "History unavailable" } });
    }
    if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { messages: [{ role: "user", content: "I deliver the parcel." }, { role: "assistant", fragments: [{ type: "THINK", content: "PRIVATE_REASONING_MUST_NOT_TRANSFER" }, { type: "RESPONSE", content: "The parcel has been delivered. Resident 2 waits for the answer." }] }] } });
    if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
    if (url === "https://chat.deepseek.com/") { homeAttempts++; if (scenario === "opening-unavailable") return route.fulfill({ status: 503, contentType: "text/html", body: "Temporarily unavailable" }); }
    return route.fulfill({ contentType: "text/html", body: html });
   });
   await context.addInitScript(({ source, recap, newFact, changes, earlyRoute, noHistory, checkRefusal, useXhr, concurrentDraft, routeRace, clientRedirect, resumeTarget, oversizeHome, locale }) => {
    window.addEventListener("DOMContentLoaded", async () => {
     const conversation = document.querySelector("#conversation"), form = document.querySelector("form"); if (!conversation || !form) return;
     if (clientRedirect && location.pathname.endsWith("/" + source)) {
      const response = await fetch("/api/v0/chat/history_messages?chat_session_id=" + source);
      if (response.status === 403) history.replaceState({}, "", "/");
     }
     if (oversizeHome && location.pathname === "/a/chat/s/chain-target") {
      sessionStorage.setItem("fixture-returned-home", "yes");
      if (locale === "ru") { location.replace("/"); return; }
      history.replaceState({}, "", "/");
     }
     const home = location.pathname === "/";
     const target = oversizeHome && sessionStorage.getItem("fixture-returned-home") ? "chain-retry" : "chain-target";
     const firstTurn = home || resumeTarget && location.pathname.endsWith("/chain-target");
     if (!home && noHistory && location.pathname.endsWith("/" + source)) {
      form.remove();
      void fetch("/api/v0/chat/history_messages?chat_session_id=" + source).then(response => {
       if (response.status === 403) conversation.textContent = "This old conversation is unavailable.";
      });
      return;
     }
     if (!firstTurn) conversation.innerHTML = '<article data-role="user" data-message-id="1">I deliver the parcel.</article><article data-role="assistant" data-message-id="2">The parcel has been delivered. Resident 2 waits for the answer.</article>';
     form.addEventListener("submit", async event => {
      event.preventDefault(); const composer = document.querySelector("textarea")!, prompt = composer.value; composer.value = "";
      const summary = prompt.includes("[DeepRole Scene Handoff]"), user = document.createElement("article"), answer = document.createElement("article");
      user.dataset.role = "user"; user.dataset.messageId = firstTurn ? "3" : summary ? "summary-user" : "analysis-user"; user.textContent = prompt;
      answer.dataset.role = "assistant"; answer.dataset.messageId = firstTurn ? "4" : summary ? "summary-answer" : "analysis-answer"; conversation.append(user, answer);
      // Live DeepSeek allocates the route before sending the first completion.
      // Keep the ordinary fixture too: neither route order may drop the recap.
      if (home && earlyRoute) { history.pushState({}, "", "/a/chat/s/" + target); await new Promise(resolve => setTimeout(resolve, 100)); }
      if (home && routeRace) {
       const allocateRoute = (event: MessageEvent) => {
        if (event.source !== window || event.data?.type !== "REQUEST_CONTEXT") return;
        window.removeEventListener("message", allocateRoute);
        history.pushState({}, "", "/a/chat/s/" + routeRace);
       };
       window.addEventListener("message", allocateRoute);
      }
      const url = "/api/v0/chat/completion", body = JSON.stringify({ prompt, chat_session_id: firstTurn ? target : source, parent_message_id: firstTurn ? null : 2 });
      const request = firstTurn && useXhr ? new Promise<Response>((resolve, reject) => {
       const xhr = new XMLHttpRequest();
       xhr.open("POST", url);
       xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status, headers: { "Content-Type": xhr.getResponseHeader("content-type") ?? "text/plain" } }));
       xhr.onerror = reject;
       xhr.send(body);
      }) : fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (home && concurrentDraft && (checkRefusal || prompt.length > 39_000)) {
       composer.value = concurrentDraft;
       composer.dispatchEvent(new Event("input", { bubbles: true }));
      }
      void request.then(async response => {
       if (home && checkRefusal) {
        const refused = response.headers.get("content-type")?.startsWith("text/event-stream")
         ? (await response.text()).includes("event: hint") : !!(await response.json()).data?.biz_code;
        if (!response.ok || refused) {
         answer.textContent = "The provider refused the first message.";
         return;
        }
       }
       if (firstTurn) {
        const text = await response.text();
        const wire = response.headers.get("content-type")?.startsWith("text/event-stream")
         ? text.split("\n").find(line => line.startsWith('data: {"wirePrompt":'))?.slice(6) : text;
        user.textContent = JSON.parse(wire ?? "{}").wirePrompt ?? prompt;
        answer.textContent = "Resident 2 nods, waiting for your answer.";
        history.pushState({}, "", "/chat/s/" + target);
       }
       else if (!response.ok) answer.textContent = "Start a new chat to continue.";
       else answer.textContent = '<deeprole_data>' + JSON.stringify(summary ? { type: "handoff", title: "Last moment", summary: recap } : { type: "memory-suggestions", items: changes ? [{ title: "Parcel delivered", content: newFact, keywords: ["parcel"], activation: "smart", priority: "normal" }] : [] }) + '</deeprole_data>';
      }).catch(() => { user.remove(); answer.remove(); });
     });
    }, { once: true });
   }, { source: f.binding.chatId, recap, newFact, changes: scenario !== "unchanged", earlyRoute, noHistory, checkRefusal: refused, useXhr, concurrentDraft, routeRace, clientRedirect, resumeTarget: streamRefusal || oversized && earlyRoute, oversizeHome, locale });
   const chat = await context.newPage();
   if (serverRedirect) {
    // Playwright's route handler covers the initial URL only. Intercept the
    // redirect destination separately so it also stays on the test fixture.
    const devtools = await context.newCDPSession(chat);
    devtools.on("Fetch.requestPaused", async event => {
     homeAttempts++;
     await devtools.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
      body: Buffer.from(html).toString("base64") });
    });
    await devtools.send("Fetch.enable", { patterns: [{ urlPattern: "https://chat.deepseek.com/", resourceType: "Document", requestStage: "Request" }] });
   }
   await chat.setViewportSize({ width: locale === "ru" ? 360 : 1280, height: 900 }); const initial = await chat.goto(f.binding.chatUrl); await chat.bringToFront();
   if (redirected) {
    expect(initial?.status()).toBe(200);
    await expect(chat).toHaveURL("https://chat.deepseek.com/");
    if (clientRedirect) expect(refusedHistoryReads).toBeGreaterThan(0);
   }
   else if (!noHistory) await expect(chat.locator(".dr-character-row")).toHaveCount(2);
   // Narrow layouts intentionally start with compact widget buttons.
   if (!noHistory && !redirected) {
    if (locale === "ru") await chat.locator('[data-restore-widget="meter"]').click();
    await chat.getByRole("button", { name: t("continue"), exact: true }).click();
   }
   if (savedMode) {
    const copy = savedMemoryText(locale);
    if (!noHistory && !redirected) {
     await expect(chat.locator("#conversation")).toContainText("Start a new chat to continue.");
     await expect(chat.getByRole("button", { name: t("continue"), exact: true })).toBeEnabled();
    }
    if (noHistory) await expect(chat.locator("#conversation")).toHaveText("This old conversation is unavailable.");
    const sourceRequests = noHistory || redirected ? [] : ["analysis"];
    if (locale === "ru" || noHistory || oversized || refused || redirected) await chat.setViewportSize({ width: 320, height: 660 });
    await chat.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
    const transfer = fromPlay ? panel : chat;
    if (fromPlay) {
     await panel.setViewportSize({ width: 320, height: 480 });
     await panel.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
     await panel.reload();
     await chat.bringToFront();
    }
    const restore = chat.locator('[data-restore-widget="scene"]');
    const openPreview = transfer.getByRole("button", { name: clientRedirect ? copy.viewScene : copy.title, exact: true });
    await expect((fromPlay ? openPreview : openPreview.or(restore)).filter({ visible: true })).toBeVisible({ timeout: 12_000 });
    const openTransfer = async () => {
     if (await openPreview.isVisible()) await openPreview.press("Enter", { timeout: 1000 });
     else if (!fromPlay) await restore.press("Enter", { timeout: 1000 });
    };
    const preview = transfer.getByRole("dialog", { name: copy.title });
    await expect(async () => {
     if (!await preview.isVisible()) await openTransfer();
     await expect(preview).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 8_000 });
    const dialog = transfer.getByRole("dialog", { name: copy.title });
    if (redirected) {
     expect(redirects).toBe(Number(serverRedirect));
    }
    if (multipleSaves) {
     await expect(dialog.locator("blockquote")).toHaveCount(0);
     const other = dialog.getByRole("button", { name: locale === "ru" ? "Другая игра у маяка" : "Another game by the lighthouse" });
     await other.press("Enter");
     await expect(dialog.locator("blockquote")).toHaveText("OTHER_SCENE_NOT_SELECTED");
     await dialog.getByRole("button", { name: copy.changeWorld }).press("Enter");
     const world = dialog.getByRole("button", { name: f.world.name, exact: true });
     expect((await world.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     await world.press("Enter");
     await expect(dialog.locator("strong").filter({ hasText: f.world.name })).toBeFocused();
     await transfer.setViewportSize({ width: 320, height: 480 });
     await transfer.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
     const box = await dialog.boundingBox();
     expect(box!.x).toBeGreaterThanOrEqual(0);
     expect(box!.x + box!.width).toBeLessThanOrEqual(320);
     expect(await dialog.locator(".dr-memory-dialog-body").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    if (clientRedirect) {
     await expect(dialog).not.toContainText(copy.chooseWorld);
     await expect(dialog).toContainText(f.world.name);
    }
    if (managed) await expect(dialog).toContainText(copy.empty);
    else {
     await expect(dialog.locator("blockquote")).toHaveText(savedScene);
     expect(await dialog.locator("blockquote").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await expect(dialog).not.toContainText("UNANSWERED");
    expect(sent.map(r => r.kind)).toEqual(sourceRequests);
    expect((await rows(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
    if (clientRedirect) {
     await transfer.keyboard.press("Escape");
     await expect(dialog).toHaveCount(0);
     const resume = panel.getByRole("button", { name: copy.resumeGame(f.world.name), exact: true });
     const textbox = chat.getByRole("textbox", { name: "Message", exact: true });
     const beforeDraft = await rows(panel);
     await textbox.fill("First finish this draft.");
     await resume.press("Enter");
     await expect(panel.getByRole("alert").filter({ hasText: copy.draft })).toBeVisible();
     await expect(textbox).toHaveValue("First finish this draft.");
     expect(await rows(panel)).toEqual(beforeDraft);
     await textbox.clear();
     await resume.press("Enter");
    } else await dialog.getByRole("button", { name: redirected ? copy.connect : copy.open, exact: true }).click();
    await expect(chat).toHaveURL("https://chat.deepseek.com/");
    if (redirected) {
     await expect(dialog).toHaveCount(0);
     expect(redirects).toBe(Number(serverRedirect));
     expect(homeAttempts).toBe(Number(serverRedirect));
    }
    await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    if (fromPlay) await expect(panel.getByRole("status").filter({ hasText: copy.queued })).toBeVisible();
    await chat.reload(); await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
    expect(sent.map(r => r.kind)).toEqual(sourceRequests);
    const before = await rows(panel), snapshot = before.find(r => r.kind === "snapshot").data;
    expect(snapshot).toMatchObject({ savedMemory: true });
    if (!managed) expect(snapshot.summary).toBe(savedScene);
    expect(snapshot.appliedAt).toBeUndefined();
    expect(before.find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame.activeChatId).toBe(f.binding.chatId);
    const composer = chat.getByRole("textbox", { name: "Message", exact: true });
    const draft = locale === "ru" ? "Я спрашиваю про синий ключ.\nТочная реплика RP363." : "I ask about the blue key.\nExact RP363 message.";
    if (oversized) {
     const original = ("а".repeat(39_999 - draft.length) + draft);
     await composer.fill(original);
     await chat.getByRole("button", { name: "Send", exact: true }).click();
     await expect(chat).toHaveURL(earlyRoute ? "https://chat.deepseek.com/a/chat/s/chain-target" : "https://chat.deepseek.com/");
     const notice = chat.locator(".dr-prompt-limit");
     await expect(notice.getByRole("alert")).toContainText(locale === "ru" ? "Сообщение не отправлено" : "Message not sent");
     const counts = (await notice.locator("p").innerText()).match(/[0-9][0-9,\u00a0\u202f]*/gu)?.map(value => Number(value.replace(/[^0-9]/gu, "")));
     expect(counts?.[0]).toBeGreaterThan(40_000);
     expect(counts?.[1]).toBe(40_000);
     await expect(composer).toHaveValue(concurrentDraft || original);
     expect(sent.map(r => r.kind)).toEqual(sourceRequests);
     expect(await rows(panel)).toEqual(before);
     await chat.setViewportSize({ width: 320, height: 470 });
     await chat.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
     const reveal = notice.locator("summary");
     await reveal.focus();
     await reveal.press("Enter");
     await expect(notice.locator("textarea")).toHaveValue(original);
     const bounds = await notice.boundingBox();
     expect(bounds!.x).toBeGreaterThanOrEqual(0);
     expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
     expect(bounds!.y).toBeGreaterThanOrEqual(0);
     expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(470);
     expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
     expect((await reveal.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     const dismiss = notice.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true });
     expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     await dismiss.press("Enter");
     await expect(notice).toHaveCount(0);
     await chat.reload();
     if (oversizeHome) {
      await expect(chat).toHaveURL("https://chat.deepseek.com/");
      const otherTab = await context.newPage();
      await otherTab.goto("https://chat.deepseek.com/");
      await expect(otherTab.locator("html")).toHaveAttribute("data-deeprole-context", "");
      await expect(otherTab.getByText(copy.queued, { exact: true })).toHaveCount(0);
      await otherTab.close();
     }
     await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
     expect(sent.map(r => r.kind)).toEqual(sourceRequests);
     expect(await rows(panel)).toEqual(before);
    }
    if (savedCommitReload) await failTransferWrite(worker);
    await composer.fill(draft);
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    if (wrongRoute) {
     await expect(chat).toHaveURL("https://chat.deepseek.com/a/chat/s/unexpected-target");
     await expect(chat.locator("#conversation article")).toHaveCount(0);
     expect(sent.map(r => r.kind)).toEqual(sourceRequests);
     expect(await rows(panel)).toEqual(before);
     return;
    }
    await expect(chat).toHaveURL(refused ? "https://chat.deepseek.com/a/chat/s/chain-target" : "https://chat.deepseek.com/chat/s/" + destination);
    if (refused) {
     await expect(chat.locator("#conversation")).toContainText("The provider refused the first message.");
     await expect(chat.getByText(t("sendUnconfirmed"), { exact: true })).toBeVisible();
     await chat.setViewportSize({ width: 320, height: 470 });
     await chat.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
     const notice = chat.locator(".dr-continuation-draft");
     await expect(notice).toBeVisible();
     await expect(notice).not.toContainText("PRIVATE_PROVIDER_TEXT");
     await notice.locator("summary").press("Enter");
     await expect(notice.locator("textarea")).toHaveValue(draft);
     await expect(composer).toHaveValue(concurrentDraft);
     const panelBounds = await notice.boundingBox();
     expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
     expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(320);
     expect(panelBounds!.y).toBeGreaterThanOrEqual(0);
     expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(470);
     expect(await notice.evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
     const dismiss = notice.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true });
     expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     await dismiss.press("Enter");
     await expect(notice).toHaveCount(0);
    }
    expect(sent.map(r => r.kind)).toEqual([...sourceRequests, "game"]);
    const wire = sent.at(-1)!.prompt;
    if (!managed) expect(wire).toContain(savedScene);
    expect(wire).toContain(f.entry.content);
    expect(wire).not.toContain("UNANSWERED");
    expect(wire.endsWith(draft)).toBe(true);
    if (oversized) expect(wire.length).toBeLessThanOrEqual(40_000);
    if (savedCommitReload) {
     const recovery = chat.getByRole("region", { name: t("commitTitle"), exact: true });
     const retry = recovery.getByRole("button", { name: t("commitRetry"), exact: true });
     const writes = () => worker.evaluate(() => (globalThis as any).failedTransferWrites as number);
     await expect(retry).toBeEnabled();
     const previousWrites = await writes();
     await chat.reload();
     await expect.poll(writes).toBe(previousWrites + 1);
     await expect(retry).toBeEnabled();
     await chat.setViewportSize({ width: 320, height: 470 });
     await chat.evaluate(() => { document.documentElement.style.fontSize = "125%"; });
     await retry.focus();
     await expect(retry).toBeFocused();
     await expect(retry).toBeInViewport({ ratio: 1 });
     const bounds = (await recovery.boundingBox())!;
     expect(bounds.x).toBeGreaterThanOrEqual(0);
     expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
     expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
     expect(await recovery.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
     await chat.screenshot({ path: info.outputPath("transfer-retry.png") });
     expect((await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeUndefined();
     expect(sent.map(r => r.kind)).toEqual([...sourceRequests, "game"]);

     await worker.evaluate(() => (globalThis as any).restoreChainWrites());
     const unrelated = await context.newPage();
     await unrelated.goto("https://chat.deepseek.com/a/chat/s/unrelated");
     await expect(unrelated.locator("html")).toHaveAttribute("data-deeprole-context", "");
     await expect(unrelated.getByRole("region", { name: t("commitTitle"), exact: true })).toHaveCount(0);
     expect((await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeUndefined();
     await unrelated.goto("https://chat.deepseek.com/a/chat/s/chain-target");
     await expect(unrelated.locator("html")).toHaveAttribute("data-deeprole-context", "");
     await expect(unrelated.getByRole("region", { name: t("commitTitle"), exact: true })).toHaveCount(0);
     expect((await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeUndefined();
     await unrelated.close();
     await chat.reload();
     await expect.poll(async () => (await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeTruthy();
     await expect(recovery).toHaveCount(0);
     expect(sent.map(r => r.kind)).toEqual([...sourceRequests, "game"]);
    }
    if (scenario === "saved-memory-quota" || refused) {
      if (refused) {
       await chat.reload();
       await expect(chat.locator("deeprole-page-widget")).toBeAttached();
      }
      const stored = await rows(panel);
      expect({
       targetBound: stored.some(row => row.kind === "binding" && row.data.chatId === "chain-target"),
       applied: Boolean(stored.find(row => row.kind === "snapshot").data.appliedAt),
       activeChatId: stored.find(row => row.kind === "world").data.sharedGame.activeChatId,
      }).toEqual({ targetBound: false, applied: false, activeChatId: f.binding.chatId });
      if (streamRefusal) {
       await expect(chat.getByText(copy.queued, { exact: true })).toBeVisible();
       expect(sent.map(r => r.kind)).toEqual([...sourceRequests, "game"]);
       await composer.fill(draft);
       await chat.getByRole("button", { name: "Send", exact: true }).click();
       await expect.poll(async () => (await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeTruthy();
       expect(sent.map(r => r.kind)).toEqual([...sourceRequests, "game", "game"]);
       expect(sent.at(-1)!.prompt).toContain(f.entry.content);
       expect(sent.at(-1)!.prompt.endsWith(draft)).toBe(true);
       const game = (await rows(panel)).find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame;
       expect(game.activeChatId).toBe("chain-target");
      }
    } else {
      await expect.poll(async () => (await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeTruthy();
      const after = await rows(panel);
      const game = after.find(r => r.kind === "world" && r.id === f.world.id).data.sharedGame;
      expect(game.activeChatId).toBe(destination);
      if (oversizeHome) expect(after.some(row => row.kind === "binding" && row.data.chatId === "chain-target")).toBe(false);
      if (redirected) {
       expect(redirects).toBe(Number(serverRedirect));
       expect(wire).not.toContain("OTHER_SCENE_NOT_SELECTED");
       expect(after.filter(row => ["other-world", "binding:other"].includes(row.id))).toEqual(before.filter(row => ["other-world", "binding:other"].includes(row.id)));
      }
      expect(game.scene.states).toEqual(sourceScene.states);
      if (managed || clientRedirect) {
       await chat.reload();
       await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", new RegExp(f.entry.content));
       expect((await rows(panel)).find(row => row.kind === "world" && row.id === f.world.id).data.sharedGame.activeChatId).toBe("chain-target");
      }
    }
    return;
   }
   if (scenario === "old-chat-read-only") {
    // Characterize the current gap: readable history and saved state exist,
    // but a refusal to send in the source chat prevents the standard transfer.
    await expect.poll(() => sent.map(r => r.kind)).toEqual(["analysis"]);
    await expect(chat.getByRole("button", { name: t("continue"), exact: true })).toBeEnabled();
    await expect(chat.locator(".dr-memory-review")).toHaveCount(0);
    await expect(chat).toHaveURL(f.binding.chatUrl);
    const stored = await rows(panel);
    expect(homeAttempts).toBe(0);
    expect(stored.filter(r => r.kind === "snapshot")).toHaveLength(0);
    expect(stored.find(r => r.kind === "entry")?.data).toEqual(f.entry);
    expect(stored.find(r => r.kind === "world")?.data.sharedGame.activeChatId).toBe(f.binding.chatId);
    return;
   }
   if (scenario === "unchanged") {
    const progress = chat.getByRole("region", { name: t("title"), exact: true }); await expect(progress).toContainText(t("readyToSummarize"));
    expect(sent.map(r => r.kind)).toEqual(["analysis"]); expect((await rows(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
    await progress.getByRole("button", { name: t("startSummary"), exact: true }).click();
   } else {
    const review = chat.locator(".dr-memory-review"); await expect(review).toBeVisible();
    expect(sent.map(r => r.kind)).toEqual(["analysis"]); expect(homeAttempts).toBe(0); expect((await rows(panel)).filter(r => r.kind === "entry")).toHaveLength(1);
    await chat.reload(); await expect(review).toBeVisible(); expect(sent.map(r => r.kind)).toEqual(["analysis"]);
    await review.getByRole("button", { name: locale === "ru" ? "Выбрать все" : "Select all", exact: true }).click();
    if (commitFailure) await failTransferWrite(worker);
    if(receiptFailure)await worker.evaluate(()=>{
     const area=(globalThis as any).chrome.storage.session,original=area.set.bind(area);
     (globalThis as any).restoreChainWrites=()=>{area.set=original;};
     area.set=async(patch:any)=>{if(Object.values(patch).some((v:any)=>v?.continuationReceipt))throw Error("Synthetic session receipt failure");return original(patch);};
    });
    await review.getByRole("button", { name: new RegExp("^" + t("saveContinue")) }).click();
   }
   await expect.poll(() => homeAttempts).toBe(1);
   await expect.poll(async () => (await rows(panel)).filter(r => r.kind === "snapshot").length).toBe(1);
   const checkpoint = (await rows(panel)).find(r => r.kind === "snapshot").data;
   expect(checkpoint.summary).toBe(recap); expect(checkpoint.characterScene.states).toEqual(sourceScene.states);
   expect(sent.filter(r => r.kind === "analysis")).toHaveLength(1); expect(sent.filter(r => r.kind === "summary")).toHaveLength(1);
   if (scenario !== "unchanged") expect(sent.find(r => r.kind === "summary")!.prompt).toContain(newFact);
   if (scenario === "opening-unavailable") {
    expect(sent.filter(r => r.kind === "game")).toHaveLength(0); expect(checkpoint.appliedAt).toBeUndefined();
    expect((await rows(panel)).find(r => r.kind === "world").data.sharedGame.activeChatId).toBe(f.binding.chatId);
    await chat.goto(f.binding.chatUrl); if (!noHistory) await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    expect((await rows(panel)).find(r => r.kind === "snapshot").data.summary).toBe(recap);
    return;
   }
   await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/chain-target");
   if (scenario === "early-route-rejected" || scenario === "early-route-quota") {
    await expect(chat.locator('[data-message-id="4"]')).toContainText("Resident 2 nods");
    const rejected = await rows(panel);
    expect(sent.filter(r => r.kind === "game")).toHaveLength(1);
    expect(sent.find(r => r.kind === "game")!.prompt).toContain(recap);
    expect(rejected.find(r => r.kind === "snapshot").data.appliedAt).toBeUndefined();
    expect(rejected.find(r => r.kind === "world").data.sharedGame.activeChatId).toBe(f.binding.chatId);
    expect(rejected.some(r => r.kind === "binding" && r.data.chatId === "chain-target")).toBe(false);
    return;
   }
   if (commitFailure || receiptFailure) {
    const retry = chat.getByRole("button", { name: locale === "ru" ? "Завершить сохранение переноса" : "Finish saving transfer", exact: true });
    await expect(retry).toBeVisible(); expect((await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeUndefined();
    expect((await rows(panel)).find(r=>r.kind==="world").data.sharedGame.activeChatId).toBe(f.binding.chatId);
    expect((await rows(panel)).some(r=>r.kind==="binding"&&r.data.chatId==="chain-target")).toBe(false);
    // A persisted receipt survives reload; unavailable session storage can only
    // retain the accepted target in this page until storage works again.
    if(commitFailure){await chat.reload(); await expect(retry).toBeVisible();expect((await rows(panel)).find(r=>r.kind==="world").data.sharedGame.activeChatId).toBe(f.binding.chatId);}
    const posted=sent.length;
    expect(await chat.evaluate(()=>fetch("/api/v0/chat/completion",{method:"POST",body:JSON.stringify({chat_session_id:"chain-target",prompt:"Do not duplicate the transfer"})}).then(()=>true,()=>false))).toBe(false);
    expect(sent).toHaveLength(posted);
    expect(await chat.evaluate(()=>new Promise(resolve=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/v0/chat/completion");xhr.onload=()=>resolve("sent");xhr.onerror=()=>resolve("blocked");xhr.send(JSON.stringify({chat_session_id:"chain-target",prompt:"Do not duplicate via XHR"}));}))).toBe("blocked");
    expect(sent).toHaveLength(posted);
    expect(await chat.evaluate(()=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/v0/chat/completion",false);try{xhr.send(JSON.stringify({prompt:"Do not duplicate via sync XHR"}));return "sent";}catch(error){return(error as DOMException).name;}})).toBe("InvalidStateError");
    expect(sent).toHaveLength(posted);
    await retry.click();await expect(chat.getByText(t("commitFailed"),{exact:true})).toBeVisible();await expect(retry).toBeVisible();expect(sent).toHaveLength(posted);
    await worker.evaluate(() => (globalThis as any).restoreChainWrites());
    if (scenario === "early-route-commit-failure") await chat.reload();
    else await retry.click();
    await expect(retry).toHaveCount(0);
   }
   await expect.poll(async () => (await rows(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeTruthy();
   await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-transfer-pending","active");
   const final = await rows(panel), game = final.find(r => r.kind === "world").data.sharedGame;
   expect(game.activeChatId).toBe("chain-target"); expect(game.scene.states).toEqual(sourceScene.states); expect(game.recentStory.turns).toEqual([{ role: "assistant", text: recap }]);
   expect(final.filter(r => r.kind === "entry")).toHaveLength(scenario === "unchanged" ? 1 : 2);
   for (const person of f.entities) expect(final.find(r => r.kind === "entity" && r.id === person.id).data).toEqual(person);
   const gameplay = sent.filter(r => r.kind === "game"); expect(gameplay).toHaveLength(1); expect(gameplay[0]!.prompt).toContain(recap); expect(gameplay[0]!.prompt).toContain(f.entry.content); expect(gameplay[0]!.prompt).not.toContain("PRIVATE_REASONING_MUST_NOT_TRANSFER");
   if(!commitFailure){
    expect(await chat.locator('[data-message-id="3"]').textContent()).toContain(recap);
    await expect(chat.locator('[data-message-id="3"]')).not.toContainText(recap,{useInnerText:true});
   }
  } finally { await context.close(); }
 });
}
