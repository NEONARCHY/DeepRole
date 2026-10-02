import { chromium, expect, test, type Page, type Worker } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const fixture = `<!doctype html><html><head><title>Mock DeepSeek</title></head><body><main><header><h1>Roleplay</h1></header><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>`;
async function setup(records: Array<[string, any]>) {
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-sync-test-"));
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
function entry(id: string) { return { id, worldId: null, bookId: null, title: id, content: `CANON_${id}`, keywords: [`${id} signal`], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 }; }
function snapshot(id: string) { return { id, worldId: null, bookId: null, title: id, summary: `HANDOFF_${id}`, sourceChatId: "previous", sourceChatUrl: "https://chat.deepseek.com/chat/s/previous", createdAt: 1 }; }

test.beforeEach(({}, info) => { test.skip(info.project.name !== "chromium", "Installed MV3 bridge; shared adapter/UI tested in Firefox separately"); });

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
    await expect(reply).toContainText("Сообщение генерируется");
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
      await expect(chat.locator("[data-message-id='service-user']")).toBeVisible();
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

test("an idle completed handoff opens a new chat and keeps its queued context", async () => {
  const { context, panel, chat } = await setup([]);
  try {
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
    await enableServiceComposer(chat); await chat.bringToFront();
    expect(await command(panel, { type: "DR_RUN_SERVICE", request: { id: "idle-continue-test", type: "continue-handoff", bookId: null, createdAt: Date.now() } })).toEqual({ ok: true });
    await chat.evaluate(() => { document.querySelector("[data-message-id='service-answer']")!.textContent = '<deeprole_data>{"type":"handoff","title":"Gate","summary":"IDLE_SAVED_GATE"}</deeprole_data>'; });
    await expect(chat).toHaveURL("https://chat.deepseek.com/");
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /IDLE_SAVED_GATE/);
    expect(await command(panel, { type: "DR_APPLY_SNAPSHOT", snapshotId: "deleted-snapshot" })).toEqual({ ok: false });
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /IDLE_SAVED_GATE/);
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
