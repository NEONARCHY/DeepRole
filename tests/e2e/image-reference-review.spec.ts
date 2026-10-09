import { chromium, expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IMAGE_SETTINGS } from "../../src/core/image-generation";
import { EMPTY_CHARACTER } from "../../src/core/characters";
import { imageText } from "../../src/core/image-i18n";
import { selfieImageKey } from "../../src/core/selfies";
import { profile, realPng, world } from "../image-fixtures";

for (const locale of ["ru", "en"] as const) test("installed reference review revises a hidden plan before generation, " + locale, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Isolated installed MV3 extension"); test.setTimeout(90000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const directory = await mkdtemp(path.join(profiles, "reference-review-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(directory, { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
  context.setDefaultTimeout(10000);
  const t = (key: Parameters<typeof imageText>[1]) => imageText(locale, key);
  const config = { ...profile, maxReferences: 6, baseUrl: "https://chat.deepseek.com/mock-image-api" }, key = "SYNTHETIC-REVIEW-KEY", prompts: string[] = [];
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), id = new URL(worker.url()).host;
    await worker.evaluate(png => {
      (globalThis as any).imageRequests = [];
      globalThis.fetch = async (_url, init) => {
        (globalThis as any).imageRequests.push({ body: init?.body, headers: init?.headers });
        return new Response(JSON.stringify({ data: [{ b64_json: png }] }), { headers: { "content-type": "application/json" } });
      };
    }, realPng);
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="' + locale + '"><head><title>Reference review test</title><style>body{margin:0;background:#151a20;color:#eef3f7;font:14px system-ui}main{box-sizing:border-box;max-width:660px;margin:80px auto;padding:16px}article{margin-bottom:24px}form textarea{box-sizing:border-box;width:100%}</style></head><body><main><h1>Test chat</h1><article data-role="assistant" data-message-id="review-story">Mira and Noah study a chart at the observatory, wearing everyday coats.</article><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' }));
    await context.route("**/api/v0/chat/completion", route => { prompts.push(route.request().postDataJSON().prompt); return route.fulfill({ json: {} }); });
    const panel = await context.newPage(); await panel.goto("chrome-extension://" + id + "/sidepanel.html");
    await panel.evaluate(async ({ settings, locale, config, key }) => {
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true }, deeprole_image_settings: settings, deeprole_image_keys: { [config.id]: key } });
    }, { locale, config, key, settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: true, contentLevel: "suggestive", reviewBeforeGeneration: true, profiles: [config], profileByLevel: { off: config.id, suggestive: config.id } } });
    await panel.reload();
    await expect(panel.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true })).toBeVisible();
    const images = await panel.evaluate(() => ["#758c9a", "#af9471", "#64776a", "#9b738b"].map(color => {
      const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 192; const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 192); return canvas.toDataURL();
    }));
    const entities = ["Mira", "Noah"].map((name, i) => ({ id: name.toLowerCase(), worldId: world.id, kind: "character", name, description: "A fictional adult astronomer. Unchanged source lore.", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, appearance: "Copper hair and an everyday coat.", portraitLibrary: [images[i * 2]!, images[i * 2 + 1]!], imageGeneration: { canonical: "Copper hair.", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(images[i * 2]!), suggestiveReferenceKey: selfieImageKey(images[i * 2 + 1]!), referenceContext: "Everyday coat", suggestiveReferenceContext: "Alternate evening coat" } } }));
    await panel.evaluate(async ({ world, entities }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("deeprole"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"); for (const [kind, data] of [["world", world], ...entities.map(e => ["entity", e])] as const) { const row = data as typeof world; store.put({ pk: kind + ":" + row.id, kind, id: row.id, data, updatedAt: 1 }); } tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }, { world, entities });
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/reference-review");
    await chat.getByRole("combobox", { name: locale === "ru" ? "Мир" : "World", exact: true }).selectOption(world.id);
    const mockForm = (start: number) => {
      let sequence = start;
      document.querySelector("form")!.addEventListener("submit", event => {
        event.preventDefault(); const box = document.querySelector("form textarea") as HTMLTextAreaElement, prompt = box.value; box.value = "";
        const n = ++sequence, user = document.createElement("article"), reply = document.createElement("article");
        user.dataset.role = "user"; user.dataset.messageId = "review-user-" + n; user.id = user.dataset.messageId; user.textContent = prompt;
        reply.dataset.role = "assistant"; reply.dataset.messageId = "review-answer-" + n; reply.id = reply.dataset.messageId;
        for (const row of [user, reply]) { const shell = document.createElement("div"); shell.id = row.id + "-shell"; shell.dataset.virtualListItemKey = row.id; shell.style.cssText = "min-height:180px;padding:20px"; shell.append(row); document.querySelector("main")!.insertBefore(shell, document.querySelector("form")); }
        void fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt, chat_session_id: "reference-review" }) }).then(() => {
          reply.innerHTML = '<div class="ds-think-content">Private thoughts</div><div class="ds-assistant-message-main-content"><p></p><button>Copy</button></div>';
          reply.querySelector("p")!.textContent = JSON.stringify({ scene: n === 2 ? "Revised reference guidance: Mira and Noah study the same chart at the same observatory moment." : "Mira and Noah study an observatory chart in their everyday coats.", characters: ["mira", "noah"].map(id => ({ id, reference: "neutral", look: "ordinary", appearance: "Everyday coat.", action: "Studying a chart", position: id === "mira" ? "Left of table" : "Right of table", focus: "primary", referenceReason: document.documentElement.lang === "ru" ? "В сцене описано обычное пальто." : "The scene establishes an everyday coat." })) });
        });
      });
    };
    await chat.evaluate(mockForm, 0);
    const host = chat.locator('[data-message-id="review-story"] [data-deeprole-illustrations]');
    await host.getByRole("button", { name: t("generate"), exact: true }).click();
    await expect(host.getByRole("region", { name: t("reviewTitle"), exact: true })).toBeVisible();
    const requests = () => worker.evaluate(() => (globalThis as any).imageRequests as { body: string; headers: unknown }[]);
    expect(await requests()).toHaveLength(0); expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("[DeepRole Image Plan]"); expect(prompts[0]).not.toContain("data:image"); expect(prompts[0]).not.toContain(key);
    await expect(chat.locator("#review-user-1")).toBeHidden(); await expect(chat.locator("#review-answer-1")).toBeHidden();
    // Reload a pending approval: no provider request and no new hidden query.
    await chat.reload(); await chat.evaluate(mockForm, 1);
    await expect(host.getByRole("region", { name: t("reviewTitle"), exact: true })).toBeVisible();
    expect(await requests()).toHaveLength(0); expect(prompts).toHaveLength(1);
    const mira = host.getByRole("group", { name: "Mira · " + t("referencePolicy"), exact: true }), noah = host.getByRole("group", { name: "Noah · " + t("referencePolicy"), exact: true });
    await mira.getByRole("button", { name: t("referenceSuggestive"), exact: true }).focus();
    await chat.keyboard.press("Enter");
    await noah.getByRole("button", { name: t("referenceNeutral"), exact: true }).click();
    await expect(mira.getByRole("button", { name: t("referenceSuggestive"), exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await requests()).toHaveLength(0); expect(prompts).toHaveLength(1);
    for (const width of [360, 1280]) {
      await chat.setViewportSize({ width, height: 900 });
      expect(await host.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await host.scrollIntoViewIfNeeded();
      await host.screenshot({ path: info.outputPath("reference-review-" + locale + "-" + width + ".png") });
      const axe = await new AxeBuilder({ page: chat }).include('[data-deeprole-illustrations]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(axe.violations).toEqual([]);
    }
    await host.getByRole("button", { name: t("reviewGenerate"), exact: true }).click();
    await expect(host.getByRole("button", { name: t("view"), exact: true })).toBeVisible();
    expect(prompts).toHaveLength(2); expect(prompts[1]).toContain('"previousPlan"'); expect(prompts[1]).toContain('"referenceOverrides":{"mira":"suggestive","noah":"neutral"}');
    expect(prompts[1]).not.toContain("data:image"); expect(prompts[1]).not.toContain(key);
    await expect(chat.locator("#review-user-2")).toBeHidden(); await expect(chat.locator("#review-answer-2")).toBeHidden();
    const calls = await requests(); expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.body);
    expect(body.prompt).toContain("Revised reference guidance"); expect(body.prompt).toContain("Alternate evening coat"); expect(body.prompt).toContain("16:9"); expect(body.size).toBe("1536x1024");
    const sentImages = body.images.map((r: { image_url: string }) => r.image_url); expect(sentImages).toHaveLength(2);
    const colors = await panel.evaluate(async (urls: string[]) => Promise.all(urls.map(async url => {
      const img = new Image(); img.src = url; await img.decode(); const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1; const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    })), sentImages);
    for (const [i, expected] of [[0, [175,148,113]], [1, [100,119,106]]] as const) for (let channel = 0; channel < 3; channel++) expect(Math.abs(colors[i]![channel]! - expected[channel]!)).toBeLessThan(8);
    await expect(host.getByRole("list", { name: t("referenceResult"), exact: true })).toContainText("Mira" + t("referenceSuggestive"));
    const storedEntities = await panel.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("deeprole"); r.onsuccess = () => resolve(r.result); });
      const records = await new Promise<any[]>(resolve => { const r = db.transaction("records").objectStore("records").getAll(); r.onsuccess = () => resolve(r.result); }); db.close(); return records.filter(r => r.kind === "entity").map(r => r.data).sort((a,b) => a.id.localeCompare(b.id));
    });
    expect(storedEntities).toEqual(entities);
    await host.getByRole("button", { name: t("retrySame"), exact: true }).click();
    await expect.poll(async () => (await requests()).length).toBe(2);
    await expect(host.getByRole("button", { name: t("view"), exact: true })).toBeVisible();
    expect((await requests())[1]!.body).toBe(calls[0]!.body); expect(prompts).toHaveLength(2);
    // A new review can be cancelled without creating another paid request.
    await host.getByRole("button", { name: t("referenceEdit"), exact: true }).click();
    await expect(host.getByRole("region", { name: t("reviewTitle"), exact: true })).toBeVisible();
    expect(prompts).toHaveLength(3); expect(await requests()).toHaveLength(2);
    await host.getByRole("button", { name: t("reviewCancel"), exact: true }).click();
    await expect(host.getByRole("region", { name: t("reviewTitle"), exact: true })).toHaveCount(0);
    await expect(host.getByRole("button", { name: t("view"), exact: true })).toBeVisible();
    expect(await requests()).toHaveLength(2);
  } finally { await context.close(); }
});
