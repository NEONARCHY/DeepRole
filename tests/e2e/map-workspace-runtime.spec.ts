import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("split editing never mixes worlds and map profiles use the real chat scene", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Chrome MV3 runtime; shared UI is tested in both browsers"); test.setTimeout(60000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-split-runtime-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, viewport: { width: 1400, height: 950 }, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    const mock = '<!doctype html><html><head><title>Mock DeepSeek</title></head><body><main><header><h1>Test chat</h1></header><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>';
    const sent: string[] = []; await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: mock })); await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    await panel.evaluate(async () => {
      const world = (id: string) => ({ id, name: id === "w1" ? "Observatory" : "Harbour", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 });
      const entity = { id: "mira", worldId: "w1", name: "Mira", kind: "character", description: "", useDescriptionInContext: false, aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 };
      const entry = (id: string, worldId: string, activation: string, content: string, entityIds: string[] = []) => ({ id, worldId, activation, content, entityIds, title: id, bookId: null, keywords: [], enabled: true, priority: "normal", source: { type: "manual" }, createdAt: 1, updatedAt: 1 });
      const rows = [["world", world("w1")], ["world", world("w2")], ["entity", entity], ["entry", entry("Rule1", "w1", "always", "FIRST_WORLD_CANON")], ["entry", entry("Rule2", "w2", "always", "SECOND_WORLD_CANON")], ["entry", entry("Portrait", "w1", "smart", "FOCUSED_PROFILE_CANON", ["mira"])]] as [string, any][];
      await new Promise<void>((resolve, reject) => { const request = indexedDB.open("deeprole"); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; try { const tx = db.transaction("records", "readwrite"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); }; for (const [kind, data] of rows) tx.objectStore("records").put({ pk: kind + ":" + data.id, kind, id: data.id, data, updatedAt: data.updatedAt }); } catch (error) { db.close(); reject(error); } }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_library_change: { token: "seed-split" } });
    }); await panel.reload();
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/split-test"); await chat.getByRole("combobox", { name: "World", exact: true }).selectOption("w1");
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /FIRST_WORLD_CANON/); await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /FOCUSED_PROFILE_CANON|SECOND_WORLD_CANON/);
    await panel.getByRole("button", { name: "Lore", exact: true }).click(); await panel.getByRole("combobox", { name: "World library", exact: true }).selectOption("w1"); await panel.getByRole("button", { name: "Open world map", exact: true }).click();
    const map = panel.getByRole("dialog", { name: "World map", exact: true }); await map.getByRole("button", { name: "Two worlds side by side", exact: true }).click(); const left = map.locator('[data-map-pane="0"]'); const right = map.locator('[data-map-pane="1"]');
    await expect(left.locator(".lm-chat-status")).toHaveText("Connected to this chat"); await expect(right.locator(".lm-chat-status")).not.toHaveText("Connected to this chat");
    await left.getByRole("button", { name: /^Scene/ }).click(); await left.getByRole("checkbox", { name: "Mira", exact: true }).check(); await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /FOCUSED_PROFILE_CANON/);
    await expect(left.getByRole("button", { name: /^Scene/ })).toBeEnabled(); await panel.screenshot({ path: info.outputPath("split-with-profiles.png") });
    await panel.setViewportSize({ width: 420, height: 900 }); await expect.poll(async () => (await left.locator(".lm-viewport").boundingBox())!.height).toBeGreaterThan(180); await panel.screenshot({ path: info.outputPath("split-with-profiles-narrow.png") }); await panel.setViewportSize({ width: 1400, height: 950 });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue" }) })); expect(sent.at(-1)).toContain("FIRST_WORLD_CANON"); expect(sent.at(-1)).toContain("FOCUSED_PROFILE_CANON"); expect(sent.at(-1)).not.toContain("SECOND_WORLD_CANON");
    await right.locator('[data-lore-id="branch:locations"]').press("Alt+ArrowRight"); await expect(right.getByRole("button", { name: "Undo", exact: true })).toBeEnabled(); await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /SECOND_WORLD_CANON/);
    await chat.bringToFront(); await right.getByRole("button", { name: "Connect to chat", exact: true }).click(); await expect(right.locator(".lm-chat-status")).toHaveText("Connected to this chat"); await expect(left.locator(".lm-chat-status")).not.toHaveText("Connected to this chat"); await expect(map.locator(".lm-scene-controls")).toHaveCount(1);
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue in the harbour" }) })); expect(sent.at(-1)).toContain("SECOND_WORLD_CANON"); expect(sent.at(-1)).not.toContain("FIRST_WORLD_CANON"); expect(sent.at(-1)).not.toContain("FOCUSED_PROFILE_CANON");
    await map.getByRole("button", { name: "Create empty world", exact: true }).click(); const form = map.locator(".lm-world-create"); await form.getByRole("textbox", { name: "Name", exact: true }).fill("Blank map"); await form.getByRole("button", { name: "Create", exact: true }).click(); await expect(right.locator(".lm-header h2")).toHaveText("Blank map");
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Keep the harbour" }) })); expect(sent.at(-1)).toContain("SECOND_WORLD_CANON"); expect(sent.at(-1)).not.toContain("Blank map"); await expect(map.locator(".lm-scene-controls")).toHaveCount(0);
  } finally { await context.close(); }
});
