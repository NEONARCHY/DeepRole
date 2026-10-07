import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_IMAGE_SETTINGS } from "../../src/core/image-generation";
import { EMPTY_CHARACTER } from "../../src/core/characters";
import { profile, realPng, world } from "../image-fixtures";

test("installed MV3 worker generates and restores a scoped illustration without exposing its key", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Extension worker scenario"); test.setTimeout(60000);
  const directory = await mkdtemp(path.join(tmpdir(), "deeprole-image-worker-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(directory, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(8000);
  const key = "SYNTHETIC-INSTALLED-KEY", config = { ...profile, baseUrl: "https://chat.deepseek.com/mock-image-api", extraParams: { untouched: { values: [null, 3, true] } } };
  let generations = 0;
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    // Mock inside the real MV3 worker: browser routing does not intercept every worker fetch.
    // Native response parsing, decoding, messaging, permissions and persistence remain real.
    await worker.evaluate(({ png, model }) => {
      const requests: { headers?: unknown; body?: unknown }[] = []; (globalThis as any).imageRequests = requests;
      globalThis.fetch = async (_url, init) => { requests.push({ headers: init?.headers, body: init?.body }); return new Response(JSON.stringify(init?.body ? { data: [{ b64_json: png }] } : { data: [{ id: model }] }), { headers: { "content-type": "application/json", "x-venice-is-blurred": "false" } }); };
    }, { png: realPng, model: config.modelId });
    await context.route("https://chat.deepseek.com/**", async route => {
      if (route.request().url().includes("/mock-image-api/")) {
        if (route.request().url().endsWith("/models")) { await route.fulfill({ json: { data: [{ id: config.modelId }] } }); return; }
        generations++; await route.fulfill({ json: { data: [{ b64_json: realPng }] }, headers: { "x-venice-is-blurred": "false" } }); return;
      }
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Test chat</title><style>body{margin:0;background:#151a20;color:#eef3f7;font:14px system-ui}header h1{position:fixed;left:20px;top:20px;font-size:16px}main{max-width:660px;margin:100px auto;padding:16px}article{margin-bottom:30px}form textarea{width:100%}</style></head><body><header><h1>Test chat</h1></header><main><article data-role="assistant" data-message-id="image-story">Mira opens an observatory.</article><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' });
    });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.evaluate(async ({ config, settings, key }) => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_image_settings: settings, deeprole_image_keys: { [config.id]: key } }); }, { config, key, settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [config], profileByLevel: { off: config.id } } });
    await panel.reload(); await expect(panel.getByRole("button", { name: "Lore", exact: true })).toBeVisible();
    await panel.evaluate(async ({ world, sheet }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"); const entity = { id: "mira", worldId: world.id, kind: "character", name: "Mira", description: "A fictional adult astronomer", aliases: [], memberIds: [], characterSheet: sheet, createdAt: 1, updatedAt: 1 }; for (const [kind, data] of [["world", world], ["entity", entity]] as const) store.put({ pk: `${kind}:${data.id}`, kind, id: data.id, data, updatedAt: 1 }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }, { world, sheet: { ...EMPTY_CHARACTER, appearance: "Copper hair. Brown eyes." } });
    const catalog = await panel.evaluate(config => (globalThis as any).chrome.runtime.sendMessage({ type: "DR_IMAGE_MODELS", profile: config }), config); expect(catalog).toMatchObject({ ok: true, models: [{ id: config.modelId }] }); expect(JSON.stringify(catalog)).not.toContain(key);
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/image-installed"); await chat.getByRole("combobox", { name: "World", exact: true }).selectOption(world.id);
    const host = chat.locator('[data-message-id="image-story"] [data-deeprole-illustrations]'); await expect(host).toHaveCount(1); await host.getByRole("button", { name: "Create illustration", exact: true }).click();
    const editor = chat.getByRole("dialog", { name: "Create illustration", exact: true }); await editor.getByRole("textbox", { name: "Current scene only", exact: true }).fill("In the observatory at dusk, wearing a coat."); await editor.getByRole("button", { name: "Create illustration", exact: true }).click();
    await expect(editor).toHaveCount(0); await expect(host.locator("img")).toHaveCount(1);
    const requests = await worker.evaluate(() => (globalThis as any).imageRequests); const generated = requests.filter((r: any) => r.body); expect(generated).toHaveLength(1); expect(generated[0].headers.Authorization).toBe(`Bearer ${key}`); expect(JSON.parse(generated[0].body).untouched).toEqual(config.extraParams.untouched);
    expect(await chat.locator("html").getAttribute("data-deeprole-context")).not.toContain("data:image"); expect(await chat.locator("body").innerText()).not.toContain(key);
    await chat.reload(); await expect(host.locator("img")).toHaveCount(1); await host.getByRole("button", { name: "Delete illustration", exact: true }).click(); await expect(host.locator("img")).toHaveCount(0); expect(await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body).length)).toBe(1); expect(generations).toBe(0);
  } finally { await context.close(); }
});
