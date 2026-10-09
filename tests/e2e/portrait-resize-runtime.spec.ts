import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";

for (const locale of ["ru", "en"] as const) test(`installed portrait resize persists independently of pinned adaptive cards ${locale}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "MV3 runtime; shared layout is tested in both browsers"); test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "portrait-resize-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    let modelRequests = 0;
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Observatory</title><style>body{margin:0;background:#151a20;color:#edf3f7;font:15px/1.6 system-ui}main{max-width:720px;margin:160px auto}textarea{box-sizing:border-box;width:100%;height:100px}</style></head><body><main><h1>Observatory</h1><section id="conversation"></section><form><textarea aria-label="Message">Unsent draft.</textarea><button type="button">Send</button></form><div style="height:1600px"></div></main></body></html>' }));
    await context.route("**/api/v0/chat/completion", route => { modelRequests++; return route.fulfill({ json: {} }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    const image = await panel.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160; const paint = canvas.getContext("2d")!; paint.fillStyle = "#628596"; paint.fillRect(0, 0, 120, 160); paint.fillStyle = "#bdd9e2"; paint.beginPath(); paint.arc(60, 55, 24, 0, Math.PI * 2); paint.fill(); paint.fillRect(28, 88, 64, 62); return canvas.toDataURL("image/png"); });
    const people = ["Noah", "Mira", "Leon"].map((name, index) => ({ id: name.toLowerCase(), worldId: "w", name, kind: "character", description: "ORIGINAL", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: index === 0, sprites: { neutral: image } }, createdAt: 1, updatedAt: 1 }));
    const scene = { revision: "v", presentIds: people.map(p => p.id), partnerIds: ["mira"], partnerId: "mira", states: Object.fromEntries(people.map(p => [p.id, { ...EMPTY_STATUS, condition: "Safe", stats: [{ label: "Energy", value: "Rested" }] }])), updatedAt: 1 };
    const binding = { id: "binding:resize-a", chatId: "resize-a", chatUrl: "https://chat.deepseek.com/a/chat/s/resize-a", worldId: "w", bookId: null, focusIds: [], messageCountAtAnalysis: 0, characterScenes: { w: scene }, createdAt: 1, updatedAt: 1 };
    await panel.evaluate(async ({ rows, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const [kind, data] of rows) tx.objectStore("records").put({ pk: `${kind}:${data.id}`, kind, id: data.id, data, updatedAt: 1 }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (window as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, characterSheetsEnabled: true, portraitLayoutResetAt: 0, adaptiveLayout: true, pinSceneChoices: true, pinPortraitLeft: true, pinPortraitRight: true } });
    }, { locale, rows: [["world", { id: "w", name: "Observatory", description: "ORIGINAL LORE", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 }], ...people.map(p => ["entity", p]), ["binding", binding], ["binding", { ...binding, id: "binding:resize-b", chatId: "resize-b", chatUrl: "https://chat.deepseek.com/a/chat/s/resize-b" }]] as Array<[string, any]> });
    const records = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, request = db.transaction("records").objectStore("records").getAll(); request.onsuccess = () => { resolve(request.result); db.close(); }; }; }));
    const chat = await context.newPage(); await chat.setViewportSize({ width: 1800, height: 960 }); await chat.goto(binding.chatUrl);
    const append = () => chat.evaluate(() => { const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "scene"; const text = document.createElement("div"); text.className = "ds-markdown"; text.textContent = "Mira, Noah and Leon stay in the observatory.\n<deeprole_choices>" + JSON.stringify({ version: 1, options: ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the key." })) }) + "</deeprole_choices>"; row.append(text); document.querySelector("#conversation")!.replaceChildren(row); });
    await append(); const portrait = chat.locator('.dr-cast-widget[data-character-id="mira"]');
    await expect(portrait.locator("img")).toHaveAttribute("src", image);
    await portrait.hover(); const handle = (await portrait.locator(".dr-cast-resize").boundingBox())!;
    await chat.mouse.move(handle.x + 22, handle.y + 22); await chat.mouse.down(); await chat.mouse.move(Math.min(1796, handle.x + 342), handle.y + 22, { steps: 12 }); await chat.mouse.up();
    await expect.poll(async () => (await records()).find(r => r.id === binding.id).data.portraitLayouts?.w?.positions?.mira?.manualSize).toBe(true);
    await expect.poll(async () => (await portrait.boundingBox())!.width).toBeGreaterThan(360);
    const saved = (await records()).find(r => r.id === binding.id).data.portraitLayouts.w.positions.mira;
    const resized = (await portrait.boundingBox())!;
    await append(); await expect.poll(async () => (await portrait.boundingBox())!.width).toBeCloseTo(resized.width, 0);
    await chat.reload(); await append(); await expect.poll(async () => (await portrait.boundingBox())!.width).toBeCloseTo(resized.width, 0);
    await chat.setViewportSize({ width: 320, height: 800 }); await expect.poll(async () => (await portrait.boundingBox())!.width).toBeLessThanOrEqual(304);
    expect((await records()).find(r => r.id === binding.id).data.portraitLayouts.w.positions.mira).toEqual(saved);
    await chat.setViewportSize({ width: 1800, height: 960 }); await expect.poll(async () => (await portrait.boundingBox())!.width).toBeCloseTo(resized.width, 0);
    await chat.goto("https://chat.deepseek.com/a/chat/s/resize-b"); await append();
    await expect.poll(async () => (await portrait.boundingBox())!.width).toBeLessThanOrEqual(192);
    await chat.goto(binding.chatUrl); await append(); await expect.poll(async () => (await portrait.boundingBox())!.width).toBeCloseTo(resized.width, 0);
    const after = await records(); expect(after.find(r => r.id === binding.id).data.characterScenes.w).toEqual(scene);
    expect(after.find(r => r.id === "binding:resize-b").data.portraitLayouts).toBeUndefined();
    for (const person of people) expect(after.find(r => r.kind === "entity" && r.id === person.id).data).toEqual(person);
    expect(after.find(r => r.kind === "world").data.description).toBe("ORIGINAL LORE"); expect(modelRequests).toBe(0);
    await expect(chat.locator("textarea")).toHaveValue("Unsent draft.");
    await chat.screenshot({ path: info.outputPath("installed-resizable-portrait.png") });
  } finally { await context.close(); }
});
