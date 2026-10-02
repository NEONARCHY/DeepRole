import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

for (const locale of ["ru", "en"] as const) test(`BDS import connects explicitly and sends preserved lore (${locale})`, async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Installed Chrome MV3 runtime; shared UI is covered in Firefox");
  test.setTimeout(60000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-import-test-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const setup = await context.newPage(); await setup.goto(`chrome-extension://${id}/sidepanel.html`);
    await setup.evaluate(async (locale) => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true } }), locale);
    const mock = '<!doctype html><html><head><title>Mock DeepSeek</title><style>body{background:#111;color:#eee}header{height:80px}form{position:fixed;bottom:30px;left:24px;display:flex;gap:12px}textarea{width:350px;height:80px}#conversation{padding:40px}</style></head><body><main><header><h1>Test chat</h1></header><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main><script>document.querySelector("form").onsubmit = e => { e.preventDefault(); const box = document.querySelector("textarea"); const text = box.value; const row = document.createElement("article"); row.dataset.messageId = "user"; row.textContent = text; document.querySelector("#conversation").append(row); box.value = ""; fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: text }) }); };</script></body></html>';
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: mock }));
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/");
    await chat.bringToFront();
    await chat.getByRole("button", { name: locale === "ru" ? "Открыть меню DeepRole" : "Open DeepRole menu", exact: true }).click();
    const menu = chat.frameLocator("iframe");
    await expect(menu.locator(".bottom-nav")).toBeVisible();
    const menuFrame = chat.frames().find(frame => frame.url().includes("sidepanel.html"))!;
    await menuFrame.waitForLoadState("load");
    // Chromium intentionally drops clicks into recently positioned cross-origin
    // frames. Wait for its 500 ms security window, not another click or force:true.
    await menuFrame.waitForFunction(() => performance.now() >= 650);
    await menu.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true }).click();
    await expect(menu.getByRole("heading", { name: locale === "ru" ? "Лор" : "Lore", exact: true })).toBeVisible();
    await menu.getByRole("button", { name: locale === "ru" ? "Загрузить готовый лор" : "Import existing lore", exact: true }).click();
    const title = locale === "ru" ? "Алекс_характер" : "AlexPersonality";
    const canon = "  PRESERVED_CHARACTER_LORE\nAlex is a patient navigator.  ";
    const source = { [title]: { value: canon, importance: "called" }, Rule: { value: "PRESERVED_WORLD_RULE", importance: "always" } };
    await menu.getByLabel(locale === "ru" ? "Выбрать JSON" : "Choose JSON", { exact: true }).setInputFiles({ name: "Test World.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
    const connect = menu.getByRole("checkbox", { name: locale === "ru" ? "Использовать в открытом чате" : "Use in the open chat", exact: true });
    await expect(connect).toBeChecked();
    // Browsing/importing without this explicit choice cannot switch the chat.
    if (locale === "ru") await connect.uncheck();
    await menu.getByRole("button", { name: locale === "ru" ? "Подтвердить импорт" : "Confirm import", exact: true }).click();
    const draft = locale === "ru" ? "Расскажи об Алексе" : "Tell me about Alex";
    if (locale === "ru") {
      await expect(menu.getByText("Только в библиотеке", { exact: true })).toBeVisible();
      await chat.evaluate((draft) => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: draft }) }), draft);
      expect(sent.at(-1)).toBe(draft);
      await menu.getByRole("button", { name: "Использовать в этом чате", exact: true }).click();
    }
    await expect(menu.getByText(locale === "ru" ? "Подключён к этому чату" : "Connected to this chat", { exact: true })).toBeVisible();
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill(draft);
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => sent.at(-1)).toContain("PRESERVED_CHARACTER_LORE");
    expect(sent.at(-1)).toContain("PRESERVED_WORLD_RULE");
    expect(sent.at(-1)).toContain("[User message]\n" + draft);
    await expect(chat.locator("[data-message-id=user]")).toHaveText(draft);
    expect(sent.some(text => text.includes("[DeepRole Service]"))).toBe(false);
    // Decorative folders must not disable name retrieval. Saved modes must
    // immediately reach the actual outgoing request, not just the map preview.
    await menu.getByRole("button", { name: locale === "ru" ? "Открыть карту мира" : "Open world map", exact: true }).click();
    const map = menu.getByRole("dialog", { name: locale === "ru" ? "Карта мира" : "World map", exact: true });
    await expect(map).toBeVisible(); await chat.waitForTimeout(650); // Chromium iframe reposition security window.
    await map.getByRole("button", { name: locale === "ru" ? "Добавить ветвь" : "Add branch", exact: true }).click();
    const branch = map.getByRole("region", { name: locale === "ru" ? "Добавить ветвь" : "Add branch", exact: true });
    await branch.getByRole("textbox", { name: locale === "ru" ? "Название ветви" : "Branch name", exact: true }).fill("COSMETIC_FOLDER_ONLY");
    await branch.getByRole("button", { name: locale === "ru" ? "Добавить" : "Add", exact: true }).click();
    await map.getByRole("textbox", { name: locale === "ru" ? "Найти запись или ветвь…" : "Find a record or branch…", exact: true }).fill(title.replaceAll("_", " "));
    await map.locator(".lm-results").getByRole("button", { name: title.replaceAll("_", " "), exact: true }).click();
    await map.getByText(locale === "ru" ? "Дополнительные действия" : "More actions", { exact: true }).click();
    await map.getByRole("combobox", { name: locale === "ru" ? "Раздел карты" : "Map section", exact: true }).selectOption({ label: "COSMETIC_FOLDER_ONLY" });
    await expect(map.locator(".lm-save")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
    await chat.evaluate((draft) => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: draft }) }), draft);
    expect(sent.at(-1)).toContain("PRESERVED_CHARACTER_LORE"); expect(sent.at(-1)).not.toContain("COSMETIC_FOLDER_ONLY");
    const mode = map.getByRole("button", { name: locale === "ru" ? "Вручную" : "Manual", exact: true });
    await mode.click(); await expect(mode).toHaveAttribute("aria-pressed", "true");
    await chat.evaluate((draft) => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: draft }) }), draft);
    expect(sent.at(-1)).not.toContain("PRESERVED_CHARACTER_LORE"); expect(sent.at(-1)).toContain("PRESERVED_WORLD_RULE");
    await map.getByRole("button", { name: locale === "ru" ? "Отменить" : "Undo", exact: true }).click(); await expect(map.getByRole("button", { name: locale === "ru" ? "Автоподбор" : "Automatic", exact: true })).toHaveAttribute("aria-pressed", "true");
    await chat.evaluate((draft) => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: draft }) }), draft);
    expect(sent.at(-1)).toContain("PRESERVED_CHARACTER_LORE"); expect(sent.at(-1)).not.toContain("COSMETIC_FOLDER_ONLY");
    await map.getByRole("button", { name: locale === "ru" ? "Закрыть карту" : "Close map", exact: true }).click();
    await setup.evaluate(async ({ title, canon }) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("deeprole"); request.onerror = () => reject(request.error); request.onsuccess = () => {
        const db = request.result; const get = db.transaction("records").objectStore("records").getAll();
        get.onsuccess = () => { const entries = get.result.filter((r: any) => r.kind === "entry"); db.close(); const found = entries.find((r: any) => r.data.title === title); if (entries.length !== 2 || found?.data.content !== canon || found?.data.activation !== "smart") reject(new Error("Lore changed during import or selection")); else resolve(); };
      };
    }), { title, canon });
    await chat.evaluate(() => { history.pushState({}, "", "/chat/s/import-game"); document.body.append(document.createElement("span")); });
    await expect.poll(() => setup.evaluate(async () => {
      const [tab] = await (globalThis as any).chrome.tabs.query({ url: "https://chat.deepseek.com/*" });
      const state = await (globalThis as any).chrome.tabs.sendMessage(tab.id, { type: "DR_GET_PAGE_STATE" });
      return state.chatId === "import-game" && !!state.scene.worldId;
    })).toBe(true);
    await chat.reload();
    await expect(chat.getByRole("combobox", { name: locale === "ru" ? "Мир" : "World", exact: true }).locator("option:checked")).toHaveText("Test World");
    await chat.getByRole("button", { name: locale === "ru" ? "Открыть меню DeepRole" : "Open DeepRole menu", exact: true }).click();
    await expect(menu.locator(".bottom-nav")).toBeVisible();
    await chat.frames().find(frame => frame.url().includes("sidepanel.html"))!.waitForFunction(() => performance.now() >= 650);
    await menu.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true }).click();
    await expect(menu.getByText(locale === "ru" ? "Подключён к этому чату" : "Connected to this chat", { exact: true })).toBeVisible();
    await menu.locator(".worlds-view").evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    await chat.screenshot({ path: testInfo.outputPath(`import-connected-${locale}.png`), animations: "disabled" });
    await menu.getByRole("button", { name: locale === "ru" ? "Игра" : "Play", exact: true }).click();
    await expect(menu.locator(".dr-memory-status")).toBeVisible();
    await menu.locator(".play-view").evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    await chat.screenshot({ path: testInfo.outputPath(`play-connected-${locale}.png`), animations: "disabled" });
  } finally { await context.close(); }
});
