import { chromium, expect, test, type Page, type Worker } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { profile as selfieImageConfig, realPng as selfiePng } from "../image-fixtures";
import { DEFAULT_IMAGE_SETTINGS } from "../../src/core/image-generation";
import { selfieImageKey } from "../../src/core/selfies";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import { DEFAULT_RELATIONSHIP, relationshipState } from "../../src/core/relationships";
import { characterTab, closeSavedCharacter } from "./character-helpers";

const fixture = `<!doctype html><html><head><title>Mock DeepSeek</title></head><body><main><header><h1>Roleplay</h1></header><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>`;
async function setup(records: Array<[string, any]>) {
  // Keep Windows LevelDB paths short. Playwright clears this output root on the next run.
  const profiles = path.join(test.info().project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "deeprole-sync-test-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  try {
  context.setDefaultTimeout(10000);
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
  await expect(panel.locator(".onboarding")).toBeVisible();
  await panel.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result; const tx = db.transaction("records", "readwrite"); for (const [kind, data] of seed) tx.objectStore("records").put({ pk: kind + ":" + data.id, kind, id: data.id, data, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    });
    await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_library_change: { token: "seed" } });
  }, records);
  const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/a");
  await chat.bringToFront();
  await expect(chat.getByRole("button", { name: /^Context/ })).toBeVisible();
  await expect.poll(() => command(panel, { type: "DR_GET_PAGE_STATE" }).catch(() => null)).toMatchObject({ type: "DR_PAGE_STATE", chatId: "a" });
  return { context, panel, chat, worker };
  } catch (error) { await context.close(); throw error; }
}
async function command(panel: Page, message: any) {
  return panel.evaluate(async (message) => {
    const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*", active: true });
    return api.tabs.sendMessage(tab.id, message);
  }, message);
}
async function holdNextVaultRead(worker: Worker) {
  await worker.evaluate(() => {
    const api = (globalThis as any).chrome; const original = api.storage.local.get.bind(api.storage.local);
    api.storage.local.get = (key: any) => {
      if (key === "deeprole_vault") {
        api.storage.local.get = original;
        (globalThis as any).readHeld = true;
        return new Promise((resolve, reject) => { (globalThis as any).releaseRead = () => original(key).then(resolve, reject); });
      }
      return original(key);
    };
    (globalThis as any).readHeld = false;
  });
}
async function startCommand(panel: Page, message: any) {
  await panel.evaluate(async (message) => {
    const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*", active: true });
    (window as any).pendingCommand = api.tabs.sendMessage(tab.id, message);
  }, message);
}
async function databaseRecords(panel: Page) {
  return panel.evaluate(() => new Promise<any[]>((resolve) => { const open = indexedDB.open("deeprole"); open.onsuccess = () => { const db = open.result; const all = db.transaction("records").objectStore("records").getAll(); all.onsuccess = () => { resolve(all.result); db.close(); }; }; }));
}
async function enableServiceComposer(chat: Page) {
  await chat.evaluate(() => {
    document.querySelector("#conversation")!.innerHTML = '<article data-message-id="user">Mira arrived.</article><article data-message-id="answer">The gate opened.</article>';
    document.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault(); const composer = document.querySelector("textarea")!; const prompt = composer.value; composer.value = "";
      const user = document.createElement("article"); user.dataset.messageId = "service-user"; user.textContent = prompt;
      const reply = document.createElement("article"); reply.dataset.messageId = "service-answer";
      document.querySelector("#conversation")!.append(user, reply);
      const controller = new AbortController();
      const transport = { controller, headersReceived: false };
      ((window as any).serviceTransports ??= []).push(transport);
      void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt }), signal: controller.signal })
        .then(() => { transport.headersReceived = true; }).catch(() => undefined);
    });
  });
}
async function enableContinuationComposer(chat: Page, options: { changes?: boolean; manualSummary?: boolean } = {}) {
  await chat.evaluate(options => {
    (window as any).continuationPrompts = [];
    (window as any).finishSummary = () => {
      const row = document.querySelector<HTMLElement>('[data-message-id="transfer-summary-answer"]');
      if (row) row.textContent = '<deeprole_data>' + JSON.stringify({ type: "handoff", title: "Harbor scene", summary: "Mira waits at the harbor. The gate opened. The promise has been kept. Continue from this exact moment; the next reply is still pending." }) + '</deeprole_data>';
    };
    document.querySelector("form")!.addEventListener("submit", event => {
      event.preventDefault(); const composer = document.querySelector("textarea")!, prompt = composer.value; composer.value = "";
      (window as any).continuationPrompts.push(prompt);
      const summary = prompt.includes("[DeepRole Scene Handoff]");
      const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = summary ? "transfer-summary-user" : "transfer-analysis-user"; user.textContent = prompt;
      const answer = document.createElement("article"); answer.dataset.role = "assistant"; answer.dataset.messageId = summary ? "transfer-summary-answer" : "transfer-analysis-answer";
      document.querySelector("#conversation")!.append(user, answer);
      void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "a" }) }).then(() => {
        if (summary) { if (!options.manualSummary) (window as any).finishSummary(); }
        else answer.textContent = '<deeprole_data>' + JSON.stringify({ type: "memory-suggestions", items: options.changes ? [{ title: "Mira's promise", content: "Mira confirmed the promise was kept.", keywords: ["Mira"], activation: "smart", priority: "normal" }] : [] }) + '</deeprole_data>';
      });
    });
  }, options);
}
async function finishNoChangeReview(chat: Page) {
  const progress = chat.getByRole("region", { name: "Continue your story", exact: true });
  await expect(progress).toContainText("Memory is up to date");
  await progress.getByRole("button", { name: "Prepare summary and continue", exact: true }).click();
}
function entry(id: string) { return { id, worldId: null, bookId: null, title: id, content: `CANON_${id}`, keywords: [`${id} signal`], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 }; }
function snapshot(id: string) { return { id, worldId: null, bookId: null, title: id, summary: `HANDOFF_${id}`, sourceChatId: "previous", sourceChatUrl: "https://chat.deepseek.com/chat/s/previous", createdAt: 1 }; }

test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "Installed MV3 bridge; shared adapter/UI tested in Firefox separately"); });

test("reviewed continuation preserves exact progress before consuming an accepted retry", async () => {
  test.setTimeout(75000);
  const world = { id: "world", name: "Harbor", description: "Harbor canon", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "hero", worldId: "world", kind: "character", name: "Leon", description: "Leon is 25", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true }, createdAt: 1, updatedAt: 1 };
  const mira = { ...hero, id: "mira", name: "Mira", description: "Mira is 24", characterSheet: { ...EMPTY_CHARACTER, relationships: structuredClone(DEFAULT_RELATIONSHIP) } };
  const progress = { revision: "played", lastReply: "old-reply", presentIds: ["hero", "mira"], partnerIds: ["mira"], states: {
    hero: { ...EMPTY_STATUS, attributes: { values: { energy: 41 }, locked: ["energy"], history: [] } },
    mira: { ...EMPTY_STATUS, emotion: "happy", condition: "At the harbor", bonds: { hero: { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 87, affinity: 68, locked: true, completed: ["oath"] } } },
  }, updatedAt: 2 };
  const sourceBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "world", focusIds: ["hero", "mira"], bookId: null, memoryOverrides: { includedIds: ["promise"], excludedIds: [] }, characterScenes: { world: progress }, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 2 };
  const promise = { ...entry("promise"), worldId: "world", activation: "manual", content: "The oath must be honored." };
  const { context, panel, chat } = await setup([["world", world], ["entity", hero], ["entity", mira], ["binding", sourceBinding], ["entry", promise]]);
  try {
    let posts = 0; const sent: string[] = [];
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { biz_data: { chat_messages: [
      { role: "user", content: "I promised to return." }, { role: "assistant", fragments: [{ type: "THINK", content: "NEVER_FORWARD_REASONING" }, { type: "RESPONSE", content: "Mira waits at the harbor." }] },
    ] } } }) }));
    await context.route("**/api/v0/chat/completion", route => { if (route.request().postDataJSON().prompt.startsWith("[DeepRole Service]")) return route.fulfill({ contentType: "application/json", body: "{}" }); posts++; sent.push(route.request().postDataJSON().prompt); return route.fulfill({ status: posts === 1 ? 503 : 200, contentType: "application/json", body: "{}" }); });
    await context.addInitScript(() => window.addEventListener("DOMContentLoaded", () => {
      if (location.pathname !== "/") return;
      document.querySelector<HTMLFormElement>("form")!.style.cssText = "position:fixed;bottom:20px;left:380px;width:550px;height:80px;";
      document.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault(); const textarea = document.querySelector("textarea")!, prompt = textarea.value; textarea.value = "";
        void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "b" }) }).then(response => {
          if (!response.ok) { textarea.value = prompt; return; }
          history.pushState({}, "", "/chat/s/b");
          document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="first">Continue from the harbor.</article>';
        });
      });
    }, { once: true }));
    await enableContinuationComposer(chat);
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="1">I promised to return.</article><article data-role="assistant" data-message-id="2">Mira waits at the harbor.</article>'; });
    await expect(chat.getByRole("button", { name: "Continue in a new chat", exact: true })).toBeEnabled();
    await chat.getByRole("button", { name: "Continue in a new chat", exact: true }).click();
    await finishNoChangeReview(chat);
    await expect(chat).toHaveURL("https://chat.deepseek.com/");
    await expect.poll(() => posts).toBe(1);
    expect(sent[0]).toContain("Mira waits at the harbor."); expect(sent[0]).toContain("The oath must be honored."); expect(sent[0]).toContain('"trust":87');
    expect(sent[0]).not.toContain("NEVER_FORWARD_REASONING");
    let records = await databaseRecords(panel), checkpoint = records.find(r => r.kind === "snapshot").data;
    expect(checkpoint.appliedAt).toBeUndefined(); expect(checkpoint.characterScene).toEqual(progress);
    expect(records.find(r => r.kind === "binding" && r.data.chatId === "a").data.characterScenes).toEqual(sourceBinding.characterScenes);
    expect(checkpoint.continuation).toBeUndefined();
    expect(records.find(r => r.kind === "binding" && r.data.chatId === "b")).toBeUndefined();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).not.toHaveValue("");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/b");
    await expect.poll(async () => (await databaseRecords(panel)).find(r => r.kind === "snapshot").data.appliedAt).toBeTruthy();
    records = await databaseRecords(panel); const branch = records.find(r => r.kind === "binding" && r.data.chatId === "b").data;
    expect(branch.characterScenes.world.states).toEqual(progress.states); expect(branch.characterScenes.world.lastReply).toBeUndefined();
    expect(branch.memoryOverrides).toEqual(sourceBinding.memoryOverrides); expect(branch.continuationSnapshotId).toBe(checkpoint.id);
    await chat.reload(); await expect(chat.getByRole("combobox", { name: "World", exact: true }).locator("option:checked")).toHaveText("Harbor");
    expect((await databaseRecords(panel)).find(r => r.kind === "binding" && r.data.chatId === "b").data.characterScenes.world.states).toEqual(progress.states);
    expect(sent).toHaveLength(2); expect(sent[1]).toContain("Mira waits at the harbor.");
  } finally { await context.close(); }
});

test("reviewed continuation protects a draft typed while the explicit history read is pending", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let release!: () => void, reading = false; const gate = new Promise<void>(resolve => { release = resolve; });
    await context.route("**/api/v0/chat/history_messages?**", async route => { reading = true; await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ role: "assistant", content: "The door opened." }] }) }); });
    await context.route("**/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableContinuationComposer(chat);
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="1">The door opened.</article>'; });
    await expect(chat.getByRole("button", { name: "Continue in a new chat", exact: true })).toBeEnabled();
    expect(await command(panel, { type: "DR_CONTINUE_STORY" })).toEqual({ ok: true });
    await expect(chat.getByRole("region", { name: "Continue your story" })).toContainText("Memory is up to date");
    await startCommand(panel, { type: "DR_CONTINUE_STORY" }); await expect.poll(() => reading).toBe(true);
    expect(await command(panel, { type: "DR_CONTINUE_STORY" })).toEqual({ ok: false, error: "busy" });
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY UNSENT DRAFT"); release();
    await expect.poll(() => panel.evaluate(() => (window as any).pendingCommand)).toEqual({ ok: false, error: "draft-not-empty" });
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a"); await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY UNSENT DRAFT");
    expect((await databaseRecords(panel)).filter(r => r.kind === "snapshot")).toEqual([]);
  } finally { await context.close(); }
});

test("reviewed continuation waits for the latest validated relationship update and falls back if history is unavailable", async () => {
  test.setTimeout(60000);
  const world = { id: "world", name: "Harbor", description: "An unchanged world", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "hero", worldId: "world", kind: "character", name: "Leon", description: "Leon is 25", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true }, createdAt: 1, updatedAt: 1 };
  const mira = { ...hero, id: "mira", name: "Mira", description: "Mira is 24", characterSheet: { ...EMPTY_CHARACTER, relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: 30, affinity: 30 } } } };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "world", focusIds: ["hero", "mira"], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ["entity", hero], ["entity", mira], ["binding", binding]]);
  try {
    let prompt = "";
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await context.route("**/api/v0/chat/completion", route => { prompt = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await context.addInitScript(() => window.addEventListener("DOMContentLoaded", () => {
      if (location.pathname !== "/") return;
      document.querySelector("form")!.addEventListener("submit", event => { event.preventDefault(); }); // Keep the new checkpoint ready; no second model call.
    }, { once: true }));
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="old">Mira waits.</article>'; });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, I kept the promise.", chat_session_id: "a" }) }));
    await expect.poll(() => prompt).toContain("\nSchema: ");
    const schema = JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
    const quote = "Mira thanked Leon for keeping his promise.";
    const turn = { request: schema.request, present: ["Leon", "Mira"], partners: ["Mira"], updates: [{ id: "Mira", name: "Mira", state: { ...EMPTY_STATUS, emotion: "happy" } }], bonds: [{ id: "Mira", hero: "Leon", trust: 3, affinity: 2, reason: "A kept promise", quote }] };
    await chat.evaluate(({ quote, turn }) => { document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="1">Mira, I kept the promise.</article><article data-role="assistant" data-message-id="2"><div class="ds-markdown"></div></article>'; document.querySelector(".ds-markdown")!.textContent = quote + "\n<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>"; }, { quote, turn });
    await expect(chat.getByRole("button", { name: "Continue in a new chat", exact: true })).toBeEnabled();
    await enableContinuationComposer(chat);
    await chat.getByRole("button", { name: "Continue in a new chat", exact: true }).click();
    await finishNoChangeReview(chat);
    await expect(chat).toHaveURL("https://chat.deepseek.com/");
    const checkpoint = (await databaseRecords(panel)).find(r => r.kind === "snapshot").data;
    expect(checkpoint.characterScene.states.mira.bonds.hero).toMatchObject({ trust: 33, affinity: 32 });
    expect(checkpoint.continuation).toBeUndefined();
    expect(checkpoint.summary).toContain("promise has been kept");
    expect(checkpoint.appliedAt).toBeUndefined();
    await panel.reload(); await panel.locator(".play-continuation > summary").click();
    await expect(panel.getByRole("link", { name: "Open original chat", exact: true })).toHaveAttribute("href", "https://chat.deepseek.com/chat/s/a");
  } finally { await context.close(); }
});

test("reviewed continuation waits for explicit approval, uses updated memory, and can cancel the hidden summary", async () => {
  test.setTimeout(60000);
  const { context, panel, chat } = await setup([["entry", entry("canon")]]);
  try {
    await context.route("**/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ role: "assistant", content: "Mira confirmed the promise was kept." }] }) }));
    await enableContinuationComposer(chat, { changes: true, manualSummary: true });
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="1">Mira confirmed the promise was kept.</article>'; });
    expect(await command(panel, { type: "DR_CONTINUE_STORY" })).toEqual({ ok: true });
    const review = chat.locator(".dr-memory-review");
    await expect(review).toBeVisible();
    expect((await databaseRecords(panel)).filter(r => r.kind === "entry")).toHaveLength(1);
    expect((await databaseRecords(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
    expect(await chat.evaluate(() => (window as any).continuationPrompts)).toHaveLength(1);
    await review.getByRole("button", { name: "Select all", exact: true }).click();
    await review.getByRole("button", { name: /^Save and continue/ }).click();
    await expect.poll(() => chat.evaluate(() => (window as any).continuationPrompts.length)).toBe(2);
    const prompts = await chat.evaluate(() => (window as any).continuationPrompts as string[]);
    expect(prompts[0]).toContain("CANON_canon");
    expect(prompts[1]).toContain("[Approved memory"); expect(prompts[1]).toContain("Mira confirmed the promise was kept.");
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a");
    const loader = chat.locator('[data-message-id="transfer-summary-answer"] [data-deeprole-memory-card]');
    await expect(loader).toContainText("Summarizing recent scenes");
    await chat.getByRole("button", { name: "Cancel transfer", exact: true }).click();
    await chat.evaluate(() => (window as any).finishSummary());
    await expect(chat.getByRole("region", { name: "Continue your story", exact: true })).toHaveCount(0);
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a");
    expect((await databaseRecords(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
    expect((await databaseRecords(panel)).filter(r => r.kind === "entry")).toHaveLength(2);
  } finally { await context.close(); }
});

test("reviewed continuation resumes its review after reload and discard prevents a new chat", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("**/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableContinuationComposer(chat, { changes: true });
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="1">Mira waits.</article>'; });
    expect(await command(panel, { type: "DR_CONTINUE_STORY" })).toEqual({ ok: true });
    await expect(chat.locator(".dr-memory-review")).toBeVisible();
    await chat.reload();
    const review = chat.locator(".dr-memory-review"); await expect(review).toBeVisible();
    await review.getByRole("button", { name: "Discard these proposals", exact: true }).click();
    await review.getByRole("button", { name: "Discard all", exact: true }).click();
    await expect(review).toHaveCount(0);
    expect((await databaseRecords(panel)).filter(r => ["entry", "snapshot"].includes(r.kind))).toHaveLength(0);
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a");
    await expect(chat.getByRole("region", { name: "Continue your story", exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test("reviewed continuation rejects a malformed scene summary without opening a new chat", async () => {
  test.setTimeout(45000);
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("**/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ role: "assistant", content: "Mira waits." }] }) }));
    await enableContinuationComposer(chat, { manualSummary: true });
    await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="1">Mira waits.</article>'; });
    expect(await command(panel, { type: "DR_CONTINUE_STORY" })).toEqual({ ok: true });
    await finishNoChangeReview(chat);
    await expect(chat.locator('[data-message-id="transfer-summary-answer"]')).toBeAttached();
    await chat.evaluate(() => { document.querySelector('[data-message-id="transfer-summary-answer"]')!.textContent = "No valid checkpoint"; });
    await expect(chat.getByRole("region", { name: "Continue your story", exact: true })).toHaveCount(0, { timeout: 18000 });
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a");
    expect((await databaseRecords(panel)).filter(r => r.kind === "snapshot")).toHaveLength(0);
  } finally { await context.close(); }
});

for (const scenario of [{ name: "allowed", trust: 65, refusal: false }, { name: "low trust", trust: 20, refusal: false }, { name: "refused", trust: 65, refusal: true }]) {
  test("local selfie runtime " + scenario.name + ": request binding, gates and reload", async () => {
    test.setTimeout(50000);
    const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const world = { id: "world", name: "Harbor", description: "Unchanged world", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const hero = { id: "hero", worldId: "world", name: "Leon", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
    const mira = { ...hero, id: "mira", name: "Mira", description: "ORIGINAL LORE", characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: image }, relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: scenario.trust, affinity: 90 } }, selfieCategories: [{ id: "regular", name: "Ordinary", default: true, description: "Casual photo", minTrust: 40, minAffinity: 30, images: [image] }, { id: "home", name: "At home", description: "At home in the evening", minTrust: 40, minAffinity: 30, images: [image] }] } };
    const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "world", bookId: null, focusIds: [hero.id, mira.id], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
    const { context, panel, chat } = await setup([["world", world], ["entity", hero], ["entity", mira], ["binding", binding]]);
    try {
      let prompt = ""; await context.route("**/api/v0/chat/completion", route => { prompt = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "application/json", body: "{}" }); });
      await chat.evaluate(() => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="old">Mira waits at home.</article>'; });
      await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, could you send a selfie?", chat_session_id: "a" }) }));
      await expect.poll(() => prompt).toContain("Local selfie collections:");
      expect(prompt).toContain("At home in the evening"); expect(prompt).not.toContain("data:image"); expect(prompt).toContain('"default":true');
      const schema = JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
      const quote = scenario.refusal ? "Mira will not send Leon a selfie tonight." : "Mira smiles and sends Leon a selfie from home.";
      const turn = { request: schema.request, present: ["Leon", "Mira"], partners: ["Mira"], updates: [], selfies: [{ id: "Mira", category: "home", quote }] };
      const text = quote + "\n<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>";
      const render = (value: string) => { document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="photo-user">Mira, could you send a selfie?</article><article data-role="assistant" data-message-id="photo-answer"><div class="ds-markdown"></div></article>'; document.querySelector(".ds-markdown")!.textContent = value; };
      await chat.evaluate(render, text);
      await expect.poll(async () => (await databaseRecords(panel)).find(r => r.kind === "binding").data.characterScenes?.world?.lastReply).toBeTruthy();
      await chat.addStyleTag({ content: "#conversation{max-width:640px;margin:160px auto 0}" });
      const photo = chat.locator("[data-deeprole-scene-photos]");
      if (scenario.name === "allowed") {
        await expect(photo.locator("img")).toBeVisible(); await expect(photo.locator("img")).toHaveAttribute("src", image);
        const records = await databaseRecords(panel); const saved = records.find(r => r.kind === "binding").data.scenePhotos;
        expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ entityId: "mira", categoryId: "home", messageKey: '["message","photo-answer"]' });
        await photo.getByRole("button").click(); await expect(chat.getByRole("dialog", { name: "Mira · Selfie" })).toBeVisible(); await chat.keyboard.press("Escape");
        await context.addInitScript(value => window.addEventListener("DOMContentLoaded", () => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="photo-answer"><div class="ds-markdown"></div></article>'; document.querySelector(".ds-markdown")!.textContent = value; }, { once: true }), text);
        await chat.reload(); await expect(photo.locator("img")).toHaveAttribute("src", image);
        expect((await databaseRecords(panel)).find(r => r.kind === "binding").data.scenePhotos).toEqual(saved);
      } else {
        expect((await databaseRecords(panel)).find(r => r.kind === "binding").data.scenePhotos).toBeUndefined();
        await expect(photo).toHaveCount(0);
      }
      expect((await databaseRecords(panel)).find(r => r.kind === "entity" && r.id === "mira").data.description).toBe("ORIGINAL LORE");
    } finally { await context.close(); }
  });
}

for (const refused of [false, true]) {
  test("background character text runtime " + (refused ? "refusal" : "insertion and reload"), async () => {
    test.setTimeout(50000);
    const world = { id: "world", name: "Harbor", description: "Original world", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const hero = { id: "hero", worldId: "world", name: "Leon", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
    const mira = { ...hero, id: "mira", name: "Mira", description: "UNCHANGED LORE", characterSheet: { ...EMPTY_CHARACTER, personality: "Old profile." } };
    const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "world", bookId: null, focusIds: ["hero", "mira"], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
    const { context, panel, chat } = await setup([["world", world], ["entity", hero], ["entity", mira], ["binding", binding]]);
    try {
      const prompts: string[] = [];
      await context.route("**/api/v0/chat/completion", route => { prompts.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
      await chat.evaluate(refused => {
        document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="old-user">Hello, Mira.</article><article data-role="assistant" data-message-id="old-answer">Mira waits at the harbor.</article>';
        document.querySelector("form")!.addEventListener("submit", event => {
          event.preventDefault(); const composer = document.querySelector("form textarea") as HTMLTextAreaElement, prompt = composer.value; composer.value = "";
          const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = "field-user"; user.id = "field-user"; user.textContent = prompt;
          const reply = document.createElement("article"); reply.dataset.role = "assistant"; reply.dataset.messageId = "field-answer"; reply.id = "field-answer";
          document.querySelector("#conversation")!.append(user, reply);
          void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "a" }) }).then(() => {
            reply.innerHTML = '<div class="ds-think-content">Reasoning must not be inserted.</div><div class="ds-assistant-message-main-content"><p></p><button>Copy</button></div>';
            reply.querySelector("p")!.textContent = refused ? "Sorry, that's beyond my current scope. Let's talk about something else." : "Calm, observant and considerate.";
          });
        });
      }, refused);
      await chat.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
      const editor = chat.locator(".dr-character-dialog"), area = editor.locator('[data-character-text-field=personality]');
      const field = area.getByRole("textbox", { name: "Personality", exact: true }), wand = area.getByRole("button", { name: "Ask DeepSeek to generate: Personality", exact: true });
      const composer = chat.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("UNSENT DRAFT");
      await wand.click(); await expect(area.getByRole("alert")).toContainText("draft");
      await expect(composer).toHaveValue("UNSENT DRAFT"); expect(prompts).toHaveLength(0);
      await composer.fill(""); await wand.click();
      await expect.poll(() => prompts.length).toBe(1);
      expect(prompts[0]).toContain("[DeepRole Character Text]"); expect(prompts[0]).toContain("Plain text only"); expect(prompts[0]).not.toContain("data:image");
      await expect(chat.locator("#field-user")).toBeHidden(); await expect(chat.locator("#field-answer")).toBeHidden();
      if (refused) { await expect(area.getByRole("alert")).toContainText("Could not get the text"); await expect(field).toHaveValue("Old profile."); }
      else { await expect(field).toHaveValue("Calm, observant and considerate."); await expect(editor).toContainText("Text inserted."); }
      const records = await databaseRecords(panel); expect(records.find(r => r.kind === "entity" && r.id === "mira").data.characterSheet.personality).toBe("Old profile.");
      expect(records.find(r => r.kind === "entity" && r.id === "mira").data.description).toBe("UNCHANGED LORE"); expect(records.filter(r => r.kind === "proposal")).toHaveLength(0);
      await expect.poll(() => panel.evaluate(async () => { const values = await (globalThis as any).chrome.storage.session.get(null); return Object.entries(values).find(([key]) => key.startsWith("deeprole_tab_state_"))?.[1]; })).toMatchObject({ service: null, characterTextTurns: [{ chatId: "a" }] });
      if (!refused) {
        await editor.getByRole("button", { name: "Save character", exact: true }).click();
        await expect.poll(async () => (await databaseRecords(panel)).find(r => r.kind === "entity" && r.id === "mira").data.characterSheet.personality).toBe("Calm, observant and considerate.");
      }
      await context.addInitScript(() => window.addEventListener("DOMContentLoaded", () => { document.querySelector("#conversation")!.innerHTML = '<article id="field-answer" data-role="assistant" data-message-id="field-answer"><div class="ds-markdown">Calm, observant and considerate.</div></article>'; }, { once: true }));
      await chat.reload(); await expect(chat.getByRole("button", { name: /^Context/ })).toBeVisible(); await expect(chat.locator("#field-answer")).toBeHidden();
      await chat.evaluate(() => { const row = document.querySelector<HTMLElement>("#field-answer")!; row.dataset.messageId = "ordinary-new"; row.textContent = "Ordinary scene."; });
      await expect(chat.locator("#field-answer")).toBeVisible();
    } finally { await context.close(); }
  });
}

test("capacity warnings are nonblocking, snoozed at each level and can be disabled", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ role: "assistant", content: "x".repeat(29_200) }] }) }));
    let sent = 0; await context.route("**/api/v0/chat/completion", route => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; await api.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true, chatContextCapacity: 8000 } }); });
    await chat.reload(); await expect(chat.locator(".dr-chat-meter")).toContainText("From chat history");
    const send = () => chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Keep going" }) }));
    await send(); await expect(chat.getByRole("dialog")).toContainText("This chat is nearly full"); expect(sent).toBe(1);
    await chat.getByRole("button", { name: "Stay in this chat", exact: true }).click();
    await send(); await expect(chat.getByRole("dialog")).toHaveCount(0); expect(sent).toBe(2);
    await chat.reload(); await expect(chat.locator(".dr-chat-meter")).toContainText("From chat history");
    await send(); await expect(chat.getByRole("dialog")).toHaveCount(0);
    await context.route("**/api/v0/chat/history_messages?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ messages: [{ role: "assistant", content: "x".repeat(40_000) }] }) }));
    await chat.reload(); await expect(chat.locator(".dr-chat-meter")).toContainText("10K");
    await send(); await expect(chat.getByRole("dialog")).toContainText("Very little room left");
    await chat.getByRole("button", { name: "Turn off warnings", exact: true }).click();
    await expect(chat.getByRole("dialog")).toHaveCount(0);
    expect(await panel.evaluate(async () => (await (globalThis as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.contextWarningsEnabled)).toBe(false);
    await send(); await expect(chat.getByRole("dialog")).toHaveCount(0); expect(sent).toBe(5);
  } finally { await context.close(); }
});

test("simultaneous outgoing drafts each receive their own context", async () => {
  const { context, chat } = await setup([["entry", entry("alpha")], ["entry", entry("beta")]]);
  try {
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => Promise.all(["alpha signal", "beta signal"].map((prompt) => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt }) }))));
    expect(sent).toHaveLength(2);
    for (const name of ["alpha", "beta"]) {
      const body = sent.find((body) => body.endsWith(`[User message]\n${name} signal`))!;
      expect(body, JSON.stringify(sent)).toContain(`CANON_${name}`);
      expect(body).not.toContain(`CANON_${name === "alpha" ? "beta" : "alpha"}`);
    }
  } finally { await context.close(); }
});

test("a late accepted request never consumes a newer handoff", async () => {
  const { context, panel, chat } = await setup([["snapshot", snapshot("A")], ["snapshot", snapshot("B")]]);
  let release!: () => void;
  try {
    await chat.bringToFront(); expect(await command(panel, { type: "DR_APPLY_SNAPSHOT", snapshotId: "A" })).toEqual({ ok: true });
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /HANDOFF_A/);
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let received!: () => void; const started = new Promise<void>((resolve) => { received = resolve; });
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", async (route) => { received(); await gate; await route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => { (window as any).pendingSend = fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue" }) }); });
    await started;
    expect(await command(panel, { type: "DR_APPLY_SNAPSHOT", snapshotId: "B" })).toEqual({ ok: true });
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /HANDOFF_B/);
    release(); await chat.evaluate(() => (window as any).pendingSend);
    await expect.poll(async () => {
      const state = await panel.evaluate(async () => (globalThis as any).chrome.storage.session.get(null));
      return Object.entries(state).find(([key]) => key.startsWith("deeprole_tab_state_"))?.[1] as any;
    }).toMatchObject({ snapshotId: "B" });
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /HANDOFF_B/);
  } finally { release?.(); await context.close(); }
});

test("typing while a template loads is never overwritten", async () => {
  const template = { id: "t", worldId: null, name: "Test opening", opening: "TEMPLATE_OPENING", initialState: "", focusIds: [], createdAt: 1, updatedAt: 1 };
  const { context, panel, chat, worker } = await setup([["template", template]]);
  try {
    await chat.goto("https://chat.deepseek.com/"); await expect(chat.getByRole("button", { name: /^Context/ })).toBeVisible();
    await chat.bringToFront(); await holdNextVaultRead(worker);
    await startCommand(panel, { type: "DR_APPLY_TEMPLATE", templateId: "t" });
    await expect.poll(() => worker.evaluate(() => (globalThis as any).readHeld)).toBe(true);
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY_UNSENT_DRAFT");
    await worker.evaluate(() => (globalThis as any).releaseRead());
    expect(await panel.evaluate(() => (window as any).pendingCommand)).toEqual({ ok: false });
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_UNSENT_DRAFT");
  } finally { await context.close(); }
});

test("a queued scene change never rebinds the next chat", async () => {
  const world = { id: "w", name: "World", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat, worker } = await setup([["world", world]]);
  try {
    await chat.bringToFront(); await holdNextVaultRead(worker);
    await startCommand(panel, { type: "DR_SET_SCENE", scene: { worldId: "w", bookId: null, focusIds: [] } });
    await expect.poll(() => worker.evaluate(() => (globalThis as any).readHeld)).toBe(true);
    await chat.evaluate(() => { history.pushState({}, "", "/chat/s/b"); document.querySelector("h1")!.textContent = "Next chat"; });
    await worker.evaluate(() => (globalThis as any).releaseRead());
    expect(await panel.evaluate(() => (window as any).pendingCommand)).toEqual({ ok: false });
    expect((await databaseRecords(panel)).some((row) => row.kind === "binding" && row.data.chatId === "b" && row.data.worldId === "w")).toBe(false);
  } finally { await context.close(); }
});

test("the menu follows the active DeepSeek tab without another edit or message", async () => {
  const world = (id: string) => ({ id, name: "World " + id, description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 });
  const binding = (id: string) => ({ id: "binding:" + id, chatId: id, chatUrl: "https://chat.deepseek.com/chat/s/" + id, worldId: id, bookId: null, focusIds: [], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 });
  const { context, panel, chat } = await setup([["world", world("a")], ["world", world("b")], ["binding", binding("a")], ["binding", binding("b")]]);
  try {
    await expect(panel.getByRole("combobox", { name: "World", exact: true })).toHaveValue("a");
    const other = await context.newPage(); await other.goto("https://chat.deepseek.com/chat/s/b");
    await expect(other.getByRole("button", { name: /^Context/ })).toBeVisible();
    await expect(panel.getByRole("combobox", { name: "World", exact: true })).toHaveValue("b");
    await chat.bringToFront();
    await expect(panel.getByRole("combobox", { name: "World", exact: true })).toHaveValue("a");
    const offsite = await context.newPage(); await offsite.goto("about:blank");
    await expect(panel.getByRole("combobox", { name: "World", exact: true })).toHaveCount(0);
    await expect(panel.getByText("Open a DeepSeek chat", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("a rejected analysis releases only its pending request and can be retried", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); });
    await enableServiceComposer(chat); await chat.bringToFront();
    const request = { id: "failure-test", type: "memory-analysis", bookId: null, createdAt: Date.now() };
    expect(await command(panel, { type: "DR_RUN_SERVICE", request })).toEqual({ ok: true });
    await expect.poll(() => sent).toBe(1);
    await expect.poll(async () => {
      const state = await panel.evaluate(async () => (globalThis as any).chrome.storage.session.get(null));
      return (Object.entries(state).find(([key]) => key.startsWith("deeprole_tab_state_"))?.[1] as any)?.service;
    }).toBeNull();
    // Session storage is cleared before the runtime finishes releasing the
    // request. Wait for the activity state used by the visible retry controls;
    // observing the storage write alone does not mean they are ready yet.
    await expect.poll(() => command(panel, { type: "DR_GET_PAGE_STATE" })).toMatchObject({ activity: { phase: "error", type: "memory-analysis" } });
    await expect(panel.getByRole("button", { name: "Update lore", exact: true })).toBeEnabled();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { ...request, id: "retry-test", createdAt: Date.now() } })).toEqual({ ok: true });
    await expect.poll(() => sent).toBe(2);
  } finally { await context.close(); }
});

test("a visible DeepSeek generation error releases the pending analysis and allows retry", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let sent = 0;
    const prompts: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; prompts.push(route.request().postDataJSON()?.prompt ?? ""); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableServiceComposer(chat); await chat.bringToFront();
    const request = { id: "visible-error", type: "memory-analysis", bookId: null, createdAt: Date.now() };
    expect(await command(panel, { type: "DR_RUN_SERVICE", request })).toEqual({ ok: true });
    await expect.poll(() => pendingService(panel)).toMatchObject({ id: "visible-error" });
    const reply = chat.locator("[data-message-id='service-answer']").first();
    await reply.evaluate((element) => { element.textContent = "Сообщение генерируется, повторите попытку позже."; });
    await expect.poll(() => pendingService(panel)).toBeNull();
    await expect(reply).toBeVisible();
    await expect(reply).toContainText("Could not prepare suggestions", { useInnerText: true });
    await expect(reply.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
    expect((await databaseRecords(panel)).filter((row) => row.kind === "proposal" || row.kind === "entry")).toEqual([]);
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { ...request, id: "visible-error-retry", createdAt: Date.now() } })).toEqual({ ok: true });
    await expect.poll(() => sent).toBe(2);
    await expect.poll(() => pendingService(panel)).toMatchObject({ id: "visible-error-retry" });
    await chat.evaluate(async () => { await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue the scene" }) }); });
    await expect.poll(() => sent).toBe(3);
    expect(prompts.at(-1)).toBe("Continue the scene");
    await expect.poll(() => pendingService(panel)).toMatchObject({ id: "visible-error-retry" });
  } finally { await context.close(); }
});

test("typing an update-lore phrase stays an unchanged outgoing message", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let sentPrompt: string | undefined;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", async (route) => {
      sentPrompt = route.request().postDataJSON()?.prompt;
      await route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await chat.evaluate(async () => {
      await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "DeepRole, update lore" }) });
    });
    await expect.poll(() => sentPrompt).toBe("DeepRole, update lore");
    expect(await pendingService(panel)).toBeFalsy();
  } finally { await context.close(); }
});

for (const type of ["memory-analysis", "handoff"] as const) {
  test(`a rerendered old ${type} reply cannot complete a newer service`, async () => {
    const { context, panel, chat } = await setup([]);
    try {
      await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
      await enableServiceComposer(chat); await chat.bringToFront();
      await chat.evaluate((type) => {
        const oldRequest = document.createElement("article"); oldRequest.dataset.messageId = "old-service";
        oldRequest.textContent = "[DeepRole Service]\n[Request ID: previous-service]\nPrevious request";
        const oldReply = document.createElement("article"); oldReply.dataset.messageId = "old-answer";
        oldReply.textContent = type === "memory-analysis"
          ? '<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Old result","content":"WRONG_OLD_RESULT","keywords":[]}]}</deeprole_data>'
          : '<deeprole_data>{"type":"handoff","title":"Old result","summary":"WRONG_OLD_RESULT"}</deeprole_data>';
        const quote = document.createElement("article"); quote.dataset.messageId = "ordinary-quote";
        quote.textContent = 'Explain <deeprole_data>{"type":"handoff"}</deeprole_data> please.';
        document.querySelector("#conversation")!.append(oldRequest, oldReply, quote);
        document.querySelector("form")!.addEventListener("submit", () => {
          // DeepSeek can replace message elements while retaining the same history.
          const conversation = document.querySelector("#conversation")!;
          conversation.replaceChildren(...Array.from(conversation.children, (element) => element.cloneNode(true)));
          document.querySelector("[data-message-id='service-answer']")!.textContent = type === "memory-analysis"
            ? '<deeprole_data>{"type":"memory-suggestions","items":[{"title":"New result","content":"CORRECT_NEW_RESULT","keywords":[]}]}</deeprole_data>'
            : '<deeprole_data>{"type":"handoff","title":"New result","summary":"CORRECT_NEW_RESULT"}</deeprole_data>';
        });
      }, type);
      expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "current-service", type, bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
      await expect.poll(async () => (await databaseRecords(panel)).filter((row) => row.kind === (type === "handoff" ? "snapshot" : "proposal")).map((row) => type === "handoff" ? row.data.summary : row.data.items[0].content)).toEqual(["CORRECT_NEW_RESULT"]);
      await expect(chat.locator("[data-message-id='ordinary-quote']")).toBeVisible();
      if (type === "memory-analysis") await expect(chat.locator("[data-message-id='service-user']")).toBeHidden();
      else await expect(chat.locator("[data-message-id='service-user']")).toBeVisible();
      await expect(chat.locator("[data-message-id='service-answer']")).toBeVisible();
    } finally { await context.close(); }
  });
}

async function pendingService(panel: Page) {
  return panel.evaluate(async () => {
    const state = await (globalThis as any).chrome.storage.session.get(null);
    return (Object.entries(state).find(([key]) => key.startsWith("deeprole_tab_state_"))?.[1] as any)?.service;
  });
}

test("one analysis plaque survives virtualized request removal and prepares proposals, not lore", async ({}, info) => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route('https://chat.deepseek.com/api/v0/chat/completion', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    await enableServiceComposer(chat);
    expect(await command(panel, { type: 'DR_RUN_SERVICE', request: { id: 'virtual-memory', type: 'memory-analysis', bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(() => {
      const user = document.querySelector<HTMLElement>("[data-message-id='service-user']")!;
      const answer = document.querySelector<HTMLElement>("[data-message-id='service-answer']")!;
      const prompt = user.textContent!; user.removeAttribute('data-message-id'); user.className = 'ds-message'; user.innerHTML = '<div class="ds-collapsible-text"></div>'; user.firstElementChild!.textContent = prompt;
      answer.removeAttribute('data-message-id'); answer.className = 'ds-message';
      for (const [node, key] of [[user, '39'], [answer, '40']] as const) { const wrapper = document.createElement('div'); wrapper.dataset.virtualListItemKey = key; node.before(wrapper); wrapper.append(node); }
      answer.innerHTML = '<div class="ds-markdown ds-assistant-message-main-content"><p>Checking the observatory.</p><p>&lt;deeprole_data&gt;</p></div>';
      const stop = document.createElement('button'); stop.id = 'stop'; stop.setAttribute('aria-label', 'Stop generating'); stop.textContent = 'Stop'; document.querySelector('form')!.append(stop);
    });
    await expect.poll(() => pendingService(panel)).toMatchObject({ replyIdentity: '["virtual","40"]' });
    await expect(chat.locator('[data-deeprole-service-preloader]')).toHaveCount(1);
    await expect(chat.locator('.ds-assistant-message-main-content')).toBeHidden();
    await expect(chat.locator('.ds-collapsible-text')).toBeHidden();
    await chat.screenshot({ path: info.outputPath('analysis-one-plaque.png') });
    await chat.evaluate(() => {
      document.querySelector('[data-virtual-list-item-key="39"]')!.remove();
      const final = document.querySelector('.ds-assistant-message-main-content')!;
      const json = document.createElement('p'); json.textContent = JSON.stringify({ type: 'memory-suggestions', items: [{ title: 'Archive key', content: 'Mira gave the brass archive key to Noah.', keywords: ['key'] }] });
      const end = document.createElement('p'); end.textContent = '</deeprole_data>'; final.append(json, end);
      document.querySelector('#stop')!.remove();
    });
    await expect.poll(() => pendingService(panel)).toBeNull();
    await expect.poll(async () => (await databaseRecords(panel)).filter(row => row.kind === 'proposal').length).toBe(1);
    expect((await databaseRecords(panel)).filter(row => row.kind === 'entry')).toHaveLength(0);
    await expect(chat.getByRole('region', { name: 'Review changes', exact: true }).getByRole('checkbox')).toHaveCount(1);
    await expect(chat.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
    await expect(chat.locator('[data-deeprole-memory-card]')).toHaveCount(1);
    await expect(chat.locator('#conversation')).not.toContainText('deeprole_data', { useInnerText: true });
    await chat.screenshot({ path: info.outputPath('analysis-ready-review.png') });
  } finally { await context.close(); }
});

test("an hour-old empty analysis stops loading even when DeepSeek's stop control is stuck", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await enableServiceComposer(chat);
    await chat.evaluate(() => {
      const request = document.createElement('article'); request.textContent = '[DeepRole Service]\n[Request ID: expired-memory]\nAnalyze';
      const reply = document.createElement('article'); reply.dataset.messageId = 'expired-reply';
      document.querySelector('#conversation')!.append(request, reply);
      const stop = document.createElement('button'); stop.id = 'stuck-stop'; stop.setAttribute('aria-label', 'Stop generating'); stop.textContent = 'Stop'; document.querySelector('form')!.append(stop);
    });
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: 'https://chat.deepseek.com/*', active: true }); await api.storage.session.set({ ['deeprole_tab_state_' + tab.id]: { service: { id: 'expired-memory', type: 'memory-analysis', worldId: null, bookId: null, chatId: 'a', createdAt: Date.now() - 90 * 60_000 } } }); });
    await command(panel, { type: 'DR_DATA_CHANGED' });
    await expect.poll(() => pendingService(panel)).toBeNull();
    await expect(chat.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
    await expect(chat.locator('[data-deeprole-memory-card]')).toHaveAttribute('aria-busy', 'false');
    await expect(chat.locator('[data-deeprole-memory-card]')).toContainText('Could not prepare suggestions');
    expect((await databaseRecords(panel)).filter(row => row.kind === 'proposal' || row.kind === 'entry')).toHaveLength(0);
  } finally { await context.close(); }
});

for (const failSession of [false,true]) test(`failed proposal storage ends the spinner and allows explicit retry (session failure ${failSession})`, async () => {
  const { context, panel, chat, worker } = await setup([]);
  try {
    await context.route('https://chat.deepseek.com/api/v0/chat/completion', route => route.fulfill({contentType:'application/json',body:'{}'}));
    await enableServiceComposer(chat);
    expect(await command(panel,{type:'DR_RUN_SERVICE',request:{id:'storage-failure',type:'memory-analysis',bookId:null,createdAt:Date.now()}})).toEqual({ok:true});
    await worker.evaluate(failSession => {
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,...args){if(value?.kind==='proposal'){IDBObjectStore.prototype.put=original;(globalThis as any).proposalFailed=true;throw new Error('QA proposal storage unavailable');}return original.call(this,value,...args);};
      if(failSession){const api=(globalThis as any).chrome;const set=api.storage.session.set.bind(api.storage.session);api.storage.session.set=(values:any)=>{if(Object.values(values).some((v:any)=>v?.service===null)){api.storage.session.set=set;throw new Error('QA session store unavailable');}return set(values);};}
    },failSession);
    await chat.evaluate(()=>{document.querySelector("[data-message-id='service-answer']")!.textContent='<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Archive key","content":"Noah has the brass key."}]}</deeprole_data>';});
    await expect.poll(()=>worker.evaluate(()=>(globalThis as any).proposalFailed)).toBe(true);
    await expect.poll(()=>command(panel,{type:'DR_GET_PAGE_STATE'})).toMatchObject({activity:{phase:'error',type:'memory-analysis'}});
    await expect(chat.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
    await expect(chat.locator('[data-deeprole-memory-card]')).toHaveAttribute('aria-busy','false');
    expect((await databaseRecords(panel)).filter(row=>row.kind==='proposal'||row.kind==='entry')).toHaveLength(0);
    expect(await command(panel,{type:'DR_RUN_SERVICE',request:{id:'storage-retry',type:'memory-analysis',bookId:null,createdAt:Date.now()}})).toEqual({ok:true});
    await chat.evaluate(()=>{const replies=document.querySelectorAll("[data-message-id='service-answer']");replies[replies.length-1]!.textContent='<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Archive key","content":"Noah has the brass key."}]}</deeprole_data>';});
    await expect.poll(()=>pendingService(panel)).toBeNull();
    await expect.poll(async()=>(await databaseRecords(panel)).filter(row=>row.kind==='proposal').length).toBe(1);
    expect((await databaseRecords(panel)).filter(row=>row.kind==='entry')).toHaveLength(0);
  } finally {await context.close();}
});

for (const type of ["memory-analysis", "handoff"] as const) test(`modern DeepSeek split-span ${type} parses only the final answer`, async ({}, info) => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableServiceComposer(chat);
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: `markdown-${type}`, type, bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(type => {
      const answer = document.querySelector<HTMLElement>("[data-message-id='service-answer']")!;
      answer.removeAttribute("data-message-id"); answer.className = "ds-message";
      const reasoning = document.createElement("div"); reasoning.className = "ds-think-content";
      reasoning.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>';
      const final = document.createElement("div"); final.className = "ds-markdown ds-assistant-message-main-content";
      const explanation = document.createElement("p"); explanation.textContent = "Review before saving. This explanation remains visible.";
      const payload = document.createElement("p"); const start = document.createElement("span"); start.textContent = "<deeprole_data>";
      const end = document.createElement("span"); end.textContent = "</deeprole_data>";
      const json = type === "handoff" ? { type: "handoff", title: "North Tower", summary: "At 18:10 Noah has Mira's map. The brass key must reach Leon by 18:30." }
        : { type: "memory-suggestions", items: ["Noah", "Mira", "Brass key"].map(title => ({ title, content: `QA fact: ${title}.`, keywords: [title] })) };
      payload.append(start, JSON.stringify(json), end); final.append(explanation, payload); answer.append(reasoning, final);
    }, type);
    await expect.poll(async () => (await databaseRecords(panel)).filter(row => row.kind === (type === "handoff" ? "snapshot" : "proposal")).length).toBe(1);
    if (type === "handoff") {
      await expect(chat.locator(".ds-assistant-message-main-content")).toContainText("This explanation remains visible.");
      await expect(chat.locator(".ds-think-content")).toBeVisible();
    } else {
      await expect(chat.locator(".ds-assistant-message-main-content")).toBeHidden();
      await expect(chat.locator(".ds-think-content")).toBeHidden();
      await expect(chat.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
      await expect(chat.locator('[data-deeprole-memory-card]')).toHaveCount(1);
    }
    expect((await databaseRecords(panel)).filter(row => row.kind === "entry")).toHaveLength(0);
    if (type === "memory-analysis") {
      const review = chat.getByRole("region", { name: "Review changes", exact: true });
      await expect(review.getByRole("checkbox")).toHaveCount(3);
      await expect(review.getByRole("button", { name: "Save selected changes · 0", exact: true })).toBeDisabled();
      await review.getByRole("checkbox", { name: "Save this change: Noah", exact: true }).check();
      await review.getByRole("checkbox", { name: "Save this change: Brass key", exact: true }).check();
      await review.getByRole("button", { name: "Save selected changes · 2", exact: true }).click();
      await expect.poll(async () => (await databaseRecords(panel)).filter(row => row.kind === "entry").map(row => row.data.title).sort()).toEqual(["Brass key", "Noah"]);
    }
    await chat.screenshot({ path: info.outputPath(`modern-deepseek-${type}.png`) });
  } finally { await context.close(); }
});

test("handoff survives removal of its command from a virtualized long chat", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableServiceComposer(chat);
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "virtual-handoff", type: "handoff", bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(() => {
      document.querySelector("[data-message-id='service-user']")!.remove();
      const reply = document.querySelector("[data-message-id='service-answer']")!;
      reply.textContent = '<deeprole_data>{"type":"handoff","title":"Gate","summary":"Mira has the map."}</deeprole_data>';
    });
    await expect.poll(async () => (await databaseRecords(panel)).filter(row => row.kind === "snapshot").map(row => row.data.summary)).toEqual(["Mira has the map."]);
    expect(await pendingService(panel)).toBeFalsy();
  } finally { await context.close(); }
});

for (const navigation of ["direct", "SPA"] as const) test(`character sheets: empty roster initializes through the alternate DeepSeek chat URL (${navigation})`, async () => {
  const world = { id: "w", name: "Test world", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ["binding", binding]]);
  try {
    if (navigation === "direct") await chat.goto("https://chat.deepseek.com/a/chat/s/a");
    else {
      await chat.goto("https://chat.deepseek.com/");
      await expect(chat.getByRole("button", { name: /^Context/ })).toBeVisible();
      await chat.evaluate(() => { history.pushState({}, "", "/a/chat/s/a"); window.dispatchEvent(new PopStateEvent("popstate")); });
    }
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /new:Character name/);
    const text = await chat.locator("html").getAttribute("data-deeprole-context");
    const schema = JSON.parse(text!.match(/Schema: (.*)\nRoster:/)![1]!);
    const payload = { ...schema, present: ["new:Noah"], partner: null, updates: [{ id: "new:Noah", state: { emotion: "happy", condition: "", goal: "", relationship: "", stats: [] } }] };
    const append = async (value: any) => chat.evaluate(value => {
      const row = document.createElement("article"); row.dataset.role = "assistant";
      row.dataset.messageId = "reply-" + document.querySelectorAll("article").length;
      const text = document.createElement("div"); text.className = "ds-markdown";
      text.textContent = "Profile check.\n<deeprole_characters>" + JSON.stringify(value) + "</deeprole_characters>";
      row.append(text); document.querySelector("#conversation")!.append(row);
    }, value);
    await append(payload);
    await expect(chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    await expect(chat.locator(".dr-character-row")).toHaveCount(1);
    await expect(chat.locator(".dr-character-row")).toContainText("Noah");
    await expect(chat.locator(".dr-character-row")).toContainText("Happy");
    await chat.locator(".dr-character-row").click();
    await chat.getByRole("dialog").getByRole("textbox", { name: "Appearance and clothing", exact: true }).fill("Blue coat");
    await chat.getByRole("button", { name: "Save character", exact: true }).click();
    await closeSavedCharacter(chat.getByRole("dialog"));
    await expect(chat.getByRole("dialog")).toHaveCount(0);
    expect((await databaseRecords(panel)).find(r => r.kind === "entity").data.characterSheet.appearance).toBe("Blue coat");
    await append({ ...payload, world: "another-world" });
    await expect(chat.locator(".dr-character-status")).toContainText("previous world instance");
    await expect(chat.locator(".dr-character-row")).toHaveCount(1);
    await chat.reload();
    await expect(chat.locator(".dr-character-row")).toContainText("Happy");
  } finally { await context.close(); }
});

test("character sheets: a verified local request ignores obsolete scope tags and shows its interlocutor", async () => {
  const world = { id: "w", name: "World copy", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "hero-local", worldId: "w", name: "Noah", kind: "character", description: "ORIGINAL", aliases: [], memberIds: [], characterSheet: { gender: "male", protagonist: true, appearance: "", personality: "", goals: "", background: "", sprites: {} }, createdAt: 1, updatedAt: 1 };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ["entity", hero], ["binding", binding]]);
  try {
    let schema: any;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => {
      schema = JSON.parse(route.request().postDataJSON().prompt.match(/Schema: (.*)\nRoster:/)[1]);
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Technical check, outside the story." }) }));
    expect(schema.request).toBeTruthy(); expect(schema.world).toBeUndefined();
    const payload = { ...schema, world: "another-browser-world", chat: "obsolete-chat", base: "obsolete-version", present: ["Noah", "new:Mira"], partners: ["new:Mira"], updates: [{ id: "Noah", state: { emotion: "neutral", condition: "", goal: "", relationship: "", stats: [] } }, { id: "new:Mira", name: "Mira", state: { emotion: "happy", condition: "", goal: "", relationship: "", stats: [] } }] };
    const append = (value: any) => chat.evaluate(value => {
      const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "request-" + document.querySelectorAll("article").length;
      const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the letter." }));
      row.textContent = "Technical check.\n<deeprole_characters>" + JSON.stringify(value) + "</deeprole_characters>\n<deeprole_choices>" + JSON.stringify({ version: 1, options: choices }) + "</deeprole_choices>";
      document.querySelector("#conversation")!.append(row);
    }, value);
    await append(payload);
    await expect(chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    await expect(chat.locator(".dr-cast-portrait.right")).toHaveAccessibleName(/Mira/);
    const choiceButtons = chat.locator("[data-deeprole-choices-host]").locator(".grid button");
    await expect(choiceButtons).toHaveCount(4);
    expect(await choiceButtons.evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.choiceKind))).toEqual(["positive", "neutral", "negative", "surprise"]);
    expect(await choiceButtons.evaluateAll(buttons => new Set(buttons.map(button => getComputedStyle(button).backgroundColor)).size)).toBe(1);
    await chat.screenshot({ path: path.resolve("private-assets/character-request-proof-20261003.png") });
    expect((await databaseRecords(panel)).find(r => r.id === hero.id).data.description).toBe("ORIGINAL");
    await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    // The mock server has no history endpoint: restore the saved reply as the
    // real site's history renderer would, without sending another request.
    await append(payload);
    await expect(chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    await append({ ...payload, request: "unrelated-browser-request" });
    await expect(chat.locator(".dr-character-status")).not.toHaveText("Updated after reply");
    await expect(chat.locator(".dr-character-row")).toHaveCount(2);
  } finally { await context.close(); }
});

test("character sheets: independent browser libraries never adopt each other's request", async () => {
  test.setTimeout(60000);
  const world = { id: "w", name: "Same imported world", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const first = await setup([["world", world], ["binding", binding]]);
  let second: Awaited<ReturnType<typeof setup>> | undefined;
  try {
    second = await setup([["world", world], ["binding", binding]]);
    const schemas: any[] = [];
    for (const instance of [first, second]) {
      await instance.context.route("https://chat.deepseek.com/api/v0/chat/completion", route => {
        schemas.push(JSON.parse(route.request().postDataJSON().prompt.match(/Schema: (.*)\nRoster:/)[1]));
        return route.fulfill({ contentType: "application/json", body: "{}" });
      });
      await instance.chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Neutral technical check." }) }));
    }
    expect(schemas[0].request).not.toBe(schemas[1].request);
    const result = (index: number) => ({ request: schemas[index].request, present: ["new:Mira"], partner: "new:Mira", updates: [{ id: "new:Mira", name: "Mira", state: { emotion: "neutral", condition: "", goal: "", relationship: "", stats: [] } }] });
    const append = (instance: typeof first, payload: any) => instance.chat.evaluate(payload => {
      const row = document.createElement("article"); row.dataset.role = "assistant";
      row.textContent = "Technical reply.\n<deeprole_characters>" + JSON.stringify(payload) + "</deeprole_characters>";
      document.querySelector("#conversation")!.append(row);
    }, payload);
    await append(first, result(0)); await expect(first.chat.locator(".dr-character-row")).toHaveCount(1);
    await append(second, result(0)); await expect(second.chat.locator(".dr-character-status")).toContainText("Couldn’t match");
    expect((await databaseRecords(second.panel)).filter(r => r.kind === "entity")).toHaveLength(0);
    await append(second, result(1)); await expect(second.chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    await expect(second.chat.locator(".dr-character-row")).toHaveCount(1);
    const a = (await databaseRecords(first.panel)).find(r => r.kind === "entity");
    const b = (await databaseRecords(second.panel)).find(r => r.kind === "entity");
    expect(a.id).not.toBe(b.id);
  } finally { await first.context.close(); await second?.context.close(); }
});

test("character sheets: real extension sync, manual edits, return and chat isolation", async () => {
  const world = { id: "w", name: "Test world", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const person = { id: "mira", worldId: "w", name: "Mira", kind: "character", description: "ORIGINAL_PROFILE", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: ["mira"], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ["entity", person], ["binding", binding], ["binding", { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" }]]);
  try {
    await expect(chat.locator(".dr-character-row")).toHaveCount(1);
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const s = (await api.storage.local.get("deeprole_settings")).deeprole_settings; await api.storage.local.set({ deeprole_settings: { ...s, characterSheetsEnabled: false } }); });
    await expect(chat.locator(".dr-characters")).toHaveCount(0);
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const s = (await api.storage.local.get("deeprole_settings")).deeprole_settings; await api.storage.local.set({ deeprole_settings: { ...s, characterSheetsEnabled: true } }); });
    await expect(chat.locator(".dr-character-row")).toHaveCount(1);
    const getPayload = async () => {
      const text = await chat.locator("html").getAttribute("data-deeprole-context");
      const schema = JSON.parse(text!.match(/Schema: (.*)\nRoster:/)![1]!);
      return { ...schema, present: ["mira"], updates: [{ id: "mira", state: { emotion: "happy", condition: "Safe at the station", goal: "Find the key", relationship: "Trusts Noah", stats: [{ label: "Energy", value: "Rested" }] } }] };
    };
    const payload = await getPayload();
    await chat.evaluate(value => {
      const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "character-reply";
      const text = document.createElement("div"); text.className = "ds-markdown"; text.textContent = 'Mira smiles at the station.\n<deeprole_characters>' + JSON.stringify(value) + '</deeprole_characters>';
      row.append(text); document.querySelector("#conversation")!.append(row);
    }, payload);
    await expect(chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    await expect(chat.locator(".dr-character-row")).toContainText("Happy");
    const rows = await databaseRecords(panel); const savedBinding = rows.find(r => r.id === binding.id).data;
    expect(savedBinding.characterScenes.w.states.mira.goal).toBe("Find the key"); expect(rows.find(r => r.id === "mira").data.description).toBe("ORIGINAL_PROFILE");
    expect(rows.find(r => r.id === "binding:b").data.characterScenes).toBeUndefined();
    const revision = savedBinding.characterScenes.w.revision;
    await chat.reload(); await expect(chat.locator(".dr-character-row")).toContainText("Happy");
    expect((await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w.revision).toBe(revision);
    await chat.locator(".dr-character-row").click();
    await chat.getByRole("dialog").getByRole("textbox", { name: "Appearance and clothing", exact: true }).fill("MANUAL_BLUE_COAT");
    await chat.getByRole("dialog").getByLabel("My protagonist").check();
    await chat.getByRole("button", { name: "Save character", exact: true }).click();
    await closeSavedCharacter(chat.getByRole("dialog"));
    await expect(chat.getByRole("dialog")).toHaveCount(0);
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue" }) }));
    expect(sent).toHaveLength(1); expect(sent[0]).toContain("MANUAL_BLUE_COAT"); expect(sent[0]).toContain("Find the key"); expect(sent[0]).not.toContain("data:image");
    const manuallySaved = (await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w;
    await chat.evaluate(value => { const article = document.createElement("article"); article.dataset.role = "assistant"; article.dataset.messageId = "old-answer"; article.textContent = '<deeprole_characters>' + JSON.stringify(value) + '</deeprole_characters>'; document.querySelector("#conversation")!.append(article); }, payload);
    await expect(chat.locator(".dr-character-status")).toHaveText("Updated after reply");
    expect((await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w).toEqual(manuallySaved);
    expect((await databaseRecords(panel)).find(r => r.id === "mira").data.characterSheet.appearance).toBe("MANUAL_BLUE_COAT");
    await chat.goto("https://chat.deepseek.com/chat/s/b"); await expect(chat.locator(".dr-character-row")).toContainText("No updates yet");
    await chat.goto("https://chat.deepseek.com/chat/s/a"); await expect(chat.locator(".dr-character-row")).toContainText("Happy");
  } finally { await context.close(); }
});

test("character stats: installed final payload ignores thinking, survives reopening and stays scoped", async ({}, info) => {
  test.setTimeout(60000);
  const world = { id: "w", name: "Test observatory", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const people = ["Noah", "Mira"].map((name, i) => ({ id: name.toLowerCase(), worldId: "w", name, kind: "character", description: "ORIGINAL_PROFILE", aliases: [], memberIds: [], characterSheet: { gender: i ? "female" : "male", protagonist: !i, appearance: "Blue coat", personality: "", goals: "", background: "", sprites: {} }, createdAt: 1, updatedAt: 1 }));
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const lore = { ...entry("canon"), worldId: "w" };
  const { context, panel, chat } = await setup([["world", world], ...people.map(person => ["entity", person] as [string, any]), ["entry", lore], ["binding", binding], ["binding", { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" }]]);
  try {
    const sent: string[] = []; const schemas: any[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { const prompt = route.request().postDataJSON().prompt; sent.push(prompt); schemas.push(JSON.parse(prompt.match(/Schema: (.*)\nRoster:/)[1])); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, examine the sealed letter." }) }));
    const makePayload = (request: string, value = "Rested", emotion = "happy") => ({ request, present: ["Noah", "Mira"], partner: "Mira", updates: [{ id: "Mira", state: { emotion, condition: "Safe", goal: "Find the key", relationship: "Cautious", stats: [{ label: "Energy", value }, { label: "Keys", value: "0" }, { label: "Clues", value: "2" }] } }] });
    const append = (payload: any) => chat.evaluate(payload => {
      const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "stats-answer";
      const thinking = document.createElement("div"); thinking.className = "ds-think-content"; thinking.textContent = "Considering an example: <deeprole_characters>" + JSON.stringify({ ...payload, present: ["Noah"], partner: null, updates: [] }) + "</deeprole_characters>";
      const body = document.createElement("div"); body.className = "ds-markdown"; const raw = '<deeprole_characters>' + JSON.stringify(payload) + '</deeprole_characters>';
      const prefix = document.createElement("p"); prefix.textContent = "Mira raises the lamp."; body.append(prefix);
      for (const part of [raw.slice(0, 40), raw.slice(40, 90), raw.slice(90)]) { const span = document.createElement("span"); span.textContent = part; body.append(span); }
      const suffix = document.createElement("p"); suffix.textContent = "The seal remains intact."; body.append(suffix);
      const choices = document.createElement("p"); choices.textContent = '<deeprole_choices>' + JSON.stringify({ version: 1, options: ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the key." })) }) + '</deeprole_choices>'; body.append(choices);
      row.append(thinking, body); document.querySelector("#conversation")!.replaceChildren(row);
      return thinking.innerHTML;
    }, payload);
    const payload = makePayload(schemas[0].request); const beforeThinking = await append(payload);
    const status = chat.locator(".dr-character-status"); const portrait = chat.locator(".dr-cast-portrait.right"); const tile = chat.locator(".dr-character-row").filter({ hasText: "Mira" });
    await expect(status).toHaveText("Updated after reply"); await expect(portrait).toHaveAccessibleName("Open character: Mira");
    await expect(tile.locator(".dr-character-highlights>span")).toHaveText(["Energy: Rested", "Keys: 0"]); await expect(portrait.locator(".dr-cast-highlights>span")).toHaveText(["Energy: Rested", "Keys: 0"]);
    expect(await chat.locator(".ds-think-content").innerHTML()).toBe(beforeThinking); await expect(chat.locator(".ds-think-content details")).toHaveCount(0);
    await expect(chat.locator(".ds-markdown [data-deeprole-characters-result] pre")).toContainText(JSON.stringify(payload));
    await expect(chat.locator(".ds-markdown [data-deeprole-characters-summary]")).toHaveText("Updated after reply");
    await expect(chat.locator(".ds-markdown")).toContainText("Mira raises the lamp."); await expect(chat.locator(".ds-markdown")).toContainText("The seal remains intact.");
    const rows = await databaseRecords(panel); const savedScene = rows.find(r => r.id === binding.id).data.characterScenes.w;
    expect(rows.find(r => r.kind === "entry").data).toEqual(lore); expect(rows.filter(r => r.kind === "entity").map(r => r.data)).toEqual(expect.arrayContaining(people));
    expect(savedScene.states.mira.stats).toHaveLength(3); expect(rows.find(r => r.id === "binding:b").data.characterScenes).toBeUndefined();
    await chat.screenshot({ path: info.outputPath("installed-character-stats.png") });
    await chat.reload(); await expect(tile.locator(".dr-character-highlights>span")).toHaveText(["Energy: Rested", "Keys: 0"]);
    await append(payload); await expect(status).toHaveText("Updated after reply");
    expect((await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w).toEqual(savedScene);
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue examining the seal." }) }));
    expect(sent).toHaveLength(2); expect(sent[1]).toContain('"label":"Energy","value":"Rested"'); expect(sent[1]).not.toContain("data:image");
    await append(makePayload(schemas[1].request, "Tired", "worried"));
    await expect(tile.locator(".dr-character-highlights>span")).toHaveText(["Energy: Tired", "Keys: 0"]); await expect(portrait.locator("small")).toHaveText("Worried");
    await chat.goto("https://chat.deepseek.com/chat/s/b"); await expect(chat.locator(".dr-character-highlights")).toHaveCount(0); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    expect((await databaseRecords(panel)).find(r => r.id === "binding:b").data.characterScenes).toBeUndefined();
    await chat.goto("https://chat.deepseek.com/chat/s/a"); await expect(tile.locator(".dr-character-highlights>span")).toHaveText(["Energy: Tired", "Keys: 0"]);
    expect((await databaseRecords(panel)).find(r => r.kind === "entry").data).toEqual(lore);
  } finally { await context.close(); }
});

test("manual interlocutor: installed selection, consumed replies and new scenes stay synchronized", async ({}, info) => {
  test.setTimeout(60000);
  const world = { id: "w", name: "Test observatory", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const people = ["Noah", "Mira", "Leon"].map((name, i) => ({ id: name.toLowerCase(), worldId: "w", name, kind: "character", description: "ORIGINAL_PROFILE", aliases: [], memberIds: [], characterSheet: { gender: "neutral", protagonist: !i, appearance: "Blue coat", personality: "", goals: "", background: "", sprites: {} }, createdAt: 1, updatedAt: 1 }));
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ...people.map(person => ["entity", person] as [string, any]), ["binding", binding], ["binding", { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" }]]);
  try {
    const schemas: any[] = []; const prompts: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { const prompt = route.request().postDataJSON().prompt; prompts.push(prompt); schemas.push(JSON.parse(prompt.match(/Schema: (.*)\nRoster:/)[1])); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const send = () => chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira examines the sealed letter." }) }));
    const makePayload = (request: string, condition = "Safe") => ({ request, present: ["Noah", "Mira"], partner: "Mira", updates: [{ id: "Mira", state: { emotion: "happy", condition, goal: "Find the key", relationship: "Cautious", stats: [{ label: "Energy", value: "Rested" }] } }] });
    const append = (payload: any) => chat.evaluate(payload => { const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "manual-partner-scene"; const choices = { version: 1, options: ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the key." })) }; row.textContent = "Mira raises the lamp.\n<deeprole_characters>" + JSON.stringify(payload) + "</deeprole_characters>\n<deeprole_choices>" + JSON.stringify(choices) + "</deeprole_choices>"; document.querySelector("#conversation")!.replaceChildren(row); }, payload);
    await send(); const initial = makePayload(schemas[0].request); await append(initial);
    const status = chat.locator(".dr-character-status"); const portrait = chat.locator(".dr-cast-portrait.right");
    await expect(status).toHaveText("Updated after reply"); await expect(portrait).toHaveAccessibleName("Open character: Mira");
    const before = await databaseRecords(panel); const consumed = before.find(r => r.id === binding.id).data.characterScenes.w.lastReply;
    await chat.getByRole("button", { name: "All · 3", exact: true }).click(); await chat.locator(".dr-character-row").filter({ hasText: "Leon" }).click();
    const dialog = chat.getByRole("dialog"); await characterTab(dialog, "scene"); await expect(dialog.getByRole("checkbox", { name: "In the scene", exact: true })).not.toBeChecked();
    await dialog.getByRole("checkbox", { name: "Talking to the protagonist", exact: true }).check();
    await expect(dialog.getByRole("checkbox", { name: "In the scene", exact: true })).toBeChecked();
    await chat.getByRole("button", { name: "Save character", exact: true }).click(); await closeSavedCharacter(dialog); await expect(dialog).toHaveCount(0);
    await expect(portrait).toHaveAccessibleName("Open character: Leon"); await expect(status).toHaveText("Saved to memory"); expect(prompts).toHaveLength(1);
    const saved = await databaseRecords(panel); const scene = saved.find(r => r.id === binding.id).data.characterScenes.w;
    expect(scene.partnerId).toBe("leon"); expect(scene.presentIds).toEqual(["noah", "mira", "leon"]); expect(scene.lastReply).toBe(consumed);
    expect(saved.find(r => r.id === "binding:b")).toEqual(before.find(r => r.id === "binding:b"));
    for (const person of people) expect(saved.find(r => r.id === person.id).data.description).toBe("ORIGINAL_PROFILE");
    expect(saved.find(r => r.id === "mira")).toEqual(before.find(r => r.id === "mira"));
    await chat.screenshot({ path: info.outputPath("installed-manual-partner.png") });
    await chat.reload(); await append(initial); await expect(status).toHaveText("Updated after reply"); await expect(portrait).toHaveAccessibleName("Open character: Leon");
    expect((await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w).toEqual(scene);
    await send(); expect(prompts).toHaveLength(2); expect(prompts[1]).not.toContain("data:image"); await append(makePayload(schemas[1].request, "At the doorway"));
    await expect(portrait).toHaveAccessibleName("Open character: Mira"); await expect(status).toHaveText("Updated after reply");
    expect((await databaseRecords(panel)).find(r => r.id === binding.id).data.characterScenes.w.presentIds).toEqual(["noah", "mira"]);
    await chat.goto("https://chat.deepseek.com/chat/s/b"); await expect(chat.locator(".dr-character-row-mood")).toHaveText(["No updates yet", "No updates yet", "No updates yet"]);
    expect((await databaseRecords(panel)).find(r => r.id === "binding:b")).toEqual(before.find(r => r.id === "binding:b"));
    await chat.goto("https://chat.deepseek.com/chat/s/a"); await append(makePayload(schemas[1].request, "At the doorway")); await expect(portrait).toHaveAccessibleName("Open character: Mira");
    expect(prompts).toHaveLength(2);
  } finally { await context.close(); }
});

test("character cast: installed roster, preview, focus and outgoing mood stay synchronized", async ({}, info) => {
  test.setTimeout(60000);
  const world = { id: "w", name: "Test observatory", description: "", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const people = Array.from({ length: 40 }, (_, i) => ({ id: i === 0 ? "hero" : i === 1 ? "mira" : `extra-${i}`, worldId: "w", name: i === 0 ? "Noah" : i === 1 ? "Mira" : `Character ${i}`, kind: "character", description: "ORIGINAL", aliases: i === 1 ? ["Engineer"] : [], memberIds: [], characterSheet: { gender: "neutral", protagonist: i === 0, appearance: "", personality: "", goals: "", background: "", sprites: {} }, createdAt: 1, updatedAt: 1 }));
  const state = { emotion: "happy", condition: "Safe", goal: "Find the key", relationship: "", stats: [] };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, characterScenes: { w: { revision: "v", presentIds: ["hero", "mira"], partnerId: "mira", states: { mira: state }, updatedAt: 1 } }, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([["world", world], ...people.map(person => ["entity", person] as [string, any]), ["binding", binding], ["binding", { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b", characterScenes: {} }]]);
  try {
    const tiles = chat.locator(".dr-character-row"); await expect(tiles).toHaveCount(2);
    await chat.getByRole("button", { name: "All · 40", exact: true }).click();
    const search = chat.getByRole("searchbox", { name: "Find a character", exact: true });
    await search.fill("Engineer"); await expect(tiles).toHaveCount(1); await expect(tiles).toContainText("Mira");
    await chat.getByRole("button", { name: "In scene · 2", exact: true }).click();
    await chat.evaluate(() => { const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "scene-roster"; const options = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the key." })); row.textContent = "Mira holds the key.\n<deeprole_choices>" + JSON.stringify({ version: 1, options }) + "</deeprole_choices>"; document.querySelector("#conversation")!.append(row); });
    const portrait = chat.locator(".dr-cast-portrait.right"); await expect(portrait).toHaveAccessibleName("Open character: Mira");
    await portrait.focus(); await portrait.press("Enter"); const dialog = chat.getByRole("dialog");
    await characterTab(dialog, "images");
    await expect(dialog.getByLabel("Portrait emotion", { exact: true })).toHaveValue("happy");
    await dialog.getByLabel("Portrait emotion", { exact: true }).selectOption("angry");
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click(); await expect(dialog).toHaveCount(0); await expect(portrait).toBeFocused();
    await portrait.press("Enter"); await characterTab(dialog, "scene"); await dialog.getByLabel("Mood", { exact: true }).selectOption("worried");
    await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await closeSavedCharacter(dialog); await expect(dialog).toHaveCount(0);
    await expect(portrait).toBeFocused(); await expect(portrait.locator("small")).toHaveText("Worried");
    const rows = await databaseRecords(panel); expect(rows.find(r => r.id === "binding:a").data.characterScenes.w.states.mira.emotion).toBe("worried");
    expect(rows.filter(r => r.kind === "entity")).toHaveLength(40); expect(rows.find(r => r.id === "mira").data.description).toBe("ORIGINAL");
    const sent: string[] = []; await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, shall we examine the key?" }) }));
    expect(sent).toHaveLength(1); expect(sent[0]).toContain('"emotion":"worried"'); expect(sent[0]).not.toContain("data:image");
    await chat.screenshot({ path: info.outputPath("installed-cast.png") });
    await chat.goto("https://chat.deepseek.com/chat/s/b"); await expect(tiles).toHaveCount(40); await expect(search).toHaveCount(0);
    await expect(chat.locator(".dr-characters")).toContainText("showing everyone");
    await chat.goto("https://chat.deepseek.com/chat/s/a"); await expect(tiles).toHaveCount(2); await expect(tiles.filter({ hasText: "Mira" })).toContainText("Worried");
    await chat.reload(); await expect(tiles).toHaveCount(2); await expect(tiles.filter({ hasText: "Mira" })).toContainText("Worried");
  } finally { await context.close(); }
});

const choicesWorld = { id: "choices-world", name: "Test observatory", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const choicesBinding = { id: "binding:a", chatId: "a", worldId: choicesWorld.id, bookId: null, focusIds: [], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const choicesPayload = '<deeprole_choices>' + JSON.stringify({ version: 1, options: ["positive", "neutral", "negative", "surprise"].map((kind) => ({ kind, label: "Move " + kind, text: "MY_MOVE_" + kind })) }) + '</deeprole_choices>';
test("automatic choices loader starts with hidden transport, not story or thinking, in the installed extension", async ({}, info) => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    await chat.setViewportSize({ width: 1600, height: 800 }); await chat.addStyleTag({ content: "main { max-width:690px; margin:0 auto; }" });
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat);
    const loader = chat.locator("[data-deeprole-choices-loading]");
    const request = chat.getByRole("button", { name: "Suggest options", exact: true });
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY_UNSENT_DRAFT");
    await chat.evaluate(payload => {
      const stop = document.createElement("button"); stop.dataset.testid = "stop-generation"; stop.textContent = "Stop"; document.body.append(stop);
      const row = document.querySelector("[data-message-id='answer']")!;
      const thought = document.createElement("div"); thought.className = "ds-think-content"; thought.textContent = payload;
      const body = document.createElement("div"); body.className = "ds-markdown"; body.textContent = "Mira opens the gate.";
      row.replaceChildren(thought, body);
    }, choicesPayload);
    await expect(request).toHaveCount(0); await expect(loader).toHaveCount(0);
    await chat.screenshot({ path: info.outputPath("story-no-loader.png") });
    const firstPaint = await chat.locator(".ds-markdown").evaluate(async body => {
      body.append(' <deeprole_characters>{"request":"');
      await new Promise(resolve => requestAnimationFrame(resolve));
      return { text: (body as HTMLElement).innerText, loaders: document.querySelectorAll("[data-deeprole-choices-loading]").length };
    });
    expect(firstPaint).toEqual({ text: "Mira opens the gate.", loaders: 1 });
    await chat.locator(".ds-markdown").evaluate((body, payload) => { body.append('abc"}</deeprole_characters> ' + payload.slice(0, 75)); }, choicesPayload);
    await expect(loader).toHaveCount(1); await expect(chat.locator(".ds-markdown")).toHaveText("Mira opens the gate.", { useInnerText: true });
    await chat.screenshot({ path: info.outputPath("json-loader.png") });
    await chat.locator(".ds-markdown").evaluate((body, payload) => { body.textContent = "Mira opens the gate. " + payload; }, choicesPayload);
    await expect(loader).toHaveCount(1); await expect(chat.locator("[data-deeprole-choices-host]")).toHaveCount(0);
    await chat.locator("[data-testid='stop-generation']").evaluate(stop => stop.remove());
    await expect(chat.getByRole("button", { name: /Move positive/ })).toBeVisible(); await expect(loader).toHaveCount(0);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_UNSENT_DRAFT");
    expect(sent).toBe(0); expect((await databaseRecords(panel)).filter(row => row.kind === "entry")).toHaveLength(0);
  } finally { await context.close(); }
});
test("existing choices render without a connected world, but send nothing and respect the setting", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(payload => {
      const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "saved-scene";
      row.textContent = "Mira waits by the archive. " + payload; document.querySelector("#conversation")!.append(row);
    }, choicesPayload);
    await expect(chat.getByRole("button", { name: /Move positive/ })).toBeVisible();
    await expect(chat.locator("[data-deeprole-choices-recovery]")).toHaveCount(0);
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /deeprole_choice_mode/);
    await chat.getByRole("button", { name: /Move positive/ }).click();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_MOVE_positive");
    expect(sent).toBe(0); expect(await databaseRecords(panel)).toHaveLength(0);
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const values = await api.storage.local.get("deeprole_settings"); await api.storage.local.set({ deeprole_settings: { ...values.deeprole_settings, sceneChoicesEnabled: false } }); });
    await command(panel, { type: "DR_DATA_CHANGED" });
    await expect(chat.locator("[data-deeprole-choices-host]")).toHaveCount(0);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_MOVE_positive");
  } finally { await context.close(); }
});
async function enableChoicesScene(chat: Page) {
  await enableServiceComposer(chat);
  await chat.locator("[data-message-id='user']").evaluate((row) => row.setAttribute("data-role", "user"));
  await chat.locator("[data-message-id='answer']").evaluate((row) => row.setAttribute("data-role", "assistant"));
  await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toBeVisible();
}

test("scene recovery waits for response JSON before a loader, then survives reopening without another request", async () => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    // Match DeepSeek's centered conversation column, outside the fixed context widget.
    await chat.setViewportSize({ width: 1600, height: 800 });
    await chat.addStyleTag({ content: "main { max-width:690px; margin:0 auto; }" });
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON()?.prompt ?? ""); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront();
    expect(sent).toEqual([]);
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toContain("[DeepRole Scene Choices]"); expect(sent[0]).toContain("Do not continue or rewrite the scene");
    await expect(chat.locator("[data-message-id='service-user']")).toBeHidden();
    await expect(chat.locator("[data-deeprole-choices-loading]")).toHaveCount(0);
    await expect(chat.locator("[data-message-id='answer']")).toHaveText("The gate opened.");
    await expect.poll(() => pendingService(panel)).toMatchObject({ type: "scene-choices" });
    const pending = await pendingService(panel); expect(pending.baseVersions).toBeUndefined(); expect(pending.sceneSignature).not.toContain("gate opened");
    await chat.locator("[data-message-id='service-answer']").evaluate(row => { row.setAttribute("data-role", "assistant"); row.textContent = "Preparing the next move."; });
    await expect(chat.locator("[data-deeprole-choices-loading]")).toHaveCount(0);
    await chat.locator("[data-message-id='service-answer']").evaluate((row, text) => { row.textContent = text.slice(0, 75); }, choicesPayload);
    await expect(chat.locator("[data-deeprole-choices-loading]")).toHaveCount(1);
    await expect(chat.locator("[data-message-id='service-answer']")).not.toContainText("deeprole_choices", { useInnerText: true });
    await chat.locator("[data-message-id='service-answer']").evaluate((row, text) => { row.setAttribute("data-role", "assistant"); row.textContent = text; }, choicesPayload);
    await expect.poll(() => pendingService(panel)).toBeNull();
    await expect(chat.getByRole("button", { name: /Move positive/ })).toBeVisible();
    await chat.getByRole("button", { name: /Move positive/ }).click();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_MOVE_positive"); expect(sent).toHaveLength(1);
    await chat.getByRole("button", { name: /Move neutral/ }).click();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_MOVE_neutral");
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY_EDITED_MOVE");
    await chat.getByRole("button", { name: /Move negative/ }).click();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_EDITED_MOVE");
    const historyHtml = await chat.locator("#conversation").evaluate((row) => row.innerHTML);
    await context.route("https://chat.deepseek.com/chat/s/a", (route) => route.fulfill({ contentType: "text/html", body: fixture.replace('<div id="conversation"></div>', `<div id="conversation">${historyHtml}</div>`) }));
    await chat.goto("about:blank"); await chat.goto("https://chat.deepseek.com/chat/s/a");
    await expect(chat.getByRole("button", { name: /Move positive/ })).toBeVisible(); expect(sent).toHaveLength(1);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    const records = await databaseRecords(panel); expect(records.filter((row) => ["entry", "proposal", "snapshot"].includes(row.kind))).toEqual([]);
  } finally { await context.close(); }
});

test("scene choices: full text, keyboard, expired turns and return use the installed extension", async ({}, info) => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.setViewportSize({ width: 900, height: 760 });
    await enableChoicesScene(chat);
    const longText = 'I examine the seal, without opening the envelope or taking it from Mira. '.repeat(7);
    const options = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: "Move " + kind, text: kind === "neutral" ? longText : "MY_MOVE_" + kind }));
    const reply = '<deeprole_choices>' + JSON.stringify({ version: 1, options }) + '</deeprole_choices>';
    await chat.locator("[data-message-id='answer']").evaluate((row, payload) => { row.textContent = 'Mira holds a sealed envelope.\n' + payload; }, reply);
    const card = chat.locator("[data-deeprole-choices-host]");
    const buttons = card.locator(".grid button");
    const composer = chat.getByRole("textbox", { name: "Message", exact: true });
    await expect(buttons).toHaveCount(4);
    const expand = card.getByRole("button", { name: "Full text", exact: true });
    await expect(expand.locator("svg")).toHaveCount(1); expect(await expand.textContent()).toBe("");
    expect(await expand.evaluate(button => [button.getBoundingClientRect().width, button.getBoundingClientRect().height])).toEqual([32, 32]);
    await expect(card.locator(".choice-status")).toBeHidden();
    await expect(card).not.toContainText("A choice fills the message box");
    await expand.click();
    await expect(card.locator(".preview").nth(1)).toHaveText(longText);
    await expect(composer).toHaveValue(""); expect(sent).toBe(0);
    await buttons.first().focus(); await chat.keyboard.press("ArrowDown"); await expect(buttons.nth(2)).toBeFocused();
    await chat.keyboard.press("4"); await expect(composer).toHaveValue("MY_MOVE_surprise"); await expect(composer).toBeFocused();
    await buttons.nth(1).click(); await expect(composer).toHaveValue(longText);
    await expect(card.locator(".choice-status")).toBeHidden(); await expect(card.locator(".choice-status")).toHaveText("");
    await composer.fill("MY EDITED MOVE"); await buttons.first().focus(); await chat.keyboard.press("Enter");
    await expect(card.locator(".choice-status")).toContainText("The option was not inserted"); await expect(buttons.first()).toBeFocused();
    const savedHistory = await chat.locator("#conversation").evaluate(row => row.innerHTML);
    await chat.screenshot({ path: info.outputPath("installed-choice-text.png") });
    // The DOM changes and the click happen in one task, before the observer can clear the old card.
    await buttons.first().evaluate(button => {
      const row = document.createElement("article"); row.dataset.messageId = "new-scene"; row.dataset.role = "assistant"; row.textContent = "A new scene at the tower.";
      document.querySelector("#conversation")!.append(row); (button as HTMLButtonElement).click();
    });
    await expect(composer).toHaveValue("MY EDITED MOVE"); expect(sent).toBe(0);
    await expect(buttons).toHaveCount(0);
    await chat.evaluate(() => { history.pushState({}, "", "/chat/s/b"); });
    await expect.poll(() => command(panel, { type: "DR_GET_PAGE_STATE" })).toMatchObject({ chatId: "b", scene: { worldId: null } });
    await expect(card).toHaveCount(0);
    await context.route("https://chat.deepseek.com/chat/s/a", route => route.fulfill({ contentType: "text/html", body: fixture.replace('<div id="conversation"></div>', `<div id="conversation">${savedHistory}</div>`) }));
    await chat.goto("about:blank"); await chat.goto("https://chat.deepseek.com/chat/s/a");
    await expect(buttons).toHaveCount(4); await expect(card.getByRole("button", { name: "Full text", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(composer).toHaveValue(""); expect(sent).toBe(0);
    expect((await databaseRecords(panel)).filter(row => ["entry", "proposal", "snapshot"].includes(row.kind))).toEqual([]);
  } finally { await context.close(); }
});

test("scene recovery never overwrites a draft or submits twice", async () => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront();
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY_UNSENT_DRAFT");
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect(chat.getByText("Finish or clear your current draft first.", { exact: true })).toBeVisible();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_UNSENT_DRAFT"); expect(sent).toBe(0);
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("");
    await chat.getByRole("button", { name: "Suggest options", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect.poll(() => sent).toBe(1);
    await expect.poll(() => pendingService(panel)).toMatchObject({ type: "scene-choices" });
  } finally { await context.close(); }
});

for (const interrupt of ["draft", "scene", "chat"] as const) test(`scene recovery cancels safely when ${interrupt} changes while preparing`, async () => {
  const { context, panel, chat, worker } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront(); await holdNextVaultRead(worker);
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect.poll(() => worker.evaluate(() => (globalThis as any).readHeld)).toBe(true);
    if (interrupt === "draft") await chat.getByRole("textbox", { name: "Message", exact: true }).fill("TYPED_DURING_PREPARATION");
    else await chat.evaluate((interrupt) => {
      if (interrupt === "chat") history.pushState({}, "", "/chat/s/b");
      document.querySelector("[data-message-id='answer']")!.textContent = "A different scene.";
    }, interrupt);
    await worker.evaluate(() => (globalThis as any).releaseRead());
    if (interrupt === "chat") {
      await expect.poll(() => command(panel, { type: "DR_GET_PAGE_STATE" })).toMatchObject({ chatId: "b", scene: { worldId: null }, activity: null });
      await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toHaveCount(0);
    } else await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toBeEnabled();
    expect(sent).toBe(0); expect(await pendingService(panel)).toBeFalsy();
    if (interrupt === "draft") await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("TYPED_DURING_PREPARATION");
  } finally { await worker.evaluate(() => (globalThis as any).releaseRead?.()).catch(() => undefined); await context.close(); }
});

test("a failed options response allows an explicit retry without writing lore", async () => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront(); await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect.poll(() => pendingService(panel)).toMatchObject({ type: "scene-choices" });
    await chat.locator("[data-message-id='service-answer']").evaluate((row) => { row.textContent = "Message is generating, try again later."; });
    await expect.poll(() => pendingService(panel)).toBeNull();
    await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click(); await expect.poll(() => sent).toBe(2);
    expect((await databaseRecords(panel)).filter((row) => ["entry", "proposal", "snapshot"].includes(row.kind))).toEqual([]);
  } finally { await context.close(); }
});

test("a failed options transport restores the request button without automatic retries", async () => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront(); await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect.poll(() => sent).toBe(1); await expect.poll(() => pendingService(panel)).toBeNull();
    await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click(); await expect.poll(() => sent).toBe(2);
    expect((await databaseRecords(panel)).filter((row) => ["entry", "proposal", "snapshot"].includes(row.kind))).toEqual([]);
  } finally { await context.close(); }
});

test("aborting a service after headers releases analysis and allows an explicit retry", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    let sent = 0;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent++; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableServiceComposer(chat); await chat.bringToFront();
    const request = { id: "stream-abort", type: "memory-analysis", bookId: null, createdAt: Date.now() };
    expect(await command(panel, { type: "DR_RUN_SERVICE", request })).toEqual({ ok: true });
    await expect.poll(() => chat.evaluate(() => (window as any).serviceTransports[0]?.headersReceived)).toBe(true);
    await chat.evaluate(() => (window as any).serviceTransports[0].controller.abort());
    await expect.poll(() => pendingService(panel)).toBeNull();
    expect(sent).toBe(1); // No automatic resend.
    expect((await databaseRecords(panel)).filter((row) => ["entry", "proposal", "snapshot"].includes(row.kind))).toEqual([]);
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { ...request, id: "stream-retry", createdAt: Date.now() } })).toEqual({ ok: true });
    await expect.poll(() => sent).toBe(2);
    await expect.poll(() => pendingService(panel)).toMatchObject({ id: "stream-retry" });
  } finally { await context.close(); }
});

test("a late abort of a completed service never clears the next partial reply", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableServiceComposer(chat); await chat.bringToFront();
    const request = { id: "finished-service", type: "memory-analysis", bookId: null, createdAt: Date.now() };
    expect(await command(panel, { type: "DR_RUN_SERVICE", request })).toEqual({ ok: true });
    await expect.poll(() => chat.evaluate(() => (window as any).serviceTransports[0]?.headersReceived)).toBe(true);
    await chat.evaluate(() => { document.querySelector("[data-message-id='service-answer']")!.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>'; });
    await expect.poll(() => pendingService(panel)).toBeNull();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { ...request, id: "next-service", createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(() => {
      const replies = document.querySelectorAll("[data-message-id='service-answer']");
      replies[replies.length - 1]!.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[';
      (window as any).serviceTransports[0].controller.abort();
    });
    await expect.poll(() => pendingService(panel)).toMatchObject({ id: "next-service" });
    // Allow the debounced DOM scan and delayed failure message to arrive.
    await chat.waitForTimeout(600);
    expect(await pendingService(panel)).toMatchObject({ id: "next-service" });
    expect((await databaseRecords(panel)).filter((row) => row.kind === "proposal")).toEqual([]);
    await chat.evaluate(() => {
      const replies = document.querySelectorAll("[data-message-id='service-answer']");
      replies[replies.length - 1]!.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Current","content":"ONLY_CURRENT_RESULT","keywords":[]}]}</deeprole_data>';
    });
    await expect.poll(async () => (await databaseRecords(panel)).filter((row) => row.kind === "proposal").map((row) => row.data.items[0].content)).toEqual(["ONLY_CURRENT_RESULT"]);
    await expect.poll(() => pendingService(panel)).toBeNull();
  } finally { await context.close(); }
});

test("a completed handoff never navigates away from a newly typed message", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableServiceComposer(chat); await chat.bringToFront();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "continue-test", type: "continue-handoff", bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("MY_NEW_MESSAGE");
    await chat.evaluate(() => { document.querySelector("[data-message-id='service-answer']")!.textContent = '<deeprole_data>{"type":"handoff","title":"Gate","summary":"Mira is at the gate."}</deeprole_data>'; });
    await expect.poll(async () => (await databaseRecords(panel)).filter((row) => row.kind === "snapshot").length).toBe(1);
    await chat.waitForTimeout(1000); // Delayed navigation must not run after completion.
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/a");
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("MY_NEW_MESSAGE");
  } finally { await context.close(); }
});

test("an idle completed handoff opens a new chat and keeps its full 30000-character context", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    const sent: string[] = []; const navigated: string[] = [];
    chat.on("framenavigated", frame => { if (frame === chat.mainFrame()) navigated.push(frame.url()); });
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => {
      sent.push(route.request().postDataJSON().prompt);
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    // The fresh page must behave like DeepSeek too: a submit is an API request,
    // not a native HTML form navigation that destroys the content-script listener.
    await context.addInitScript(() => {
      window.addEventListener("DOMContentLoaded", () => {
        if (location.pathname !== "/") return;
        document.querySelector("form")!.addEventListener("submit", event => {
          event.preventDefault();
          const composer = document.querySelector("textarea")!; const prompt = composer.value;
          composer.value = "";
          void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt }) }).then(() => {
            history.pushState({}, "", "/chat/s/continued");
            document.querySelector("#conversation")!.textContent = "Noah reached the gate.";
          });
        });
      }, { once: true });
    });
    await enableServiceComposer(chat); await chat.bringToFront();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "idle-continue-test", type: "continue-handoff", bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    const summary = "IDLE_SAVED_GATE" + "a".repeat(30000 - "IDLE_SAVED_GATE".length);
    await chat.evaluate(summary => { document.querySelector("[data-message-id='service-answer']")!.textContent = '<deeprole_data>' + JSON.stringify({ type: "handoff", title: "Gate", summary }) + '</deeprole_data>'; }, summary);
    await expect.poll(() => navigated).toContain("https://chat.deepseek.com/");
    await expect.poll(() => sent.filter(prompt => prompt.includes(summary)).length).toBe(1);
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/continued");
    await expect.poll(() => command(panel, { type: "DR_GET_PAGE_STATE" }).catch(() => null)).toMatchObject({ type: "DR_PAGE_STATE", chatId: "continued" });
    await expect.poll(async () => Boolean((await databaseRecords(panel)).find(row => row.kind === "snapshot").data.appliedAt)).toBe(true);
    expect((await databaseRecords(panel)).find(row => row.kind === "snapshot").data.summary).toBe(summary);
    // Accepted context is consumed once, not included again in the next send.
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /IDLE_SAVED_GATE/);
    expect(await command(panel, { type: "DR_APPLY_SNAPSHOT", snapshotId: "deleted-snapshot" })).toEqual({ ok: false });
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /IDLE_SAVED_GATE/);
  } finally { await context.close(); }
});

test("the menu and background writer use one cross-window library lock", async () => {
  const { context, panel, chat, worker } = await setup([]);
  try {
    await panel.evaluate(() => {
      const gate = new Promise<void>((resolve) => { (window as any).releaseLock = resolve; });
      (window as any).heldLock = navigator.locks.request("deeprole-library-vault", async () => { (window as any).lockReady = true; await gate; });
    });
    await expect.poll(() => panel.evaluate(() => (window as any).lockReady)).toBe(true);
    await chat.bringToFront(); await startCommand(panel, { type: "DR_SAVE_SELECTION", text: "CROSS_WINDOW_SAVE" });
    // The background's initial lock check is a reader and must wait too.
    await expect.poll(() => worker.evaluate(async () => (await navigator.locks.query()).pending?.some((lock) => lock.name === "deeprole-library-vault"))).toBe(true);
    expect((await databaseRecords(panel)).filter((row) => row.kind === "entry")).toEqual([]);
    await panel.evaluate(() => (window as any).releaseLock());
    expect(await panel.evaluate(() => (window as any).pendingCommand)).toEqual({ ok: true });
    expect((await databaseRecords(panel)).filter((row) => row.kind === "entry").map((row) => row.data.content)).toEqual(["CROSS_WINDOW_SAVE"]);
  } finally { await panel.evaluate(() => (window as any).releaseLock?.()).catch(() => undefined); await context.close(); }
});

for (const destinationKnown of [false, true]) test(`continuing into a fresh chat preserves the world, book and scene focus without leaking chat-only overrides (destination ${destinationKnown})`, async () => {
  const world = { id: "transfer-world", name: "North Tower", description: "", color: "#9aaeff", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "transfer-hero", worldId: world.id, kind: "character", name: "Noah", description: "Archivist", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1,
    characterSheet: { gender: "male", protagonist: true, appearance: "Blue coat", personality: "Patient", goals: "Find the key", background: "", sprites: {} } };
  const book = { id: "transfer-book", worldId: world.id, name: "Tower rules", description: "", color: "#9aaeff", active: true, createdAt: 1, updatedAt: 1 };
  const binding = { id: "a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: world.id, bookId: book.id, focusIds: [hero.id], memoryOverrides: { includedIds: ["chat-only"], excludedIds: [] }, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat } = await setup([
    ["world", world], ["book", book], ["entity", hero], ["binding", binding],
    ["entry", { ...entry("rule"), worldId: world.id, bookId: book.id, activation: "always" }],
    ["entry", { ...entry("chat-only"), worldId: world.id, bookId: book.id, activation: "manual" }],
    ["entry", { ...entry("other-world"), worldId: "elsewhere", activation: "always" }],
  ]);
  try {
    const sent: string[] = [];
    await context.addInitScript((destinationKnown) => {
      window.addEventListener("DOMContentLoaded", () => {
        if (location.pathname !== "/") return;
        document.querySelector("form")!.addEventListener("submit", event => {
          event.preventDefault(); const composer = document.querySelector("textarea")!;
          const prompt = composer.value; composer.value = "";
          void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, ...(destinationKnown ? { chat_session_id: "world-continued" } : {}) }) }).then(() => {
            history.pushState({}, "", "/chat/s/world-continued");
            const request = document.documentElement.dataset.lastCharacterRequest;
            document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="fresh-answer"><div class="ds-markdown"></div></article>';
            document.querySelector(".ds-markdown")!.textContent = "Noah waits in the tower." + (request ? '<deeprole_characters>' + JSON.stringify({ request, present: ["Noah"], partner: null, updates: [{ id: "Noah", name: "Noah", state: { emotion: "happy", condition: "Safe", goal: "Find the key", relationship: "", stats: [] } }] }) + '</deeprole_characters>' : "");
          });
        });
      }, { once: true });
    }, destinationKnown);
    // Inspect only the synthetic request at the network boundary, then mimic
    // the model echoing its exact request marker in the first story reply.
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", async route => {
      const prompt = route.request().postDataJSON().prompt; sent.push(prompt);
      const request = prompt.match(/Schema: (.*)\nRoster:/)?.[1];
      if (request) await chat.evaluate(id => { document.documentElement.dataset.lastCharacterRequest = id; }, JSON.parse(request).request);
      await route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await enableServiceComposer(chat); await chat.bringToFront();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "world-continue-test", type: "continue-handoff", bookId: book.id, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(() => { document.querySelector("[data-message-id='service-answer']")!.textContent = '<deeprole_data>' + JSON.stringify({ type: "handoff", title: "North Tower", summary: "TRANSFER_SCENE: Noah has a brass key. Mira waits at 18:10." }) + '</deeprole_data>'; });
    await expect(chat).toHaveURL("https://chat.deepseek.com/chat/s/world-continued", { timeout: 20000 });
    const prompt = sent.find(value => value.includes("[Story handoff — scene reference, not new permanent lore]"))!;
    expect(prompt).toContain("TRANSFER_SCENE"); expect(prompt).toContain("CANON_rule");
    expect(prompt).toContain("Blue coat"); expect(prompt).toContain("Noah");
    expect(prompt).not.toContain("CANON_other-world"); expect(prompt).not.toContain("CANON_chat-only");
    await expect.poll(async () => (await databaseRecords(panel)).find(row => row.kind === "binding" && row.data.chatId === "world-continued")?.data).toMatchObject({ worldId: world.id, bookId: book.id, focusIds: [hero.id] });
    const records = await databaseRecords(panel);
    expect(records.find(row => row.kind === "entity" && row.id === hero.id).data).toEqual(hero);
    expect(records.find(row => row.kind === "binding" && row.id === "a").data.memoryOverrides).toEqual(binding.memoryOverrides);
    if (destinationKnown) {
      expect(prompt).toContain("Schema:");
      await expect.poll(async () => (await databaseRecords(panel)).find(row => row.kind === "binding" && row.data.chatId === "world-continued")?.data.characterScenes?.[world.id]?.states?.[hero.id]).toMatchObject({ emotion: "happy", condition: "Safe" });
    } else expect(prompt).not.toContain("Schema:");
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /TRANSFER_SCENE/);
    await chat.reload();
    await expect(chat.getByRole("combobox", { name: "World", exact: true })).toHaveValue(world.id);
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /CANON_rule/);
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /TRANSFER_SCENE|CANON_other-world|CANON_chat-only/);
  } finally { await context.close(); }
});

for (const scenario of ["reference", "text", "refusal", "low-trust", "unrequested", "button"] as const) test("generated selfie runtime " + scenario + ": one request, consent and reload", async () => {
  test.setTimeout(60000);
  const world = { id: "world", name: "Harbor", description: "ORIGINAL WORLD", color: "blue", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "hero", worldId: "world", name: "Leon", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
  const image = "data:image/png;base64," + selfiePng;
  const mira = { ...hero, id: "mira", name: "Mira", description: "ORIGINAL LORE", characterSheet: { ...EMPTY_CHARACTER, appearance: "Copper hair, brown eyes.", relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: scenario === "low-trust" ? 10 : 80, affinity: 80 } }, ...(scenario === "reference" ? { portraitLibrary: [image], imageGeneration: { canonical: "Copper hair, brown eyes.", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(image) } } : {}) } };
  const binding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "world", bookId: null, focusIds: [hero.id, mira.id], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const { context, panel, chat, worker } = await setup([["world", world], ["entity", hero], ["entity", mira], ["binding", binding]]);
  try {
    const config = { ...selfieImageConfig, baseUrl: "https://chat.deepseek.com/mock-image-api", editModelId: "synthetic-qwen-edit" };
    await panel.evaluate(async ({ config, settings }) => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true, characterSheetsEnabled: true }, deeprole_image_settings: settings, deeprole_image_keys: { [config.id]: "SYNTHETIC-KEY" }, deeprole_library_change: { token: "selfie-settings" } }); }, { config, settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [config], profileByLevel: { off: config.id } } });
    await worker.evaluate(({ png }) => {
      (globalThis as any).selfieImageRequests = [];
      globalThis.fetch = async (url, init) => { (globalThis as any).selfieImageRequests.push({ url: String(url), body: init?.body }); return new Response(JSON.stringify({ data: [{ b64_json: png }] }), { headers: { "content-type": "application/json" } }); };
    }, { png: selfiePng });
    await chat.reload(); await chat.bringToFront();
    await expect(chat.getByRole("button", { name: /^Context/ })).toBeVisible();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /Character sheet enabled/);
    await chat.addStyleTag({ content: "#conversation{max-width:640px;margin:160px auto 0}" });
    let prompt = ""; await context.route("**/api/v0/chat/completion", route => { prompt = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    if (scenario === "button") {
      await chat.evaluate(() => {
        const input = document.querySelector("textarea")!;
        input.value = "MY DRAFT"; input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("form")!.addEventListener("submit", e => { e.preventDefault(); void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: input.value, chat_session_id: "a" }) }); });
      });
      const button = chat.locator(".dr-character-person").filter({ hasText: "Mira" }).getByRole("button", { name: "Ask for a selfie", exact: true }); await button.click();
      await expect(chat.locator("textarea")).toHaveValue("MY DRAFT"); await expect(chat.locator(".dr-selfie-request [role=alert]")).toContainText("draft"); expect(prompt).toBe("");
      await chat.locator("textarea").fill(""); await button.click();
    } else await chat.evaluate(text => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: text, chat_session_id: "a" }) }), scenario === "unrequested" ? "Continue the scene." : "Mira, send me a selfie if you feel comfortable.");
    await expect.poll(() => prompt).toContain("Schema:");
    if (scenario !== "unrequested") expect(prompt).toContain('category="generated"');
    expect(prompt).not.toContain("data:image"); expect(prompt).not.toContain("SYNTHETIC-KEY");
    const schema = JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
    const quote = scenario === "refusal" ? "Mira will not send Leon a selfie tonight." : "Mira smiles and sends Leon a selfie from home.";
    const turn = { request: schema.request, present: ["Leon", "Mira"], partners: ["Mira"], updates: [], selfies: [{ id: "Mira", category: "generated", quote, scene: "Selfie at home, a blue coat, a relaxed smile and warm evening light." }] };
    const text = quote + "\n<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>";
    await chat.evaluate(value => { document.querySelector("#conversation")!.innerHTML = '<article data-role="user" data-message-id="selfie-user">Mira, send a selfie.</article><article data-role="assistant" data-message-id="selfie-answer"><div class="ds-markdown"></div></article>'; document.querySelector(".ds-markdown")!.textContent = value; }, text);
    await expect.poll(async () => (await databaseRecords(panel)).find(r => r.kind === "binding").data.characterScenes?.world?.lastReply).toBeTruthy();
    const photo = chat.locator("[data-deeprole-scene-photos]");
    if (["refusal", "low-trust", "unrequested"].includes(scenario)) {
      expect((await databaseRecords(panel)).find(r => r.kind === "binding").data.scenePhotos).toBeUndefined(); await expect(photo).toHaveCount(0);
      expect(await worker.evaluate(() => (globalThis as any).selfieImageRequests.length)).toBe(0);
    } else {
      await expect(photo.locator("img")).toBeVisible({ timeout: 15000 });
      const requests = await worker.evaluate(() => (globalThis as any).selfieImageRequests);
      expect(requests).toHaveLength(1); const body = JSON.parse(requests[0].body);
      expect(requests[0].url).toContain(scenario === "reference" ? "/images/edits" : "/images/generations");
      expect(body.model).toBe(scenario === "reference" ? "synthetic-qwen-edit" : config.modelId); if (scenario === "reference") expect(body.images).toHaveLength(1);
      expect(body.prompt).toContain("Copper hair"); expect(body.prompt).toContain("blue coat"); expect(body.size).toBe("1024x1536");
      expect(await photo.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth,img.naturalHeight])).toEqual([432,768]);
      await photo.getByRole("button", { name: "Open image: Mira · Selfie", exact: true }).click(); await expect(chat.getByRole("dialog", { name: "Mira · Selfie" })).toBeVisible(); await chat.keyboard.press("Escape");
      await context.addInitScript(value => window.addEventListener("DOMContentLoaded", () => { document.querySelector("#conversation")!.innerHTML = '<article data-role="assistant" data-message-id="selfie-answer"><div class="ds-markdown"></div></article>'; document.querySelector(".ds-markdown")!.textContent = value; }, { once: true }), text);
      await chat.reload(); await chat.addStyleTag({ content: "#conversation{max-width:640px;margin:160px auto 0}" }); await expect(photo.locator("img")).toBeVisible();
      expect(await worker.evaluate(() => (globalThis as any).selfieImageRequests.length)).toBe(1);
      expect((await databaseRecords(panel)).filter(r => r.kind === "illustration")).toHaveLength(1);
      await photo.getByRole("button", { name: "Try again", exact: true }).click(); await expect.poll(() => worker.evaluate(() => (globalThis as any).selfieImageRequests.length)).toBe(2);
      const replay = await worker.evaluate(() => (globalThis as any).selfieImageRequests); expect(replay[1].body).toBe(replay[0].body);
      await expect.poll(async () => (await databaseRecords(panel)).filter(r => r.kind === "illustration").length).toBe(1);
    }
    expect((await databaseRecords(panel)).find(r => r.kind === "entity" && r.id === "mira").data.description).toBe("ORIGINAL LORE");
  } finally { await context.close(); }
});

test("a request directed to another chat receives none of the current chat's context", async () => {
  const { context, panel, chat } = await setup([["entry", { ...entry("private-current-chat"), activation: "always" }]]);
  try {
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => {
      sent.push(route.request().postDataJSON().prompt);
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue elsewhere", chat_session_id: "different-chat" }) }));
    expect(sent).toEqual(["Continue elsewhere"]);
    expect((await databaseRecords(panel)).filter(row => row.kind === "entry").map(row => row.data.content)).toEqual(["CANON_private-current-chat"]);
  } finally { await context.close(); }
});
