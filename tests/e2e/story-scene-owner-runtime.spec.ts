import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { characterText } from "../../src/core/characters";
import { ownedStoryScene } from "../fixtures/story-scene-owner";

async function records(panel: Page) {
  return panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
  }));
}
for (const locale of ["ru", "en"] as const) for (const selected of [false, true]) test(`installed scene ownership ${locale} ${selected ? "selected" : "checkpoint"}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 RPC; no personal account"); test.setTimeout(60_000);
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = ownedStoryScene(locale, selected);
    await panel.evaluate(async ({ seed, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of seed) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false }, deeprole_library_change: { token: "synthetic-owner-seed" } });
    }, { seed: f.records, locale });
    let prompt = "", requests = 0;
    await context.route("https://chat.deepseek.com/**", route => {
      if (route.request().url().endsWith("/api/v0/chat/completion")) { prompt = route.request().postDataJSON().prompt; requests++; return route.fulfill({ json: {} }); }
      if (route.request().url().includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><section id="story"></section><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(); await chat.setViewportSize({ width: 320, height: 950 }); await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
    const before = (await records(panel)).filter(r => r.kind !== "dispatch");
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "A synthetic scene update." }) }));
    await expect.poll(() => prompt).toContain("\nSchema: "); const schema = JSON.parse(prompt.match(/\nSchema: (.+)\nRoster:/)![1]!);
    await expect.poll(async () => panel.evaluate(async () => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/chat/s/synthetic-a" }); return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.characterRequest?.accepted; })).toBe(true);
    const person = f.entities[0]!, state = { ...f.binding.characterScenes![f.world.id]!.states[person.id]!, condition: "Synthetic update accepted only without a replay owner" };
    const turn = { request: schema.request, world: f.world.id, chat: f.binding.chatId, base: schema.base, present: f.binding.characterScenes![f.world.id]!.presentIds, updates: [{ id: person.id, state }] };
    await chat.evaluate(turn => { const story = document.querySelector("#story")!, user = document.createElement("article"), answer = document.createElement("article"), body = document.createElement("div"); user.dataset.role = "user"; user.dataset.messageId = "synthetic-user"; user.textContent = "A synthetic scene update."; answer.dataset.role = "assistant"; answer.dataset.messageId = "synthetic-assistant"; body.className = "ds-markdown"; body.textContent = `The courier waits.\n<deeprole_characters>${JSON.stringify(turn)}</deeprole_characters>`; answer.append(body); story.append(user, answer); }, turn);
    await expect(chat.locator("[data-deeprole-characters-summary]")).toContainText(characterText(locale, selected ? "historyManaged" : "updated"));
    const after = (await records(panel)).filter(r => r.kind !== "dispatch");
    if (selected) expect(after).toEqual(before);
    else { expect(after.find(r => r.kind === "binding").data.characterScenes[f.world.id].states[person.id]).toMatchObject({ condition: state.condition }); expect(after.filter(r => r.kind !== "binding")).toEqual(before.filter(r => r.kind !== "binding")); }
    // Reload cannot retry a skipped write or send the user's message again.
    await chat.reload(); await expect(chat.locator(".dr-character-row")).toHaveCount(2); expect((await records(panel)).filter(r => r.kind !== "dispatch")).toEqual(after); expect(requests).toBe(1);
  } finally { await context.close(); }
});
