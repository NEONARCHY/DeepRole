import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_RELATIONSHIP } from "../../src/core/relationships";
import { starterAttributes } from "../../src/core/attributes";
import { progressText } from "../../src/core/progress-i18n";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";

test("installed tracking uses the accepted send, persists progress and honors an in-flight off switch", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime scenario");
  test.setTimeout(90000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-relationship-runtime-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const html = '<!doctype html><html><head><title>Harbor mystery</title></head><body><main><header><h1>Harbor mystery</h1></header><section id="story"></section><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>';
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: html }));
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.evaluate(async () => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru", onboardingComplete: true } })); await panel.reload();
    const world = { id: "world", name: "Harbor", description: "Preserve this fictional world", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const hero = { id: "hero", worldId: "world", kind: "character", name: "Leon", description: "Original protagonist", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true, attributes: starterAttributes("en") }, createdAt: 1, updatedAt: 1 };
    const npc = { ...hero, id: "mira", name: "Mira", description: "Original friend", characterSheet: { ...EMPTY_CHARACTER, relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: 30, affinity: 30 } } } };
    const pack = { format: "deeprole-world", version: 1, records: [{ kind: "world", id: world.id, data: world }, { kind: "entity", id: hero.id, data: hero }, { kind: "entity", id: npc.id, data: npc }] };
    await panel.getByRole("button", { name: "Лор", exact: true }).click(); await panel.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click(); await panel.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Harbor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pack)) }); await panel.getByRole("button", { name: "Подтвердить импорт", exact: true }).click(); await expect(panel.getByRole("heading", { name: "Harbor", exact: true })).toBeVisible();
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/relationship-runtime"); await chat.getByRole("combobox", { name: "Мир", exact: true }).selectOption({ label: "Harbor" }); await expect(chat.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible();
    await chat.locator(".dr-character-row").filter({ hasText: "Mira" }).click();
    const editor = chat.getByRole("dialog"); await editor.getByRole("tab", { name: "Отношения", exact: true }).click();
    await expect(editor.getByRole("switch", { name: /18|adult|совершеннолет/i })).toHaveCount(0);
    await editor.getByRole("button", { name: "Закрыть", exact: true }).last().click();
    let prompt = ""; await context.route("https://chat.deepseek.com/api/v0/chat/completion", async route => { prompt = route.request().postDataJSON().prompt; await route.fulfill({ contentType: "application/json", body: "{}" }); });
    async function send() {
      prompt = "";
      await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, I return your book." }) }));
      await expect.poll(() => prompt).toContain("\nSchema: ");
      return JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
    }
    async function receipt() {
      return panel.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" }); return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.characterRequest; });
    }
    async function progression() {
      return panel.evaluate(async () => {
        // Read the extension origin's synthetic DB. Repository messages are
        // deliberately restricted to content scripts, not extension-page callers.
        const rows = await new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const request = db.transaction("records", "readonly").objectStore("records").getAll(); request.onerror = () => { db.close(); reject(request.error); }; request.onsuccess = () => { db.close(); resolve(request.result); }; }; });
        const people = rows.filter(r => r.kind === "entity").map(r => r.data); const bindings = rows.filter(r => r.kind === "binding").map(r => r.data);
        const npc = people.find(e => e.name === "Mira"), hero = people.find(e => e.name === "Leon"); const binding = bindings.find(b => b.chatId === "relationship-runtime"); const states = binding?.characterScenes?.[npc.worldId]?.states; return { bond: states?.[npc.id]?.bonds?.[hero.id] ?? null, attributes: states?.[hero.id]?.attributes ?? null };
      });
    }
    const bond = async () => (await progression()).bond;
    const attributes = async () => (await progression()).attributes;
    const quote = "Mira thanked Leon for keeping his promise. Leon rested by the fire.";
    async function reply(schema: { request: string }) {
      const turn = { request: schema.request, present: ["Leon", "Mira"], partners: ["Mira"], updates: [{ id: "Mira", name: "Mira", state: { ...EMPTY_STATUS, emotion: "happy" } }], bonds: [{ id: "Mira", hero: "Leon", trust: 3, affinity: 2, reason: "She values kept promises", quote }], attributes: [{ id: "Leon", changes: [{ key: "energy", delta: 3 }], reason: "His short rest helped recovery", quote }] };
      await chat.evaluate(({ quote, turn }) => { const story = document.querySelector("#story")!; const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = crypto.randomUUID(); user.textContent = "Mira, I return your book."; const assistant = document.createElement("article"); assistant.dataset.role = "assistant"; assistant.dataset.messageId = crypto.randomUUID(); const body = document.createElement("div"); body.className = "ds-markdown"; body.textContent = quote + `\n<deeprole_characters>${JSON.stringify(turn)}</deeprole_characters>`; assistant.append(body); story.append(user, assistant); }, { quote, turn });
      await expect(chat.locator("[data-deeprole-characters-summary]").last()).toContainText("Обновлено после ответа");
    }
    const first = await send(); expect(prompt).toContain("Relationship tracking is enabled"); expect(prompt).toContain('"trust":30'); expect(prompt).not.toContain("adultConfirmed"); expect(prompt).not.toContain('"romance":"adults"');
    await expect.poll(async () => (await receipt())?.relationshipsEnabled).toBe(true); await expect.poll(async () => (await receipt())?.accepted).toBe(true); await reply(first);
    await expect.poll(bond).toMatchObject({ trust: 33, affinity: 32 }); expect((await bond()).history).toHaveLength(1); await expect.poll(attributes).toMatchObject({ values: { energy: 73, resolve: 50 } }); await expect(chat.locator(".dr-turn-feedback")).toContainText("Energy +3 · 73"); expect(prompt).toContain("Configured ordinary characteristics");
    await chat.reload(); await expect(chat.locator(".dr-character-row").filter({ hasText: "Mira" })).toContainText("33"); expect((await bond()).history).toHaveLength(1);
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const settings = (await api.storage.local.get("deeprole_settings")).deeprole_settings; await api.storage.local.set({ deeprole_settings: { ...settings, relationshipsEnabled: false } }); });
    await expect(chat.locator(".dr-bond-summary")).toHaveCount(0); const disabled = await send(); expect(prompt).toContain("Numeric relationship and characteristic tracking is not active"); await expect.poll(async () => (await receipt())?.relationshipsEnabled).toBe(false);
    await panel.evaluate(async () => { const api = (globalThis as any).chrome; const settings = (await api.storage.local.get("deeprole_settings")).deeprole_settings; await api.storage.local.set({ deeprole_settings: { ...settings, relationshipsEnabled: true } }); }); await expect(chat.locator(".dr-bond-summary:not(.dr-attribute-summary)")).toHaveCount(1); await reply(disabled); expect(await bond()).toMatchObject({ trust: 33, affinity: 32 }); expect((await bond()).history).toHaveLength(1); expect((await attributes()).values.energy).toBe(73);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
    await chat.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = chat.getByRole("dialog"); await dialog.getByRole("tab", { name: "Отношения", exact: true }).click(); await dialog.getByRole("switch", { name: "Зафиксировать значения в этом чате", exact: true }).check(); await dialog.getByRole("button", { name: "Сохранить персонажа", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toBeVisible(); await dialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
    await chat.locator(".dr-character-row").filter({ hasText: "Leon" }).click(); await dialog.getByRole("tab", { name: "В сцене", exact: true }).click(); await dialog.locator(".dr-attribute-editor").getByRole("switch", { name: progressText("ru", "lock"), exact: true }).first().check(); await dialog.getByRole("button", { name: "Сохранить персонажа", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toBeVisible(); await dialog.getByRole("button", { name: "Закрыть", exact: true }).last().click();
    const locked = await send(); await reply(locked); expect(await bond()).toMatchObject({ trust: 33, affinity: 32, locked: true }); expect((await bond()).history).toHaveLength(2);
    await panel.reload(); expect(await bond()).toMatchObject({ trust: 33, affinity: 32, locked: true }); expect(await attributes()).toMatchObject({ values: { energy: 73 }, locked: ["energy"] }); expect((await attributes()).history).toHaveLength(2);
    // Exercise the actual content/bridge path for a service, not only the prompt builder.
    await chat.evaluate(() => { document.querySelector("form")!.addEventListener("submit", event => { event.preventDefault(); const input = document.querySelector("textarea")!; void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: input.value }) }); input.value = ""; }); });
    prompt = "";
    const service = await panel.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" }); return api.tabs.sendMessage(tab.id, { type: "DR_RUN_SERVICE", request: { id: "service_readonly_123456", type: "memory-analysis", bookId: null, createdAt: Date.now() } }); });
    expect(service, JSON.stringify(service)).toEqual({ ok: true }); await expect.poll(() => prompt).toContain("Read-only character reference"); expect(prompt).toContain('"trust":33'); expect(prompt).toContain('"value":73'); expect(prompt).not.toContain("At the END of each completed story reply"); expect(prompt).not.toContain("Continue the story normally"); expect(prompt).not.toContain("optionally add");
    // Bypassed services authorize no new character reply. The prior receipt is unchanged.
    expect((await receipt())?.id).toBe(locked.request);
    expect((await attributes()).values.energy).toBe(73); expect((await bond()).history).toHaveLength(2);
  } finally { await context.close(); }
});

test("installed missing-choice request receives world rules and read-only progress", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime scenario"); test.setTimeout(45000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-choice-reference-")); const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }); context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    const html = '<!doctype html><html><head><title>Harbor</title><style>body{margin:0;background:#181818;color:#eee;font:15px system-ui}header{position:fixed;left:24px;top:16px}main{max-width:680px;margin:90px auto;padding:16px}form{position:fixed;left:calc(50% - 340px);bottom:24px;width:680px;background:#303030;padding:12px;box-sizing:border-box}textarea{width:100%;box-sizing:border-box}</style></head><body><main><header><h1>Harbor</h1></header><article data-message-id="scene" data-role="assistant"><div class="ds-markdown">Mira waits at the harbor and asks Leon about his journey.</div></article><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>';
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: html }));
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`); await panel.evaluate(async () => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru", onboardingComplete: true } })); await panel.reload();
    const world = { id: "world", name: "Harbor", description: "Keep the fictional world", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const hero = { id: "hero", worldId: world.id, kind: "character", name: "Leon", description: "Original protagonist", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true, attributes: starterAttributes("en") }, createdAt: 1, updatedAt: 1 };
    const npc = { ...hero, id: "mira", name: "Mira", characterSheet: { ...EMPTY_CHARACTER, relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: 30, affinity: 30 }, stageBehavior: { acquaintance: "Polite but keeps her plans private" } } } };
    const rule = { id: "rule", worldId: world.id, entityIds: [], bookId: null, title: "Dialogue rule", content: "End dialogue phrases with the 🌿 emoji, including generated reply options.", keywords: [], activation: "always", priority: "high", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
    const pack = { format: "deeprole-world", version: 1, records: [{ kind: "world", id: world.id, data: world }, { kind: "entity", id: hero.id, data: hero }, { kind: "entity", id: npc.id, data: npc }, { kind: "entry", id: rule.id, data: rule }] };
    await panel.getByRole("button", { name: "Лор", exact: true }).click(); await panel.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click(); await panel.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Harbor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pack)) }); await panel.getByRole("button", { name: "Подтвердить импорт", exact: true }).click(); await expect(panel.getByRole("heading", { name: "Harbor", exact: true })).toBeVisible();
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/choice-reference"); await chat.getByRole("combobox", { name: "Мир", exact: true }).selectOption({ label: "Harbor" });
    let prompt = ""; await context.route("https://chat.deepseek.com/api/v0/chat/completion", async route => { prompt = route.request().postDataJSON().prompt; await route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => { document.querySelector("form")!.addEventListener("submit", event => { event.preventDefault(); const input = document.querySelector("textarea")!; void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: input.value }) }); input.value = ""; }); });
    await chat.getByRole("button", { name: "Предложить варианты", exact: true }).click(); await expect.poll(() => prompt).toContain("Read-only character reference");
    expect(prompt).toContain(rule.content); expect(prompt).toContain("Polite but keeps her plans private"); expect(prompt).toContain('"trust":30'); expect(prompt).toContain('"value":70'); expect(prompt).not.toContain("At the END of each completed story reply"); expect(prompt).not.toContain("optionally add");
    const receipt = await panel.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" }); return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.characterRequest; }); expect(receipt ?? null).toBeNull();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  } finally { await context.close(); }
});
