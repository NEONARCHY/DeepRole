import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";

test("installed personal rules survive a violating model reply and reload", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime scenario"); test.setTimeout(60000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-emotion-runtime-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }); context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Harbor</title></head><body><main><header><h1>Harbor</h1></header><section id="story"></section><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' }));
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`); await panel.evaluate(async () => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru", onboardingComplete: true } })); await panel.reload();
    const world = { id: "world", name: "Harbor", description: "Original lore", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const person = { id: "mira", worldId: world.id, kind: "character", name: "Mira", description: "Never change original facts", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, blockedEmotions: ["angry"], sprites: { angry: "data:image/png;base64,AAAA" }, portraitLibrary: ["data:image/png;base64,BBBB"] }, createdAt: 1, updatedAt: 1 };
    const pack = { format: "deeprole-world", version: 1, records: [{ kind: "world", id: world.id, data: world }, { kind: "entity", id: person.id, data: person }] };
    await panel.getByRole("button", { name: "Лор", exact: true }).click(); await panel.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click(); await panel.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Harbor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pack)) }); await panel.getByRole("button", { name: "Подтвердить импорт", exact: true }).click(); await expect(panel.getByRole("heading", { name: "Harbor", exact: true })).toBeVisible();
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/emotion-runtime"); await chat.getByRole("combobox", { name: "Мир", exact: true }).selectOption({ label: "Harbor" }); await expect(chat.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible();
    let prompt = ""; await context.route("https://chat.deepseek.com/api/v0/chat/completion", async route => { prompt = route.request().postDataJSON().prompt; await route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira, let us open the gate." }) })); await expect.poll(() => prompt).toContain("Personal emotion rules:");
    expect(prompt).toContain('Personal emotion rules: [{"id":"Mira","allowed":["neutral","happy","sad","surprised","worried"]}]'); expect(prompt).not.toContain("data:image");
    const schema = JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
    await expect.poll(() => panel.evaluate(async () => { const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" }); return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.characterRequest?.accepted; })).toBe(true);
    const turn = { request: schema.request, present: ["Mira"], partners: ["Mira"], updates: [{ id: "Mira", name: "Mira", blockedEmotions: [], state: { ...EMPTY_STATUS, emotion: "angry", condition: "Tired", goal: "Open the gate", stats: [{ label: "Energy", value: "Low" }] } }] };
    await chat.evaluate(turn => { const story = document.querySelector("#story")!; const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = "user-1"; user.textContent = "Mira, let us open the gate."; const assistant = document.createElement("article"); assistant.dataset.role = "assistant"; assistant.dataset.messageId = "answer-1"; const body = document.createElement("div"); body.className = "ds-markdown"; body.textContent = `Mira helps Leon open the gate.\n<deeprole_characters>${JSON.stringify(turn)}</deeprole_characters>`; assistant.append(body); story.append(user, assistant); }, turn);
    await expect(chat.locator("[data-deeprole-characters-summary]").last()).toContainText("Обновлено после ответа"); await expect(chat.locator(".dr-character-row").filter({ hasText: "Mira" })).toContainText("Спокойствие");
    async function stored() { return panel.evaluate(async () => {
      const rows = await new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const request = db.transaction("records", "readonly").objectStore("records").getAll(); request.onerror = () => { db.close(); reject(request.error); }; request.onsuccess = () => { db.close(); resolve(request.result); }; }; });
      const person = rows.find(row => row.kind === "entity" && row.data.name === "Mira")?.data; const binding = rows.find(row => row.kind === "binding" && row.data.chatId === "emotion-runtime")?.data;
      return { person, state: binding?.characterScenes?.[person.worldId]?.states?.[person.id] };
    }); }
    await expect.poll(stored).toMatchObject({ person: { description: person.description, characterSheet: person.characterSheet }, state: { emotion: "neutral", condition: "Tired", goal: "Open the gate", stats: [{ label: "Energy", value: "Low" }] } });
    await chat.reload(); await expect(chat.locator(".dr-character-row").filter({ hasText: "Mira" })).toContainText("Спокойствие"); expect((await stored()).person.characterSheet).toEqual(person.characterSheet);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("");
  } finally { await context.close(); }
});
