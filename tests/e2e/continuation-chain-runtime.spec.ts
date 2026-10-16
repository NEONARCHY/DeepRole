import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { continuationText } from "../../src/core/continuation-i18n";

const html = '<!doctype html><html><head><style>body{background:#181818;color:#eee;font:14px system-ui}form{position:fixed;bottom:10px;left:10px}textarea{width:160px}</style></head><body><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>';
const rows = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, read = db.transaction("records").objectStore("records").getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; }; }));
for (const locale of ["ru", "en"] as const) for (const scenario of ["approve", "unchanged", "commit-failure", "receipt-failure", "opening-unavailable", "early-route", "early-route-commit-failure", "early-route-receipt-failure", "early-route-rejected"] as const) {
 test(`full continuation chain ${locale} ${scenario}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3; shared UI has Firefox coverage"); test.setTimeout(90000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  try {
   const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
   await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
   const f = storyWorld(locale, 2), t = (key: Parameters<typeof continuationText>[1]) => continuationText(locale, key), recap = "FINAL_SCENE: Resident 2 waits for the answer. Do not replay delivery.", newFact = "APPROVED_CHAIN_FACT: The parcel has been delivered.";
   const commitFailure = scenario === "commit-failure" || scenario === "early-route-commit-failure";
   const receiptFailure = scenario === "receipt-failure" || scenario === "early-route-receipt-failure";
   f.world.contextBudget = 8000; f.entry.activation = "always";
   const sourceScene = structuredClone(f.binding.characterScenes![f.world.id]!);
   await panel.evaluate(async ({ records, locale }) => {
    await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
    await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "chain-seed" } });
   }, { records: f.records, locale });
   const sent: { kind: string; prompt: string }[] = []; let homeAttempts = 0;
   await context.route("https://chat.deepseek.com/**", async route => {
    const url = route.request().url();
    if (url.includes("/api/v0/chat/completion")) {
     const prompt = route.request().postDataJSON().prompt;
     sent.push({ kind: prompt.includes("[DeepRole Scene Handoff]") ? "summary" : prompt.startsWith("[DeepRole Service]") ? "analysis" : "game", prompt });
     if (sent.at(-1)!.kind === "game") {
      const before = await rows(panel);
      expect(before.find(r => r.kind === "world").data.sharedGame.activeChatId).toBe(f.binding.chatId);
      expect(before.some(r => r.kind === "binding" && r.data.chatId === "chain-target")).toBe(false);
     }
     return route.fulfill({ status: sent.at(-1)!.kind === "game" && scenario === "early-route-rejected" ? 503 : 200, json: { wirePrompt: prompt } });
    }
    if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { messages: [{ role: "user", content: "I deliver the parcel." }, { role: "assistant", fragments: [{ type: "THINK", content: "PRIVATE_REASONING_MUST_NOT_TRANSFER" }, { type: "RESPONSE", content: "The parcel has been delivered. Resident 2 waits for the answer." }] }] } });
    if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
    if (url === "https://chat.deepseek.com/") { homeAttempts++; if (scenario === "opening-unavailable") return route.fulfill({ status: 503, contentType: "text/html", body: "Temporarily unavailable" }); }
    return route.fulfill({ contentType: "text/html", body: html });
   });
   await context.addInitScript(({ source, recap, newFact, changes, earlyRoute }) => {
    window.addEventListener("DOMContentLoaded", () => {
     const conversation = document.querySelector("#conversation"), form = document.querySelector("form"); if (!conversation || !form) return;
     const home = location.pathname === "/";
     if (!home) conversation.innerHTML = '<article data-role="user" data-message-id="1">I deliver the parcel.</article><article data-role="assistant" data-message-id="2">The parcel has been delivered. Resident 2 waits for the answer.</article>';
     form.addEventListener("submit", async event => {
      event.preventDefault(); const composer = document.querySelector("textarea")!, prompt = composer.value; composer.value = "";
      const summary = prompt.includes("[DeepRole Scene Handoff]"), user = document.createElement("article"), answer = document.createElement("article");
      user.dataset.role = "user"; user.dataset.messageId = home ? "3" : summary ? "summary-user" : "analysis-user"; user.textContent = prompt;
      answer.dataset.role = "assistant"; answer.dataset.messageId = home ? "4" : summary ? "summary-answer" : "analysis-answer"; conversation.append(user, answer);
      // Live DeepSeek allocates the route before sending the first completion.
      // Keep the ordinary fixture too: neither route order may drop the recap.
      if (home && earlyRoute) { history.pushState({}, "", "/a/chat/s/chain-target"); await new Promise(resolve => setTimeout(resolve, 100)); }
      void fetch("/api/v0/chat/completion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, chat_session_id: home ? "chain-target" : source }) }).then(async response => {
       if (home) { user.textContent=(await response.json()).wirePrompt;answer.textContent = "Resident 2 nods, waiting for your answer."; history.pushState({}, "", "/chat/s/chain-target"); }
       else answer.textContent = '<deeprole_data>' + JSON.stringify(summary ? { type: "handoff", title: "Last moment", summary: recap } : { type: "memory-suggestions", items: changes ? [{ title: "Parcel delivered", content: newFact, keywords: ["parcel"], activation: "smart", priority: "normal" }] : [] }) + '</deeprole_data>';
      });
     });
    }, { once: true });
   }, { source: f.binding.chatId, recap, newFact, changes: scenario !== "unchanged", earlyRoute: scenario.startsWith("early-route") });
   const chat = await context.newPage(); await chat.setViewportSize({ width: locale === "ru" ? 360 : 1280, height: 900 }); await chat.goto(f.binding.chatUrl); await chat.bringToFront();
   await expect(chat.locator(".dr-character-row")).toHaveCount(2);
   // Narrow layouts intentionally start with compact widget buttons.
   if(locale==="ru")await chat.locator('[data-restore-widget="meter"]').click();
   await chat.getByRole("button", { name: t("continue"), exact: true }).click();
   if (scenario === "unchanged") {
    const progress = chat.getByRole("region", { name: t("title"), exact: true }); await expect(progress).toContainText(t("readyToSummarize"));
    expect(sent.map(r => r.kind)).toEqual(["analysis"]); expect((await rows(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
    await progress.getByRole("button", { name: t("startSummary"), exact: true }).click();
   } else {
    const review = chat.locator(".dr-memory-review"); await expect(review).toBeVisible();
    expect(sent.map(r => r.kind)).toEqual(["analysis"]); expect(homeAttempts).toBe(0); expect((await rows(panel)).filter(r => r.kind === "entry")).toHaveLength(1);
    await chat.reload(); await expect(review).toBeVisible(); expect(sent.map(r => r.kind)).toEqual(["analysis"]);
    await review.getByRole("button", { name: locale === "ru" ? "Выбрать все" : "Select all", exact: true }).click();
    if (commitFailure) await worker.evaluate(() => {
     const original = IDBObjectStore.prototype.put;
     (globalThis as any).restoreChainWrites = () => { IDBObjectStore.prototype.put = original; };
     IDBObjectStore.prototype.put = function(value: any, ...args: any[]) { if (value.kind === "snapshot" && value.data?.appliedAt) throw new DOMException("Synthetic receipt write failure", "UnknownError"); return original.call(this, value, ...args); };
    });
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
    await chat.goto(f.binding.chatUrl); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    expect((await rows(panel)).find(r => r.kind === "snapshot").data.summary).toBe(recap);
    return;
   }
   await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/chain-target");
   if (scenario === "early-route-rejected") {
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
    await retry.click(); await expect(retry).toHaveCount(0);
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
