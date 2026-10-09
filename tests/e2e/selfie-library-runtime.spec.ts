import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import { selfieImageKey } from "../../src/core/selfies";
import { characterTab, closeSavedCharacter } from "./character-helpers";

for (const locale of ["ru", "en"] as const) test(`installed library selfies persist without model or image API requests ${locale}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3; shared UI is tested in Firefox too"); test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "selfie-library-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); let apiRequests = 0;
    const historyReads: string[] = [], unexpectedRequests: string[] = [];
    await context.route("https://chat.deepseek.com/**", route => {
      if (route.request().url().includes("/api/")) {
        const request = route.request(), url = request.url();
        if (url.includes("/chat/completion")) apiRequests++;
        else if (request.method() === "GET" && url.endsWith("/chat/history_messages?chat_session_id=selfie-a")) historyReads.push(url);
        else unexpectedRequests.push(request.method() + " " + url);
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Observatory</title><style>body{margin:0;background:#151a20;color:#edf3f7;font:15px/1.6 system-ui}main{max-width:720px;margin:120px auto}textarea{box-sizing:border-box;width:100%;height:100px}</style></head><body><main><h1>Observatory</h1><article data-role="assistant" data-message-id="story"><div class="ds-markdown">Mira waits in the observatory.</div></article><form><textarea aria-label="Message">Unsent draft.</textarea><button type="button">Send</button></form></main></body></html>' });
    });
    await context.route("https://images.fixture.invalid/**", route => { apiRequests++; return route.fulfill({ json: {} }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    const images = await panel.evaluate(() => ["#608190", "#80a99c", "#a8b8c8"].map(color => { const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160; const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 120, 160); return canvas.toDataURL("image/png"); }));
    const hero = { id: "hero", worldId: "w", kind: "character", name: "Noah", description: "ORIGINAL HERO", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true }, createdAt: 1, updatedAt: 1 };
    const mira = { ...hero, id: "mira", name: "Mira", description: "ORIGINAL LORE", characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: images[0]!, happy: images[0]! }, portraitLibrary: images.slice(1), imageGeneration: { canonical: "Original appearance", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(images[0]!) }, selfieCategories: [{ id: "regular", name: "Regular", description: "At home", default: true, minTrust: 40, minAffinity: 30, images: [images[0]!] }] } };
    const scene = { revision: "v", presentIds: [hero.id, mira.id], partnerIds: [mira.id], partnerId: mira.id, states: { hero: { ...EMPTY_STATUS }, mira: { ...EMPTY_STATUS } }, updatedAt: 1 };
    const binding = { id: "binding:selfie-a", chatId: "selfie-a", chatUrl: "https://chat.deepseek.com/a/chat/s/selfie-a", worldId: "w", bookId: null, focusIds: [], messageCountAtAnalysis: 0, characterScenes: { w: scene }, createdAt: 1, updatedAt: 1 };
    await panel.evaluate(async ({ rows, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const [kind, data] of rows) tx.objectStore("records").put({ pk: `${kind}:${data.id}`, kind, id: data.id, data, updatedAt: 1 }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (window as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, characterSheetsEnabled: true } });
    }, { locale, rows: [["world", { id: "w", name: "Observatory", description: "WORLD UNCHANGED", color: "#58a6ff", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 }], ["entity", hero], ["entity", mira], ["binding", binding]] as Array<[string, any]> });
    const records = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, request = db.transaction("records").objectStore("records").getAll(); request.onsuccess = () => { resolve(request.result); db.close(); }; }; }));
    const chat = await context.newPage(); await chat.setViewportSize({ width: 1280, height: 900 }); await chat.goto(binding.chatUrl);
    const editor = chat.locator(".dr-character-dialog"), categories = editor.locator(".dr-selfie-categories");
    const open = async () => { await chat.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); await characterTab(editor, "images", locale); };
    await open(); await expect(editor.locator(".dr-selfie-methods")).toContainText(locale === "ru" ? "без генерации ИИ" : "no AI image generation");
    await editor.locator(".dr-selfie-methods").scrollIntoViewIfNeeded();
    await chat.screenshot({ path: info.outputPath(`installed-selfie-methods-${locale}.png`) });
    await editor.locator(".dr-selfie-collections>summary").click(); await categories.getByRole("button", { name: locale === "ru" ? "Выбрать из библиотеки" : "Choose from library", exact: true }).click();
    const picker = categories.locator(".dr-selfie-library-picker"), tiles = picker.locator(".dr-selfie-library-grid button");
    await expect(tiles).toHaveCount(3); await expect(tiles.last()).toBeDisabled(); await tiles.first().click(); await tiles.nth(1).click();
    await picker.getByRole("button", { name: (locale === "ru" ? "Добавить выбранные" : "Add selected") + " · 2", exact: true }).click();
    await editor.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await closeSavedCharacter(editor, locale);
    const after = await records(), saved = after.find(r => r.kind === "entity" && r.id === mira.id).data;
    expect(saved.characterSheet).toEqual({ ...mira.characterSheet, selfieCategories: [{ ...mira.characterSheet.selfieCategories[0], images }] });
    expect(saved.description).toBe(mira.description); expect(after.find(r => r.kind === "entity" && r.id === hero.id).data).toEqual(hero);
    expect(after.find(r => r.kind === "world").data.description).toBe("WORLD UNCHANGED");
    expect(after.find(r => r.id === binding.id).data.characterScenes.w.states).toEqual(scene.states);
    await chat.reload(); await open(); await editor.locator(".dr-selfie-collections>summary").click(); await expect(categories.locator(".dr-selfie-thumbnails img")).toHaveCount(3);
    await expect(categories.locator(".dr-selfie-thumbnails img").first()).toBeVisible();
    await chat.screenshot({ path: info.outputPath(`installed-ready-selfies-${locale}.png`) });
    await expect(chat.locator("textarea[aria-label=Message]")).toHaveValue("Unsent draft."); expect(apiRequests).toBe(0);
    // The existing context meter reads history once per navigation; this isn't generation.
    expect(historyReads).toHaveLength(2); expect(unexpectedRequests).toEqual([]);
  } finally { await context.close(); }
});
