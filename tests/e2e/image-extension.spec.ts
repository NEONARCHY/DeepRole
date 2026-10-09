import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IMAGE_SETTINGS } from "../../src/core/image-generation";
import { EMPTY_CHARACTER } from "../../src/core/characters";
import { selfieImageKey } from "../../src/core/selfies";
import { profile, realPng, world } from "../image-fixtures";
import { syntheticHDPng } from "./helpers/hd-image";

for (const locale of ["ru", "en"] as const) test("installed MV3 worker generates and restores a scoped illustration without exposing its key, " + locale, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Extension worker scenario"); test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const directory = await mkdtemp(path.join(profiles, "image-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(directory, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(8000);
  const key = "SYNTHETIC-INSTALLED-KEY", config = { ...profile, maxReferences: 6, baseUrl: "https://chat.deepseek.com/mock-image-api", extraParams: { untouched: { values: [null, 3, true] } } };
  let generations = 0;
  const generate = locale === "ru" ? "Создать иллюстрацию" : "Create illustration", retry = locale === "ru" ? "Попробовать ещё раз" : "Try again", remove = locale === "ru" ? "Удалить иллюстрацию" : "Delete illustration";
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    // Mock inside the real MV3 worker: browser routing does not intercept every worker fetch.
    // Native response parsing, decoding, messaging, permissions and persistence remain real.
    await worker.evaluate(({ png, model }) => {
      const requests: { headers?: unknown; body?: unknown }[] = []; (globalThis as any).imageRequests = requests;
      globalThis.fetch = async (_url, init) => { requests.push({ headers: init?.headers, body: init?.body }); return new Response(JSON.stringify(init?.body ? { data: [{ b64_json: (globalThis as any).providerPng ?? png }] } : { data: [{ id: model }] }), { headers: { "content-type": "application/json", "x-venice-is-blurred": "false" } }); };
    }, { png: realPng, model: config.modelId });
    await context.route("https://chat.deepseek.com/**", async route => {
      if (route.request().url().includes("/mock-image-api/")) {
        if (route.request().url().endsWith("/models")) { await route.fulfill({ json: { data: [{ id: config.modelId }] } }); return; }
        generations++; await route.fulfill({ json: { data: [{ b64_json: realPng }] }, headers: { "x-venice-is-blurred": "false" } }); return;
      }
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Test chat</title><style>body{margin:0;background:#151a20;color:#eef3f7;font:14px system-ui}header h1{position:fixed;left:20px;top:20px;font-size:16px}main{max-width:660px;margin:100px auto;padding:16px}article{margin-bottom:30px}form textarea{width:100%}</style></head><body><header><h1>Test chat</h1></header><main><article data-role="assistant" data-message-id="image-story">Mira and Noah open an observatory with Ari, Dani, Iris and Leo.</article><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' });
    });
    const prompts: string[] = [];
    await context.route("**/api/v0/chat/completion", route => { prompts.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.evaluate(async ({ config, settings, key, locale }) => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true }, deeprole_image_settings: settings, deeprole_image_keys: { [config.id]: key } }); }, { config, key, locale, settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [config], profileByLevel: { off: config.id } } });
    const hdPng = await panel.evaluate(syntheticHDPng); expect(hdPng.length).toBeGreaterThan(300_000);
    await worker.evaluate(png => { (globalThis as any).providerPng = png; }, hdPng);
    await panel.reload(); await expect(panel.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true })).toBeVisible();
    const groupReferences = await panel.evaluate(() => ["#657b8b", "#7b656b", "#7a8960", "#616389", "#846f51", "#506c82"].map(color => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 768; const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 768); return canvas.toDataURL();
    }));
    const groupEntities = ["Mira", "Noah", "Ari", "Dani", "Iris", "Leo"].map((name, index) => ({id: name.toLowerCase(), worldId: world.id, kind: "character", name, description: "A fictional adult astronomer", aliases: [], memberIds: [], characterSheet: {...EMPTY_CHARACTER, appearance: index === 1 ? "Black hair." : "Distinctive coat " + index, portraitLibrary: [groupReferences[index]!], imageGeneration: {canonical: index === 1 ? "Black hair." : "Distinctive coat " + index, sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(groupReferences[index]!)}}, createdAt: 1, updatedAt: 1}));
    await panel.evaluate(async ({ world, entities }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"); store.put({pk: "world:" + world.id, kind: "world", id: world.id, data: world, updatedAt: 1}); for (const entity of entities) store.put({pk: "entity:" + entity.id, kind: "entity", id: entity.id, data: entity, updatedAt: 1}); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }, { world, entities: groupEntities });
    const catalog = await panel.evaluate(config => (globalThis as any).chrome.runtime.sendMessage({ type: "DR_IMAGE_MODELS", profile: config }), config); expect(catalog).toMatchObject({ ok: true, models: [{ id: config.modelId }] }); expect(JSON.stringify(catalog)).not.toContain(key);
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/image-installed"); await chat.getByRole("combobox", { name: locale === "ru" ? "Мир" : "World", exact: true }).selectOption(world.id);
    const mockServiceForm = (alreadyUsed = false) => {
      const planReady = new Promise<void>(resolve => { (window as any).releaseImagePlan = resolve; });
      let sequence = alreadyUsed ? 1 : 0;
      document.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault(); const box = document.querySelector("form textarea") as HTMLTextAreaElement, prompt = box.value; box.value = "";
        const suffix = ++sequence === 1 ? "" : "-" + sequence;
        const user = document.createElement("article"); user.dataset.role = "user"; user.dataset.messageId = "plan-user" + suffix; user.id = user.dataset.messageId; user.textContent = prompt;
        const reply = document.createElement("article"); reply.dataset.role = "assistant"; reply.dataset.messageId = "plan-answer" + suffix; reply.id = reply.dataset.messageId;
        for (const row of [user, reply]) {
          const shell = document.createElement("div"); shell.id = row.id + "-shell"; shell.dataset.virtualListItemKey = row.id;
          shell.style.cssText = "min-height:180px;margin-block:32px;padding-block:20px";
          const tools = document.createElement("div"); tools.innerHTML = '<button>Copy</button><button>Share</button>';
          shell.append(row, tools); document.querySelector("main")!.insertBefore(shell, document.querySelector("form"));
        }
        void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "image-installed" }) }).then(async () => {
          await planReady;
          reply.innerHTML = '<div class="ds-think-content">Private reasoning</div><div class="ds-assistant-message-main-content"><p></p><button>Copy</button></div>';
          reply.querySelector("p")!.textContent = (window as any).planResponse ?? JSON.stringify({ scene: "In the observatory at dusk, a group discusses a chart.", characters: ["mira", "noah", "ari", "dani", "iris", "leo"].map((id, i) => ({id, reference: "none", appearance: "A coat.", action: "Discussing chart " + i, position: "Standing around the table " + i, focus: i === 0 ? "primary" : "background"})) });
        });
      });
    };
    await chat.evaluate(mockServiceForm, false);
    // Real content-script scanning must not mount an image action on a native
    // reply until the stop control disappears, including the hidden JSON tail.
    const streaming = chat.locator('[data-message-id="streaming-story"] [data-deeprole-illustrations]');
    await chat.evaluate(() => {
      const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "streaming-story";
      row.innerHTML = '<button>Thinking for 2 seconds</button><div class="ds-think-content">Private thoughts.</div>';
      document.querySelector("main")!.insertBefore(row, document.querySelector("form"));
      document.querySelector("form button")!.innerHTML = '<svg width="16" height="16"><rect x="3" y="3" width="10" height="10"/></svg>';
    });
    // Each phase spans more than the content-script's debounced scan interval.
    await chat.waitForTimeout(600); await expect(streaming).toHaveCount(0);
    await chat.evaluate(() => {
      const answer = document.createElement("div"); answer.className = "ds-markdown ds-assistant-message-main-content";
      answer.innerHTML = '<p>Mira finishes reading the star chart.</p>';
      document.querySelector('[data-message-id="streaming-story"]')!.append(answer);
    });
    await chat.waitForTimeout(600); await expect(streaming).toHaveCount(0);
    await chat.evaluate(() => {
      const data = document.createElement("pre"); data.textContent = '<deeprole_characters>{"version":1}</deeprole_characters>';
      document.querySelector('[data-message-id="streaming-story"] .ds-markdown')!.append(data);
    });
    await chat.waitForTimeout(600); await expect(streaming).toHaveCount(0);
    await chat.evaluate(() => { document.querySelector("form button")!.textContent = "Send"; });
    await expect(streaming.getByRole("button", { name: generate, exact: true })).toBeVisible();
    await chat.evaluate(() => {
      const toolbar = document.createElement("button"); toolbar.textContent = "Copy";
      document.querySelector('[data-message-id="streaming-story"]')!.append(toolbar);
    });
    await expect.poll(() => streaming.evaluate(host => host.parentElement!.lastElementChild === host)).toBe(true);
    expect(prompts).toHaveLength(0);
    await chat.evaluate(() => { document.querySelector('[data-message-id="streaming-story"]')!.remove(); });
    const host = chat.locator('[data-message-id="image-story"] [data-deeprole-illustrations]'); await expect(host).toHaveCount(1);
    const suggestion = chat.locator("[data-deeprole-choices-recovery] .box");
    await expect(suggestion).toHaveCount(1);
    await expect.poll(async () => Math.abs((await suggestion.boundingBox())!.x - (await host.locator(".dr-illustration-reply").boundingBox())!.x)).toBeLessThan(1);
    const composer = chat.getByRole("textbox", { name: "Message", exact: true }); await composer.fill("UNSENT DRAFT"); await host.getByRole("button", { name: generate, exact: true }).click(); await expect(host.getByRole("alert")).toContainText(locale === "ru" ? "черновик" : "draft"); await expect(composer).toHaveValue("UNSENT DRAFT"); expect(prompts).toHaveLength(0);
    await composer.fill(""); await host.getByRole("button", { name: generate, exact: true }).click();
    await expect(host).toContainText(locale === "ru" ? "DeepSeek готовит кадр…" : "DeepSeek is preparing the frame…");
    await expect(chat.locator(".dr-service-state")).toHaveCount(0);
    await chat.setViewportSize({ width: 360, height: 800 });
    await expect(host).toContainText(locale === "ru" ? "DeepSeek готовит кадр…" : "DeepSeek is preparing the frame…");
    await expect(chat.locator(".dr-service-state")).toHaveCount(0);
    await chat.screenshot({ path: info.outputPath("image-preparation-" + locale + "-360.png") });
    await chat.setViewportSize({ width: 1280, height: 800 });
    await chat.screenshot({ path: info.outputPath("image-preparation-" + locale + "-1280.png") });
    await chat.evaluate(() => (window as any).releaseImagePlan());
    await expect(chat.getByRole("dialog", { name: generate, exact: true })).toHaveCount(0); await expect(host.locator("img")).toHaveCount(1);
    expect(prompts).toHaveLength(1); expect(prompts[0]).toContain("[DeepRole Image Plan]"); expect(prompts[0]).toContain("Mira and Noah open an observatory"); expect(prompts[0]).not.toContain("data:image");
    await expect(chat.locator("#plan-user")).toBeHidden(); await expect(chat.locator("#plan-answer")).toBeHidden();
    for (const id of ["plan-user-shell", "plan-answer-shell"]) {
      await expect(chat.locator("#" + id)).toBeHidden(); expect(await chat.locator("#" + id).evaluate(node => node.getBoundingClientRect().height)).toBe(0);
    }
    expect(await chat.locator("#plan-user").textContent()).toBe(prompts[0]);
    expect(await chat.locator("#plan-answer").textContent()).toContain("In the observatory at dusk");
    expect(await host.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1920,1080]);
    const requests = await worker.evaluate(() => (globalThis as any).imageRequests); const generated = requests.filter((r: any) => r.body); expect(generated).toHaveLength(1); expect(generated[0].headers.Authorization).toBe(`Bearer ${key}`); expect(JSON.parse(generated[0].body).untouched).toEqual(config.extraParams.untouched); expect(JSON.parse(generated[0].body).prompt).toContain("Noah: Black hair.");
    const groupBody=JSON.parse(generated[0].body); expect(groupBody.images).toHaveLength(6); expect(new Set(groupBody.images.map((r:any)=>r.image_url)).size).toBe(6);
    expect(prompts[0]).toContain('"referenceBudget":6'); expect(prompts[0]).toContain('"action"'); expect(prompts[0]).toContain('"position"');
    for(const [index,name] of ["Mira","Noah","Ari","Dani","Iris","Leo"].entries())expect(groupBody.prompt).toContain("Reference "+(index+1)+" preserves the identity of "+name);
    await host.locator(".dr-image-info summary").click(); await expect(host.getByRole("list",{name:locale==="ru"?"Участники кадра":"Frame participants"}).getByRole("listitem")).toHaveCount(6);
    expect(await chat.locator("html").getAttribute("data-deeprole-context")).not.toContain("data:image"); expect(await chat.locator("body").innerText()).not.toContain(key);
    expect(await host.locator("img").getAttribute("src")).toBe(hdPng); await expect(host.locator(".dr-image-pixels")).toContainText("1920 × 1080");
    await chat.reload(); await expect(host.locator("img")).toHaveCount(1);
    await chat.evaluate(mockServiceForm, true); await chat.evaluate(() => (window as any).releaseImagePlan());
    await host.getByRole("button", { name: retry, exact: true }).click(); await expect(host.locator("img")).toHaveCount(1); await expect(host.getByText(locale === "ru" ? "Генерация 2 из 2" : "Generation 2 of 2", {exact:true})).toBeVisible();
    await host.getByRole("button", {name: locale === "ru" ? "Предыдущая генерация" : "Previous generation"}).click(); await expect(host.getByText(locale === "ru" ? "Генерация 1 из 2" : "Generation 1 of 2", {exact:true})).toBeVisible();
    await host.getByRole("button", {name: locale === "ru" ? "Следующая генерация" : "Next generation"}).click();
    await chat.reload(); await expect(host.getByText(locale === "ru" ? "Генерация 2 из 2" : "Generation 2 of 2", {exact:true})).toBeVisible(); await expect(host.locator("img")).toHaveCount(1); await chat.evaluate(mockServiceForm, true); await chat.evaluate(() => (window as any).releaseImagePlan());
    const retried = await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body)); expect(retried).toHaveLength(2); expect(retried[1].body).toBe(retried[0].body); expect(prompts).toHaveLength(1);
    await host.getByRole("button", { name: remove, exact: true }).last().click(); await expect(host.locator("img")).toHaveCount(1); await host.getByRole("button", { name: remove, exact: true }).click(); await expect(host.locator("img")).toHaveCount(0); expect(generations).toBe(0);
    await chat.evaluate(() => { (window as any).planResponse = "Sorry, that's beyond my current scope. Let's talk about something else."; });
    await host.getByRole("button", { name: generate, exact: true }).click();
    await expect(host.getByRole("alert")).toContainText(locale === "ru" ? "не прислал корректное описание кадра" : "did not provide a valid frame");
    await expect(host.getByRole("alert")).toHaveCount(1); await expect(host.locator(".dr-image-loading")).toHaveCount(0);
    await expect(chat.locator(".dr-service-state")).toHaveCount(0); await expect(host.locator("img")).toHaveCount(0);
    expect(prompts).toHaveLength(2);
    expect(await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body).length)).toBe(2);
    await host.locator(".dr-image-error-details summary").click();
    await expect(host.getByText(locale === "ru" ? "DeepSeek · подготовка кадра" : "DeepSeek · frame preparation", { exact: true })).toBeVisible();
    await chat.evaluate(() => { (window as any).planResponse = JSON.stringify({ scene: "At the observatory at dusk, wearing a coat.", characters: [] }); });
    await worker.evaluate(key => {
      const requests = (globalThis as any).imageRequests;
      globalThis.fetch = async (_url, init) => { requests.push({ headers: init?.headers, body: init?.body }); return new Response(JSON.stringify({ error: { code: "INVALID_MODEL", message: "Invalid model " + key, param: "model" } }), { status: 400, headers: { "content-type": "application/json", "x-venice-is-content-violation": "false" } }); };
    }, key);
    await host.getByRole("button", { name: generate, exact: true }).click();
    await expect(host.getByRole("alert")).toHaveAttribute("title", "badRequest · HTTP 400 · INVALID_MODEL", { timeout: 10000 });
    await host.locator(".dr-image-error-details summary").click(); await expect(host.getByText("INVALID_MODEL", { exact: true })).toBeVisible();
    expect(await host.innerText()).not.toContain(key); expect(prompts).toHaveLength(3);
    expect(await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body).length)).toBe(3);
    await chat.reload(); await expect(host.getByRole("alert")).toHaveAttribute("title", "badRequest · HTTP 400 · INVALID_MODEL");
    await host.locator(".dr-image-error-details summary").click(); await expect(host.getByText("INVALID_MODEL", { exact: true })).toBeVisible();
    expect(await host.innerText()).not.toContain(key); expect(prompts).toHaveLength(3);
    expect(await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body).length)).toBe(3);
    // Fresh installed content script: a wide composer, real options and the
    // persisted error surface share edges without changing stored pixels/jobs.
    await chat.setViewportSize({ width: 1800, height: 1000 });
    await chat.evaluate(() => {
      document.querySelector<HTMLElement>("form")!.style.cssText = "position:fixed;left:300px;bottom:12px;width:1200px;padding:12px;box-sizing:border-box;border-radius:16px;background:#272e35";
      const options = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "I ask about the observatory." }));
      const pre = document.createElement("pre"); pre.textContent = "<deeprole_choices>" + JSON.stringify({ version: 1, options }) + "</deeprole_choices>";
      document.querySelector('[data-message-id="image-story"]')!.append(pre);
    });
    const optionsCard = chat.locator("[data-deeprole-choices-host] section"); await expect(optionsCard).toHaveCount(1);
    await expect.poll(async () => (await optionsCard.boundingBox())!.width).toBeCloseTo(1200, 0);
    const checkWidth = async () => {
      await expect.poll(async () => {
        const card = (await optionsCard.boundingBox())!, image = (await host.locator("figure").boundingBox())!;
        return Math.max(Math.abs(card.width - image.width), Math.abs(card.x - image.x));
      }).toBeLessThan(1);
    };
    await checkWidth(); await composer.fill("Still my draft.");
    await chat.evaluate(() => { document.querySelector<HTMLElement>("form")!.style.width = "1000px"; }); await checkWidth();
    await expect.poll(async () => (await optionsCard.boundingBox())!.width).toBeCloseTo(1000, 0);
    await chat.setViewportSize({ width: 360, height: 800 });
    await chat.evaluate(() => { document.querySelector<HTMLElement>("form")!.style.width = "calc(100vw - 24px)"; document.querySelector<HTMLElement>("form")!.style.left = "12px"; });
    await checkWidth(); await expect(composer).toHaveValue("Still my draft.");
    expect(prompts).toHaveLength(3);
    expect(await worker.evaluate(() => (globalThis as any).imageRequests.filter((r: any) => r.body).length)).toBe(3);
  } finally { await context.close(); }
});
