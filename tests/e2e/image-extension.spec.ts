import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IMAGE_SETTINGS } from "../../src/core/image-generation";
import { EMPTY_CHARACTER } from "../../src/core/characters";
import { profile, realPng, world } from "../image-fixtures";

test("installed MV3 worker generates and restores a scoped illustration without exposing its key", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Extension worker scenario"); test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const directory = await mkdtemp(path.join(profiles, "image-")), extension = path.resolve(".output/chrome-mv3");
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
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Test chat</title><style>body{margin:0;background:#151a20;color:#eef3f7;font:14px system-ui}header h1{position:fixed;left:20px;top:20px;font-size:16px}main{max-width:660px;margin:100px auto;padding:16px}article{margin-bottom:30px}form textarea{width:100%}</style></head><body><header><h1>Test chat</h1></header><main><article data-role="assistant" data-message-id="image-story">Mira and Noah open an observatory.</article><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' });
    });
    const prompts: string[] = [];
    await context.route("**/api/v0/chat/completion", route => { prompts.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.evaluate(async ({ config, settings, key }) => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_image_settings: settings, deeprole_image_keys: { [config.id]: key } }); }, { config, key, settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [config], profileByLevel: { off: config.id } } });
    await panel.reload(); await expect(panel.getByRole("button", { name: "Lore", exact: true })).toBeVisible();
    await panel.evaluate(async ({ world, sheet }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"); const entity = { id: "mira", worldId: world.id, kind: "character", name: "Mira", description: "A fictional adult astronomer", aliases: [], memberIds: [], characterSheet: sheet, createdAt: 1, updatedAt: 1 }; for (const [kind, data] of [["world", world], ["entity", entity], ["entity", { ...entity, id: "noah", name: "Noah", characterSheet: { ...sheet, appearance: "Black hair." } }]] as const) store.put({ pk: `${kind}:${data.id}`, kind, id: data.id, data, updatedAt: 1 }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }, { world, sheet: { ...EMPTY_CHARACTER, appearance: "Copper hair. Brown eyes." } });
    const catalog = await panel.evaluate(config => (globalThis as any).chrome.runtime.sendMessage({ type: "DR_IMAGE_MODELS", profile: config }), config); expect(catalog).toMatchObject({ ok: true, models: [{ id: config.modelId }] }); expect(JSON.stringify(catalog)).not.toContain(key);
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/image-installed"); await chat.getByRole("combobox", { name: "World", exact: true }).selectOption(world.id);
    await chat.evaluate(() => {
      document.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault(); const box = document.querySelector("form textarea") as HTMLTextAreaElement, prompt = box.value; box.value = "";
        const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = "plan-user"; user.id = "plan-user"; user.textContent = prompt;
        const reply = document.createElement("article"); reply.dataset.role = "assistant"; reply.dataset.messageId = "plan-answer"; reply.id = "plan-answer";
        document.querySelector("main")!.insertBefore(user, document.querySelector("form")); document.querySelector("main")!.insertBefore(reply, document.querySelector("form"));
        void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "image-installed" }) }).then(() => {
          reply.innerHTML = '<div class="ds-think-content">Private reasoning</div><div class="ds-assistant-message-main-content"><p></p><button>Copy</button></div>';
          reply.querySelector("p")!.textContent = JSON.stringify({ scene: "In the observatory at dusk, wearing a coat.", characters: [{ id: "mira", reference: "none", appearance: "Copper hair." }, { id: "noah", reference: "none", appearance: "Black hair." }] });
        });
      });
    });
    const host = chat.locator('[data-message-id="image-story"] [data-deeprole-illustrations]'); await expect(host).toHaveCount(1);
    const composer = chat.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("UNSENT DRAFT"); await host.getByRole("button", { name: "Create illustration", exact: true }).click(); await expect(host.getByRole("alert")).toContainText("draft"); await expect(composer).toHaveValue("UNSENT DRAFT"); expect(prompts).toHaveLength(0);
    await composer.fill(""); await host.getByRole("button", { name: "Create illustration", exact: true }).click();
    await expect(chat.getByRole("dialog", { name: "Create illustration", exact: true })).toHaveCount(0); await expect(host.locator("img")).toHaveCount(1);
    expect(prompts).toHaveLength(1); expect(prompts[0]).toContain("[DeepRole Image Plan]"); expect(prompts[0]).toContain("Mira and Noah open an observatory"); expect(prompts[0]).not.toContain("data:image");
    await expect(chat.locator("#plan-user")).toBeHidden(); await expect(chat.locator("#plan-answer")).toBeHidden();
    expect(await host.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([768,432]);
    const requests = await worker.evaluate(() => (globalThis as any).imageRequests); const generated = requests.filter((r: any) => r.body); expect(generated).toHaveLength(1); expect(generated[0].headers.Authorization).toBe(`Bearer ${key}`); expect(JSON.parse(generated[0].body).untouched).toEqual(config.extraParams.untouched); expect(JSON.parse(generated[0].body).prompt).toContain("Noah: Black hair.");
    expect(await chat.locator("html").getAttribute("data-deeprole-context")).not.toContain("data:image"); expect(await chat.locator("body").innerText()).not.toContain(key);
    await chat.reload(); await expect(host.locator("img")).toHaveCount(1);
    await host.getByRole("button", { name: "Try again", exact: true }).click(); await expect(host.locator("img")).toHaveCount(2);
    const retried = await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body)); expect(retried).toHaveLength(2); expect(retried[1].body).toBe(retried[0].body); expect(prompts).toHaveLength(1);
    await host.getByRole("button", { name: "Delete illustration", exact: true }).last().click(); await expect(host.locator("img")).toHaveCount(1); await host.getByRole("button", { name: "Delete illustration", exact: true }).click(); await expect(host.locator("img")).toHaveCount(0); expect(generations).toBe(0);
  } finally { await context.close(); }
});
