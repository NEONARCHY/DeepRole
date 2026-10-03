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
    await expect(chat.locator(".ds-assistant-message-main-content")).toContainText("This explanation remains visible.");
    await expect(chat.locator(".ds-think-content")).toContainText("deeprole_data");
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
    await chat.getByRole("dialog").getByLabel("Appearance and clothing").fill("Blue coat");
    await chat.getByRole("button", { name: "Save character", exact: true }).click();
    await expect(chat.getByRole("dialog")).toHaveCount(0);
    expect((await databaseRecords(panel)).find(r => r.kind === "entity").data.characterSheet.appearance).toBe("Blue coat");
    await append({ ...payload, world: "another-world" });
    await expect(chat.locator(".dr-character-status")).toContainText("another copy of the world");
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
    const payload = { ...schema, world: "another-browser-world", chat: "obsolete-chat", base: "obsolete-version", present: ["Noah", "new:Mira"], partner: "new:Mira", updates: [{ id: "Noah", state: { emotion: "neutral", condition: "", goal: "", relationship: "", stats: [] } }, { id: "new:Mira", name: "Mira", state: { emotion: "happy", condition: "", goal: "", relationship: "", stats: [] } }] };
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
    await chat.getByRole("dialog").getByLabel("Appearance and clothing").fill("MANUAL_BLUE_COAT");
    await chat.getByRole("dialog").getByLabel("My protagonist").check();
    await chat.getByRole("button", { name: "Save character", exact: true }).click();
    await expect(chat.getByRole("dialog")).toHaveCount(0);
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue" }) }));
    expect(sent).toHaveLength(1); expect(sent[0]).toContain("MANUAL_BLUE_COAT"); expect(sent[0]).toContain("Find the key"); expect(sent[0]).not.toContain("data:image");
    await chat.evaluate(value => { const article = document.createElement("article"); article.dataset.role = "assistant"; article.dataset.messageId = "old-answer"; article.textContent = '<deeprole_characters>' + JSON.stringify(value) + '</deeprole_characters>'; document.querySelector("#conversation")!.append(article); }, payload);
    await expect(chat.locator(".dr-character-status")).toContainText("Update skipped");
    expect((await databaseRecords(panel)).find(r => r.id === "mira").data.characterSheet.appearance).toBe("MANUAL_BLUE_COAT");
    await chat.goto("https://chat.deepseek.com/chat/s/b"); await expect(chat.locator(".dr-character-row")).toContainText("No updates yet");
    await chat.goto("https://chat.deepseek.com/chat/s/a"); await expect(chat.locator(".dr-character-row")).toContainText("Happy");
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
    await expect(dialog.getByLabel("Portrait emotion", { exact: true })).toHaveValue("happy");
    await dialog.getByLabel("Portrait emotion", { exact: true }).selectOption("angry");
    await dialog.getByRole("button", { name: "Close", exact: true }).first().click(); await expect(dialog).toHaveCount(0); await expect(portrait).toBeFocused();
    await portrait.press("Enter"); await dialog.getByLabel("Mood", { exact: true }).selectOption("worried");
    await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await expect(dialog).toHaveCount(0);
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
async function enableChoicesScene(chat: Page) {
  await enableServiceComposer(chat);
  await chat.locator("[data-message-id='user']").evaluate((row) => row.setAttribute("data-role", "user"));
  await chat.locator("[data-message-id='answer']").evaluate((row) => row.setAttribute("data-role", "assistant"));
  await expect(chat.getByRole("button", { name: "Suggest options", exact: true })).toBeVisible();
}

test("scene recovery is explicit and visible, then survives reopening without another request", async () => {
  const { context, panel, chat } = await setup([["world", choicesWorld], ["binding", choicesBinding]]);
  try {
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON()?.prompt ?? ""); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await enableChoicesScene(chat); await chat.bringToFront();
    expect(sent).toEqual([]);
    await chat.getByRole("button", { name: "Suggest options", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toContain("[DeepRole Scene Choices]"); expect(sent[0]).toContain("Do not continue or rewrite the scene");
    await expect(chat.locator("[data-message-id='service-user']")).toBeVisible();
    await expect(chat.locator("[data-message-id='answer']")).toHaveText("The gate opened.");
    await expect.poll(() => pendingService(panel)).toMatchObject({ type: "scene-choices" });
    const pending = await pendingService(panel); expect(pending.baseVersions).toBeUndefined(); expect(pending.sceneSignature).not.toContain("gate opened");
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
    await card.getByRole("button", { name: "Full text", exact: true }).click();
    await expect(card.locator(".preview").nth(1)).toHaveText(longText);
    await expect(composer).toHaveValue(""); expect(sent).toBe(0);
    await buttons.first().focus(); await chat.keyboard.press("ArrowDown"); await expect(buttons.nth(2)).toBeFocused();
    await chat.keyboard.press("4"); await expect(composer).toHaveValue("MY_MOVE_surprise"); await expect(composer).toBeFocused();
    await buttons.nth(1).click(); await expect(composer).toHaveValue(longText);
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
    await chat.getByRole("button", { name: "Suggest options", exact: true }).dblclick();
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
    const prompt = sent.find(value => value.includes("[Story handoff]"))!;
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
