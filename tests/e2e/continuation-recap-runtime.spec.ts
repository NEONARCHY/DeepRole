import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { boundStory } from "../../src/core/story-continuation";
import type { HandoffSnapshot } from "../../src/core/types";

for (const locale of ["ru", "en"] as const) test(`installed compact continuation ${locale}: failed send, reload, acceptance and exact retry`, async ({}, info) => {
 test.skip(info.project.name !== "chromium", "Synthetic installed Edge MV3"); test.setTimeout(90000);
 const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
  await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
  const f = storyWorld(locale), recap = "COMPACT_FINAL_MOMENT: Nora awaits Mira's answer. Do not repeat the delivery.", old = "OLD_TRANSCRIPT_MUST_NOT_FOLLOW_RECAP";
  f.entry.activation = "always";
  f.world.sharedGame = { version: 1, id: "game", revision: "version", activationId: "activation", activeChatId: f.binding.chatId, activeBindingId: f.binding.id, managed: false, scene: f.binding.characterScenes![f.world.id], facts: [], profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, memoryOverrides: { includedIds: [], excludedIds: [] }, recentStory: boundStory(Array.from({ length: 100 }, (_, n) => ({ role: "assistant", text: `${old} ${n}` })), "history"), recentChatId: f.binding.chatId, updatedAt: 1 };
  const snapshot: HandoffSnapshot = { id: "compact", title: "Final moment", summary: recap, sourceChatId: f.binding.chatId, sourceChatUrl: f.binding.chatUrl, worldId: f.world.id, bookId: null, focusIds: [], createdAt: 1, sharedGameRevision: "version" };
  await panel.evaluate(async ({ records, snapshot, locale }) => {
   await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of [...records, { kind: "snapshot", id: snapshot.id, data: snapshot }]) tx.objectStore("records").put({ pk: row.kind + ":" + row.id, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
   await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "compact-seed" } });
  }, { records: f.records, snapshot, locale });
  let status = 503; const outgoing: string[] = [];
  await context.route("https://chat.deepseek.com/**", route => {
   if (route.request().url().includes("/api/v0/chat/completion")) { outgoing.push(route.request().postDataJSON().prompt); return route.fulfill({ status, json: {} }); }
   if (route.request().url().includes("/api/v0/")) return route.fulfill({ json: {} });
   return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><textarea aria-label="Message"></textarea></main></body></html>' });
  });
  const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/");
  await expect(chat.locator("deeprole-page-widget")).toHaveCount(1);
  await panel.evaluate(async () => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/" }); await api.storage.session.set({ [`deeprole_tab_state_${tab.id}`]: { snapshotId: "compact", snapshotToken: "receipt" } }); });
  await chat.reload(); await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", new RegExp(recap));
  await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", new RegExp(old));
  const stored = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }));
  const queued = () => panel.evaluate(async () => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/" }); return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.snapshotId; });
  const send = () => chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_session_id: "compact-target", prompt: "Continue here." }) }).then(r => r.status));
  const before = await stored(); expect(await send()).toBe(503); expect(await queued()).toBe("compact"); expect(await stored()).toEqual(before);
  await chat.reload(); await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", new RegExp(recap)); expect(await queued()).toBe("compact");
  status = 200; expect(await send()).toBe(200); await expect.poll(queued).toBeNull();
  const after = await stored(), game = after.find(r => r.kind === "world").data.sharedGame;
  expect(game.activeChatId).toBe("compact-target"); expect(game.recentStory.turns).toEqual([{ role: "assistant", text: recap }]); expect(game.scene.states).toEqual(f.world.sharedGame.scene!.states);
  for (const row of before.filter(r => ["entry", "entity", "binding"].includes(r.kind))) expect(after.find(r => r.pk === row.pk)).toEqual(row);
  expect(outgoing).toHaveLength(2);
  // A retry has a new request receipt, while every scene/canon byte stays equal.
  const request=/"request":"([a-f0-9-]{36})"/u;
  expect(outgoing[0]!.match(request)?.[1]).toBeTruthy();expect(outgoing[1]!.match(request)?.[1]).toBeTruthy();
  expect(outgoing[0]!.match(request)![1]).not.toBe(outgoing[1]!.match(request)![1]);
  expect(outgoing[0]!.replace(request,'"request":"<receipt>"')).toBe(outgoing[1]!.replace(request,'"request":"<receipt>"'));
  for (const text of outgoing) { expect(text).toContain(recap); expect(text).not.toContain(old); expect(text).toContain(f.entry.content); }
 } finally { await context.close(); }
});
