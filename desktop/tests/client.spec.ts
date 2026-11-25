import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
import { imageText } from "../../src/core/image-i18n";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { castBatch, castWorld } from "../../tests/fixtures/cast-data";
import { resetDraft, resetFixture } from "../../tests/fixtures/world-reset";
import { realPng } from "../../tests/image-fixtures";
import type { DataRecord } from "../../src/core/types";
import { openSavedPreview } from "../../tests/e2e/continuation-helpers";

async function openClient(data: string, portable = false) {
  await mkdir(data, { recursive: true });
  const app = await _electron.launch({
    executablePath: process.env.DEEPROLE_TEST_ELECTRON ?? path.resolve("node_modules/electron/dist/electron.exe"),
    args: process.env.DEEPROLE_TEST_PACKAGED === "1" ? [] : [path.resolve("desktop")],
    env: { ...process.env, DEEPROLE_DESKTOP_DATA: portable ? "" : data },
    timeout: 30_000,
  });
  await expect.poll(() => app.windows().some(page => page.url() === "https://deeprole.local/"), { timeout: 25_000 }).toBe(true);
  const page = app.windows().find(page => page.url() === "https://deeprole.local/")!;
  await page.emulateMedia({ colorScheme: null });
  return { app, page };
}

async function attachModel(page: Page, baseUrl: string) {
  await page.getByRole("button", { name: /Подключить модель|Connect a model/ }).click();
  const dialog = page.getByRole("dialog", { name: /Текстовая модель|Text model/ });
  await dialog.getByLabel(/Адрес API|API base URL/).fill(baseUrl);
  await dialog.getByLabel(/ID модели|Model ID/).fill("test-story");
  await dialog.getByRole("button", { name: /Сохранить подключение|Save connection/ }).click();
  await expect(page.getByRole("button", { name: "test-story" })).toBeVisible();
}

async function libraryRecords(page: Page) {
  return page.evaluate(() => new Promise<{ kind: string; data: Record<string, any> }[]>((resolve, reject) => {
    const open = indexedDB.open("deeprole");
    open.onerror = reject;
    open.onsuccess = () => {
      const read = open.result.transaction("records").objectStore("records").getAll();
      read.onerror = reject;
      read.onsuccess = () => { resolve(read.result); open.result.close(); };
    };
  }));
}

async function seedLibrary(page: Page, records: DataRecord[]) {
  await libraryRecords(page);
  await page.evaluate(rows => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("deeprole");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("records", "readwrite");
      for (const row of rows) tx.objectStore("records").put({ pk: row.kind + ":" + row.id, ...row, updatedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), records);
}

const runtimeCommand = (page: Page, message: object) => page.evaluate(input =>
  (window as unknown as { deepRoleDesktop: { call(method: string, input: object): Promise<any> } }).deepRoleDesktop.call("runtimeSend", input), message);

async function watchNewWindows(app: ElectronApplication) {
  const events = await app.evaluateHandle(({ app: electron }) => {
    const shown: number[] = [];
    electron.on("browser-window-created", (_event, window) => window.on("show", () => shown.push(window.id)));
    return shown;
  });
  return () => events.jsonValue();
}

async function provider(reply: (prompt: string) => string | null | Promise<string | null>, window?: number) {
  const prompts: string[] = [];
  const requests: { messages: { role: string; content: string }[]; max_tokens: number }[] = [];
  const modelRequests: (string | undefined)[] = [];
  const completionAuthorizations: (string | undefined)[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      modelRequests.push(request.headers.authorization);
      const data = [{ id: "desktop-image-fixture" }, ...(window ? [{
        id: "test-story", model_spec: { availableContextTokens: window, pricing: { input: { usd: 2 }, output: { usd: 8 } } },
      }] : [])];
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/images/generations") {
      request.resume();
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: realPng }] }));
      return;
    }
    if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    completionAuthorizations.push(request.headers.authorization);
    let body = "";
    for await (const chunk of request) body += chunk;
    const completion = JSON.parse(body);
    requests.push(completion);
    const prompt = requests.at(-1)!.messages.map(message => message.content).join("\n\n");
    prompts.push(prompt);
    const content = await reply(prompt);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (content === null) { response.end('data: {"choices":[{"delta":{"content":"Незавершённая строка"},"finish_reason":"length"}]}\n\n'); return; }
    const usage = window ? `data: ${JSON.stringify({ choices: [], id: "test-" + prompts.length, usage: { prompt_tokens: 12345, completion_tokens: 9 } })}\n\n` : "";
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\n${usage}data: [DONE]\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Test server unavailable");
  return { prompts, requests, modelRequests, completionAuthorizations, url: `http://127.0.0.1:${address.port}/v1`, close: () => server.close() };
}

test("plays a streamed turn and opens the same history from a copied data directory", async ({}, info) => {
  const captured: any[] = [];
  let finishStream!: () => void;
  const keepStreamOpen = new Promise<void>(resolve => { finishStream = resolve; });
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    let body = "";
    for await (const chunk of request) body += chunk;
    captured.push(JSON.parse(body));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "За стеной плеснула вода. 👩" } }] })}\n\n`);
    await keepStreamOpen;
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "🏽‍💻\n*Мира замерла.* **Тише!** \x60— Слышишь?\x60" } }] })}\n\n`);
    response.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Test server unavailable");
  const packagedExecutable = process.env.DEEPROLE_TEST_PORTABLE_DATA === "1" && process.env.DEEPROLE_TEST_PACKAGED === "1" ? process.env.DEEPROLE_TEST_ELECTRON : undefined;
  const original = packagedExecutable ? path.join(path.dirname(packagedExecutable), "DeepRole Data") : info.outputPath("original");
  const copied = info.outputPath("other-computer");
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(original, !!packagedExecutable);
    app = started.app;
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(original);
    const { page } = started;
    const caption = page.locator(".desktop-window-caption");
    if (process.platform === "win32") {
      await expect.poll(() => page.evaluate(() => {
        const overlay = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay;
        return overlay?.visible;
      })).toBe(true);
      await expect(caption).toHaveCSS("height", "32px");
      await expect(caption).toHaveCSS("background-color", "rgb(32, 32, 32)");
      await expect(caption).toHaveCSS("-webkit-app-region", "drag");
      expect(await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === "https://deeprole.local/");
        return win?.isMinimizable() && win.isMaximizable() && win.isClosable();
      })).toBe(true);
      const blankTab = await page.evaluate(async () => {
        const tab = await window.deepRoleDesktop.call<{ id: number }>("tabCreate", { url: "about:blank", active: false });
        await window.deepRoleDesktop.call("tabRemove", tab.id);
        return tab.id;
      });
      expect(blankTab).toBeGreaterThan(0);
    }
    await attachModel(page, `http://127.0.0.1:${address.port}/v1`);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    const composer = page.locator(".desktop-composer");
    const composerPaint = () => composer.evaluate(element => {
      const style = getComputedStyle(element);
      return [style.background, style.boxShadow, style.borderWidth];
    });
    const restingPaint = await composerPaint();
    await draft.click();
    await expect(page.locator(".desktop-editor-caret")).toBeVisible();
    expect(await composerPaint()).toEqual(restingPaint);
    await expect(composer).toHaveCSS("border-width", "0px");
    await expect(composer).toHaveCSS("padding", "8px");
    await draft.fill("На мосту ✨");
    const dust = page.locator(".desktop-editor-dissolve");
    await draft.press("Backspace");
    await expect(draft).toHaveValue("На мосту ");
    await expect(dust).toHaveAttribute("data-active", "");
    await expect(dust).not.toHaveAttribute("data-active", "");
    await draft.press("Control+a");
    await draft.press("Backspace");
    await expect(draft).toHaveValue("");
    await expect(dust).toHaveAttribute("data-active", "");
    await draft.press("Control+z");
    await expect(draft).toHaveValue("На мосту ");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".desktop-editor-caret")).toBeHidden();
    await expect(draft).not.toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(draft).toHaveCSS("resize", "none");
    const editorHeight = () => draft.evaluate(node => node.clientHeight);
    const restingHeight = await editorHeight();
    await draft.fill("Обычная реплика в разных строках.\n".repeat(4));
    expect(await editorHeight()).toBeGreaterThan(restingHeight);
    await draft.fill("Длинная реплика продолжается.\n".repeat(40));
    const cappedHeight = await editorHeight();
    expect(cappedHeight).toBeLessThanOrEqual(204);
    await draft.fill("Длинная реплика продолжается.\n".repeat(50));
    expect(await editorHeight()).toBe(cappedHeight);
    expect(await draft.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await draft.fill("");
    expect(await editorHeight()).toBe(restingHeight);
    await draft.fill("Открываю дверь.");
    await page.getByRole("button", { name: /^(Отправить|Send)$/ }).click();
    const reply = page.locator(".desktop-assistant .desktop-story-text");
    await expect(reply).toHaveText("За стеной плеснула вода. 👩");
    await expect(reply.locator(".desktop-text-reveal")).toHaveCSS("animation-name", "desktop-text-in");
    await expect(page.locator(".desktop-user .desktop-text-reveal")).toHaveText("Открываю дверь.");
    await expect(page.getByTestId("stop-generation")).toBeVisible();
    finishStream();
    await expect(page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    await expect(reply.locator("em")).toHaveText("Мира замерла.", { useInnerText: true });
    await expect(reply.locator("strong")).toHaveText("Тише!", { useInnerText: true });
    await expect(reply.locator("code")).toHaveText("— Слышишь?", { useInnerText: true });
    await expect(reply.locator("code")).toHaveCSS("font-family", /Cascadia Mono/);
    await expect(reply.locator(".desktop-text-reveal").filter({ hasText: "👩🏽‍💻" })).toHaveCount(1);
    expect(await reply.textContent()).toBe("За стеной плеснула вода. 👩🏽‍💻\n*Мира замерла.* **Тише!** \x60— Слышишь?\x60");
    await expect(page.locator(".desktop-chat-link")).toContainText("Открываю дверь.");
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(23, 23, 23)");
    await expect(page.locator("html")).toHaveCSS("font-family", /Manrope/);
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Скрыть список чатов" })).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    const themeButton = page.getByRole("button", { name: "Светлая тема", exact: true });
    const round = (button: Element) => {
      const face = getComputedStyle(button, "::before");
      return { radius: face.borderRadius, inset: face.left, halo: getComputedStyle(button, "::after").opacity };
    };
    await page.mouse.move(0, 0);
    await expect.poll(() => themeButton.evaluate(round)).toEqual({ radius: "50%", inset: "4px", halo: "0" });
    for (const control of [themeButton, page.getByRole("link", { name: "Новый чат" }), page.getByRole("button", { name: "Игровые панели" })]) {
      await control.hover();
      await expect.poll(() => control.evaluate(round)).toEqual({ radius: "50%", inset: "4px", halo: "1" });
    }
    const send = page.locator(".desktop-send");
    await page.getByRole("textbox", { name: "Ваша реплика" }).fill("Проверка кнопки.");
    await expect(send).toBeEnabled();
    await expect.poll(() => send.evaluate(button => getComputedStyle(button, "::before").backgroundColor)).toBe("rgb(145, 189, 248)");
    await page.getByRole("textbox", { name: "Ваша реплика" }).clear();
    expect(captured).toHaveLength(1);
    expect(captured[0].messages.at(-1).content).toContain("Открываю дверь.");
    await page.screenshot({ path: info.outputPath("chat.png") });
    await themeButton.click();
    await page.emulateMedia({ colorScheme: null });
    await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    if (process.platform === "win32") await expect(caption).toHaveCSS("background-color", "rgb(245, 245, 245)");
    await app.close();
    app = undefined;
    await cp(original, copied, { recursive: true, filter: source => !/(?:^|[\\/])(?:Singleton\w*|LOCK|lockfile|Crashpad|GPUCache|Code Cache|Cache)$/u.test(source) });
    const restored = await openClient(copied);
    app = restored.app;
    await expect(restored.page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await restored.page.getByRole("link", { name: "Открываю дверь." }).click();
    await expect(restored.page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    await expect(restored.page.locator(".desktop-story-text code")).toHaveText("— Слышишь?", { useInnerText: true });
    await expect(restored.page.locator(".desktop-story-text")).toContainText("👩🏽‍💻");
    expect(captured).toHaveLength(1);
    const route = new URL(restored.page.url()).pathname.split("/").at(-1)!;
    expect(JSON.parse(await readFile(path.join(copied, "Chats", route + ".json"), "utf8")).messages).toHaveLength(2);

    await restored.page.setViewportSize({ width: 1440, height: 780 });
    const history = restored.page.getByRole("navigation", { name: "История чатов" });
    const historyToggle = restored.page.locator('[aria-controls="desktop-chat-history"]');
    const gameToggle = restored.page.getByRole("button", { name: "Игровые панели", exact: true });
    const viewport = restored.page.locator(".desktop-viewport");
    const draftAfterCopy = restored.page.getByRole("textbox", { name: "Ваша реплика" });
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    const beforeCollapse = (await viewport.boundingBox())!.width;
    await draftAfterCopy.fill("Черновик для следующего хода.");
    await restored.page.getByRole("button", { name: "Закрыть панель чатов" }).click();
    await expect(history).toBeHidden();
    await expect(historyToggle).toBeFocused();
    await expect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThan(beforeCollapse + 200);
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await expect(draftAfterCopy).toHaveValue("Черновик для следующего хода.");
    await restored.page.screenshot({ path: info.outputPath("chat-without-sidebars.png") });
    await restored.page.reload();
    await expect(restored.page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    await expect(historyToggle).toHaveAttribute("aria-expanded", "false");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await historyToggle.click();
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    await restored.page.getByRole("button", { name: "Библиотека и настройки" }).click();
    await expect(restored.page.locator(".desktop-main")).toHaveAttribute("data-game-docked", "false");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await restored.page.frameLocator(".desktop-library iframe").getByRole("button", { name: "Закрыть", exact: true }).first().click();

    await restored.page.setViewportSize({ width: 1000, height: 620 });
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await gameToggle.click();
    await expect(restored.page.locator(".desktop-app")).toHaveAttribute("data-overlay", "game");
    await restored.page.locator(".desktop-game-shade").click({ position: { x: 500, y: 20 } });
    await expect(gameToggle).toBeFocused();
    await historyToggle.click();
    await expect(restored.page.locator(".desktop-main")).toHaveAttribute("data-game-docked", "true");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    await historyToggle.click();

    await restored.page.setViewportSize({ width: 320, height: 620 });
    await restored.page.getByRole("button", { name: "Открыть список чатов" }).click();
    await expect(history).toBeVisible();
    const closeHistory = restored.page.getByRole("button", { name: "Закрыть панель чатов" });
    await expect(closeHistory).toBeFocused();
    await expect(restored.page.locator(".desktop-main")).toHaveAttribute("inert", "");
    await restored.page.screenshot({ path: info.outputPath("chat-history-320.png"), animations: "disabled" });
    await closeHistory.press("Escape");
    await expect(history).toBeHidden();
    await expect(historyToggle).toBeFocused();
    await historyToggle.click();
    await restored.page.getByRole("button", { name: "Библиотека и настройки" }).first().click();
    const library = restored.page.frameLocator(".desktop-library iframe");
    await expect(library.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(library.locator(".workspace-nav")).toBeInViewport();
    await expect(library.locator(".app-main")).toHaveCSS("padding-inline", "12px");
    const close = library.getByRole("button", { name: "Закрыть", exact: true }).first();
    await close.hover();
    await expect.poll(() => close.evaluate(round)).toEqual({ radius: "50%", inset: "4px", halo: "1" });
    await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await library.getByRole("button", { name: "Настройки", exact: true }).click();
    await library.getByRole("button", { name: /Язык и уведомления/ }).click();
    await library.getByRole("button", { name: /^(English|Английский)$/u }).click();
    await restored.page.screenshot({ path: info.outputPath("library-narrow-en.png") });
    await library.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(restored.page.getByRole("textbox", { name: "Your message" })).toBeInViewport();
    await expect(restored.page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    await restored.page.getByRole("textbox", { name: "Your message" }).fill("Wrapped text without a newline. ".repeat(40));
    await expect(restored.page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    expect(await restored.page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await restored.page.screenshot({ path: info.outputPath("chat-narrow-en.png") });

    const panels = restored.page.getByRole("button", { name: "Game panels", exact: true });
    const gamePanel = restored.page.getByRole("complementary", { name: "Game", exact: true });
    await expect(panels).toHaveAttribute("aria-expanded", "false");
    await panels.click();
    await expect(panels).toHaveAttribute("aria-expanded", "true");
    await expect(gamePanel.getByRole("button", { name: "Hide game panel" })).toBeFocused();
    await expect(gamePanel).toBeVisible();
    await expect(restored.page.locator(".desktop-composer-area")).toHaveAttribute("inert", "");
    await restored.page.screenshot({ path: info.outputPath("game-panel-320-en.png"), animations: "disabled" });
    await gamePanel.getByRole("button", { name: "Scene", exact: true }).press("Escape");
    await expect(gamePanel).toBeHidden();
    await expect(panels).toBeFocused();
    await restored.page.emulateMedia({ reducedMotion: "reduce", colorScheme: null });
    await restored.page.getByRole("button", { name: "Open library", exact: true }).click();
    await expect(restored.page.locator(".desktop-library")).toHaveCSS("transition-duration", "0s");
  } finally {
    finishStream();
    await app?.close();
    server.close();
  }
});

test("sends the saved API key and persists adaptive or custom pacing", async ({}, info) => {
  const api = await provider(() => "Стражник кивнул.");
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(info.outputPath("style"));
    app = client.app;
    const { page } = client;
    await page.setViewportSize({ width: 320, height: 620 });
    await attachModel(page, api.url);
    const model = page.getByRole("button", { name: "test-story" });
    const dialog = page.getByRole("dialog", { name: "Текстовая модель" });
    const style = dialog.getByLabel("Длина и подача");
    const save = dialog.getByRole("button", { name: "Сохранить подключение" });
    const customStyle = "Больше диалогов, короче описания.";
    const defaultStyle = "Adapt the length, pace, and balance of dialogue, action, and description";
    async function send(text: string, index: number) {
      await page.getByRole("textbox", { name: "Ваша реплика" }).fill(text);
      await page.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(page.locator('[data-role="assistant"]')).toHaveCount(index + 1);
      await expect(page.locator('[data-role="assistant"]').last()).toContainText("Стражник кивнул.");
      await expect(page.getByTestId("stop-generation")).toHaveCount(0);
      const request = api.requests[index];
      const instruction = request?.messages[0];
      if (!request || !instruction) throw Error("Missing completion request or style instruction");
      expect(request.max_tokens).toBe(4096);
      return instruction;
    }

    expect(await send("Открываю дверь.", 0)).toMatchObject({
      role: "system", content: expect.stringContaining(defaultStyle),
    });
    await model.click();
    await expect(style).toHaveValue("");
    await style.fill(customStyle);
    const key = dialog.getByLabel("Ключ API");
    const paste = (text: string) => key.evaluate((input, value) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", value);
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
    }, text);
    const testKey = "synthetic-completion-key";
    await paste(testKey + "\r\nsecond-test-key");
    await expect(key).toHaveAttribute("aria-invalid", "true");
    await expect(key).toHaveValue("");
    await save.click();
    await expect(dialog.getByRole("alert")).toContainText("Вставьте один ключ API");
    await paste("  " + testKey + "\r\n");
    await expect(key).toHaveValue(testKey);
    await save.click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await model.click();
    await expect(style).toHaveValue(customStyle);
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    const custom = await send("Кто здесь?", 1);
    expect(api.completionAuthorizations[1]).toBe("Bearer " + testKey);
    expect(custom.content).toContain(customStyle);
    expect(custom.content).not.toContain(defaultStyle);

    await model.click();
    await style.clear();
    await save.click();
    await expect(dialog).toBeHidden();
    expect((await send("Жду ответа.", 2)).content).toContain(defaultStyle);
    expect(api.completionAuthorizations[2]).toBe("Bearer " + testKey);
  } finally {
    await app?.close();
    api.close();
  }
});

test("prepares a cast in a hidden Windows service window and removes its temporary chat", async ({}, info) => {
  let prepared = 0;
  let releaseReply!: () => void;
  let heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
  const api = await provider(async prompt => {
    await heldReply;
    if (!/Now prepare the complete roster|Prepare the NEXT batch/u.test(prompt)) return "received";
    const id = /Request: (cast[\w-]+)/u.exec(prompt)?.[1];
    if (!id || prepared > 1) return "Unexpected request";
    const batch = castBatch(id, prepared === 0 ? 0 : 1);
    prepared++;
    return `<deeprole_cast>${JSON.stringify(batch)}</deeprole_cast>`;
  });
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(info.outputPath("cast"));
    app = started.app;
    const { page } = started;
    await attachModel(page, api.url);
    await seedLibrary(page, [{ kind: "world", id: castWorld.id, data: castWorld }]);
    await page.reload();
    const gameToggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    if (await gameToggle.getAttribute("aria-expanded") !== "true") await gameToggle.click();
    const game = page.locator("#desktop-play-tools");
    await game.locator('.scene-world select').selectOption(castWorld.id, { force: true });
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Черновик основного чата.");
    const command = (message: object) => runtimeCommand(page, message);
    const windowsShown = await watchNewWindows(app);
    await game.getByRole("button", { name: "Создать персонажей из лора" }).click();
    await expect(game.getByRole("button", { name: "Отменить подготовку" })).toBeVisible();
    await expect.poll(() => api.prompts.length).toBe(1);
    expect(await windowsShown()).toEqual([]);
    await draft.press("End");
    await draft.press("Space");
    await expect(draft).toHaveValue("Черновик основного чата. ");
    await draft.press("Backspace");
    releaseReply();
    const status = () => command({ type: "DR_CAST", action: "status", worldId: castWorld.id });
    await expect.poll(async () => ({ phase: (await status()).job?.phase, calls: api.prompts.length }), { timeout: 30_000 }).toMatchObject({ phase: "ready", calls: 3 });
    await expect.poll(async () => (await status()).job?.cleanup, { timeout: 15_000 }).toBe("done");
    const { job } = await status();
    expect(job.draft.characters.map((character: { name: string }) => character.name)).toEqual(["Leon", "Mira"]);
    await expect(game.getByText("Персонажи готовы к проверке")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Персонажи из лора" })).toHaveCount(0);
    await game.getByRole("button", { name: "Проверить персонажей" }).click();
    const review = page.getByRole("dialog", { name: "Персонажи из лора" });
    await expect(review).toBeVisible();
    await review.getByLabel("Закрыть", { exact: true }).click();
    const saved = await command({ type: "DR_CAST", action: "apply", id: job.id, draft: job.draft, selected: ["p1", "p2"], hero: "p1" });
    expect(saved.ok).toBe(true);
    const records = await libraryRecords(page);
    expect(records.filter(record => record.kind === "entity").map(record => record.data.name).sort()).toEqual(["Leon", "Mira"]);
    const chats = await page.evaluate(() => fetch("/__desktop/chats").then(response => response.json()));
    expect(chats).toEqual([]);
    await expect(draft).toHaveValue("Черновик основного чата.");

    heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
    await game.getByRole("button", { name: "Создать персонажей из лора" }).click();
    await expect.poll(() => api.prompts.length).toBe(4);
    await game.getByRole("button", { name: "Отменить подготовку" }).click();
    await expect.poll(async () => (await status()).job, { timeout: 25_000 }).toMatchObject({ phase: "cancelled", cleanup: "done" });
    releaseReply();
    expect(await page.evaluate(() => fetch("/__desktop/chats").then(response => response.json()))).toEqual([]);
    await expect(draft).toHaveValue("Черновик основного чата.");
    expect(await windowsShown()).toEqual([]);
  } finally {
    releaseReply();
    await app?.close();
    api.close();
  }
});

test("a Windows world reset waits for confirmation and opens a fresh story", async ({}, info) => {
  test.setTimeout(120_000);
  const f = resetFixture(), data = info.outputPath("world-reset");
  const scene = f.binding.characterScenes?.[f.world.id];
  if (!scene) throw Error("Reset fixture is missing the old scene.");
  f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
  f.world.contextBudget = 6000;
  f.world.sharedGame = {
    version: 1, id: "old-game", revision: "old-rev", activationId: "old-active", activeBindingId: f.binding.id,
    activeChatId: f.binding.chatId, managed: false, scene, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {},
    memoryOverrides: { includedIds: [f.event.id], excludedIds: [] },
    facts: [{ kind: "event", text: "They hugged yesterday.", quote: "They hugged yesterday." }], updatedAt: 1,
  };
  const cast = resetDraft("placeholder", f.records);
  let prepared = 0;
  let lastDecisions: unknown = null;
  let releaseReply!: () => void;
  const heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
  const api = await provider(async prompt => {
    await heldReply;
    if (/Approved world reset/iu.test(prompt)) return "Original story begins.";
    const request = /Request: (cast[\w-]+)/u.exec(prompt)?.[1] ?? /"request"\s*:\s*"(cast[\w-]+)"/u.exec(prompt)?.[1];
    if (prompt.includes("[DeepRole World Reset Entries]")) {
      const sections = [...prompt.matchAll(/(?:^|\n)Entries:\r?\n([^\r\n]+)/gu)];
      const entriesLine = sections.at(-1)?.[1] ?? "[]";
      const entries = JSON.parse(entriesLine) as { id: string; content: string }[];
      const decisions = entries.map(entry => ({
        id: entry.id, action: entry.id === f.event.id ? "remove" : entry.id === f.mixed.id ? "rewrite" : "keep",
        content: entry.id === f.mixed.id ? "Mother is Tyoma's mother." : "",
        reason: "Preserve original lore and remove played events.", quote: entry.content.trim().slice(0, 240),
      }));
      lastDecisions = { entries, decisions, markers: [...prompt.matchAll(/\[Request ID: ([^\]]+)\]/gu)].map(match => match[1]), sections: sections.length };
      return `<deeprole_cast>${JSON.stringify({ version: 1, request, decisions })}</deeprole_cast>`;
    }
    if (/Prepare the NEXT batch|Now prepare the complete roster/u.test(prompt)) {
      const character = cast.characters[prepared++];
      return `<deeprole_cast>${JSON.stringify({ version: 1, request, characters: [character], present: [], partners: [], warnings: [], more: prepared < cast.characters.length })}</deeprole_cast>`;
    }
    return "received";
  });
  let app: ElectronApplication | undefined;
  try {
    const launched = await openClient(data);
    app = launched.app;
    const { page } = launched;
    await attachModel(page, api.url);
    await seedLibrary(page, f.records);
    const chats = path.join(data, "Chats");
    await mkdir(chats, { recursive: true });
    await writeFile(path.join(chats, f.binding.chatId + ".json"), JSON.stringify({
      id: f.binding.chatId, title: "Old story", head: 2, updatedAt: 1,
      messages: [
        { id: 1, parent: null, role: "user", text: "How did yesterday go?", visible: "How did yesterday go?" },
        { id: 2, parent: 1, role: "assistant", text: "They hugged yesterday.", visible: "They hugged yesterday." },
      ],
    }));
    await page.goto(f.binding.chatUrl);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Старый черновик.");
    const toggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const game = page.locator("#desktop-play-tools");
    const command = (message: object) => runtimeCommand(page, message);
    const windowsShown = await watchNewWindows(app);
    const start = await command({
      type: "DR_CAST", action: "start", worldId: f.world.id, locale: "ru",
      reset: { chatId: f.binding.chatId, revision: "old-rev", start: "Tyoma has just returned after six years abroad." },
    });
    expect(start).toMatchObject({ ok: true });
    let service: Page | undefined;
    await expect.poll(async () => {
      for (const candidate of launched.app.windows()) {
        if (candidate !== page && await candidate.locator("deeprole-field-screen").count().catch(() => 0)) {
          service = candidate;
          return true;
        }
      }
      return false;
    }, { timeout: 12_000 }).toBe(true);
    if (!service) throw Error("The reset screen is missing.");
    const screen = service.locator("deeprole-field-screen");
    await expect(screen.locator("h1")).toHaveText("Подготовка сброса мира");
    await expect(service).toHaveTitle("Подготовка сброса мира — DeepRole");
    await service.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expect(screen.locator(".screen")).toHaveCSS("background-color", "rgb(23, 23, 23)");
    const nativeWindow = await launched.app.browserWindow(service);
    expect(await nativeWindow.evaluate(window => window.isVisible())).toBe(false);
    expect(await windowsShown()).toEqual([]);
    await expect(game.getByRole("button", { name: "Отменить подготовку" })).toBeVisible();
    await toggle.click();
    const mainWindow = await launched.app.browserWindow(page);
    await mainWindow.evaluate(window => window.minimize());
    releaseReply();
    const status = () => command({ type: "DR_CAST", action: "status", worldId: f.world.id, reset: true });
    await expect.poll(async () => {
      const { job } = await status();
      if (job?.phase === "error") throw Error(JSON.stringify({ error: job.error, step: job.step, decisions: lastDecisions, diagnostics: job.diagnostics }));
      return job?.phase;
    }, { timeout: 55_000 }).toBe("ready");
    await expect.poll(async () => (await status()).job?.cleanup, { timeout: 15_000 }).toBe("done");
    await mainWindow.evaluate(window => window.restore());
    await page.setViewportSize({ width: 320, height: 620 });
    await expect.poll(() => toggle.evaluate(button => getComputedStyle(button, "::after").width)).toBe("6px");
    await toggle.click();
    await expect(game.getByText("План сброса готов — мир ещё не сброшен")).toBeVisible();
    const review = page.getByRole("dialog", { name: "Вернуть мир к началу по лору" });
    await expect(review).toHaveCount(0);
    await game.getByRole("button", { name: "Проверить предложения" }).click();
    await expect(review).toBeVisible();
    expect(await windowsShown()).toEqual([]);
    await review.getByRole("button", { name: "Закрыть" }).click();
    const { job } = await status();
    const count = api.prompts.length;
    const confirmed = await command({ type: "DR_CAST", action: "confirm-reset", id: job.id, draft: job.draft, entries: [f.event.id, f.mixed.id] });
    expect(confirmed.ok).toBe(true);
    expect(await command({ type: "DR_CAST", action: "apply-reset", id: job.id, token: confirmed.token, worldName: "Wrong" }))
      .toMatchObject({ ok: false, error: "reset-confirmation-required" });
    expect(api.prompts).toHaveLength(count);
    expect((await libraryRecords(page)).find(row => row.kind === "world")?.data.sharedGame.id).toBe("old-game");
    await expect(draft).toHaveValue("Старый черновик.");
    expect(await command({ type: "DR_CAST", action: "apply-reset", id: job.id, token: confirmed.token, worldName: f.world.name }))
      .toMatchObject({ ok: true, chatOpened: true });
    await expect.poll(() => api.prompts.length, { timeout: 15_000 }).toBe(count + 1);
    expect(api.prompts.at(-1)).toContain("No events from the previous playthrough happened");
    expect(api.prompts.at(-1)).not.toContain("They hugged yesterday");
    await expect.poll(async () => (await libraryRecords(page)).find(row => row.kind === "world")?.data.sharedGame.activeChatId).not.toBe(f.binding.chatId);
    const records = await libraryRecords(page);
    expect(records.some(row => row.data.id === f.event.id)).toBe(false);
    expect(records.find(row => row.data.id === f.mixed.id)?.data.content).toBe("Mother is Tyoma's mother.");
    expect(records.find(row => row.data.id === f.foreign.id)?.data.content).toBe("OTHER WORLD");
    await expect(draft).toHaveValue("Старый черновик.");
  } finally {
    releaseReply();
    await app?.close();
    api.close();
  }
});

test("fits long Windows turns to the model window, checkpoints the same chat, and reports API usage", async ({}, info) => {
  const api = await provider(() => "The door stays open.", 24_000);
  const data = info.outputPath("data");
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    await page.setViewportSize({ width: 320, height: 620 });
    await attachModel(page, api.url);
    const composer = page.getByRole("textbox", { name: "Ваша реплика" });
    const send = page.getByRole("button", { name: "Отправить", exact: true });
    const first = "First turn. " + "a description of the hall ".repeat(1600);
    const next = "Next turn. " + "the far side of the table ".repeat(1600);
    await composer.fill(first);
    await send.click();
    await expect(composer).toHaveValue("");
    const url = page.url();
    await composer.fill(next);
    await send.click();
    await expect(composer).toHaveValue("");
    expect(page.url()).toBe(url);
    const id = new URL(url).pathname.split("/").at(-1);
    const saved = JSON.parse(await readFile(path.join(data, "Chats", id + ".json"), "utf8"));
    expect(saved.messages).toHaveLength(4);
    expect(saved.messages[0].visible).toBe(first);
    expect(saved.contextCheckpoint).toMatchObject({ parent: 2, omittedThrough: 2, scene: "The door stays open." });
    expect(saved.lastContext).toMatchObject({ window: 24_000, omittedMessages: 2, input: 12345, output: 9 });
    expect(api.requests[1]?.messages.map(message => message.role)).toEqual(["system", "user"]);
    expect(api.requests[1]).toMatchObject({ stream_options: { include_usage: true }, max_tokens: 4096 });

    const oversized = "Above the model window. ".repeat(5000);
    await composer.fill(oversized);
    await send.click();
    await expect(page.getByRole("alert")).toContainText("не помещаются в окно модели");
    await expect(composer).toHaveValue(oversized);
    expect(api.requests).toHaveLength(2);

    await page.getByRole("button", { name: "Открыть список чатов" }).click();
    await page.getByRole("button", { name: "Расходы", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Расходы" });
    await expect(dialog.getByRole("listitem")).toHaveCount(7);
    await expect(dialog).toContainText("Данные API получены для 2 из 2 текстовых запросов");
    await expect(dialog).toContainText("≈");
    await expect(dialog).toContainText("Этот чат с начала учёта");
    await dialog.getByText("Бюджет и сверка Venice", { exact: true }).click();
    await dialog.getByLabel("Недельный бюджет, USD").fill("0.06");
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(dialog).toContainText("Настройки расходов сохранены.");
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    const notice = page.getByRole("status").filter({ hasText: /Недельный бюджет/u });
    await expect(notice).toContainText("≈");
    await notice.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: /Недельный бюджет/u })).toHaveCount(0);
  } finally {
    await app?.close();
    api.close();
  }
});

test("imports and connects an existing world, sends its lore, renders choices, and retains a rejected draft", async ({}, info) => {
  const options = [
    { kind: "positive", label: "Пойти к реке", text: "Иду к реке." },
    { kind: "neutral", label: "Подождать", text: "Жду у двери." },
    { kind: "negative", label: "Закрыть дверь", text: "Закрываю дверь." },
    { kind: "surprise", label: "Осмотреть чердак", text: "Осматриваю чердак." },
  ];
  const mock = await provider(prompt => prompt.endsWith("Проверка обрыва.")
    ? null : `У моста ждёт Мира.\n<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`);
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(info.outputPath("game"));
    app = started.app;
    const { page } = started;
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "ru", onboardingComplete: true } }));
    await attachModel(page, mock.url);
    await page.getByRole("button", { name: "Библиотека и настройки" }).click();
    const library = page.frameLocator(".desktop-library iframe");
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await library.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
    await library.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({
      name: "Мастерская.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ Rule: { value: "У реки есть медный фонарь.", importance: "always" } })),
    });
    await library.getByRole("checkbox", { name: "Подключить к открытому чату", exact: true }).check();
    await library.getByRole("checkbox", { name: "Подготовить персонажей из лора", exact: true }).uncheck();
    await library.getByRole("button", { name: "Импортировать и подключить", exact: true }).click();
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await expect(library.locator(".lore-connection.is-attached")).toContainText("Подключён к этому чату");
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(page.locator(".desktop-library")).toHaveCount(0);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Подхожу к мосту.");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toContainText("У моста ждёт Мира.");
    await expect(page.locator("[data-deeprole-choices-host]")).toContainText("Пойти к реке");
    expect(mock.prompts[0]).toContain("У реки есть медный фонарь.");
    await expect(draft).toHaveValue("");
    await draft.fill("Проверка обрыва.");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Ответ оборвался" })).toBeVisible();
    await expect(draft).toHaveValue("Проверка обрыва.");
    await expect(page.locator("[data-role=assistant]")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("world-and-choices.png") });

    await page.getByRole("button", { name: "Библиотека и настройки" }).click();
    await library.getByRole("button", { name: "Настройки", exact: true }).click();
    await library.getByRole("button", { name: /Генерация изображений/ }).click();
    const image = (key: Parameters<typeof imageText>[1]) => imageText("ru", key);
    const imageSettings = library.locator(".dr-image-settings");
    await imageSettings.getByRole("button", { name: image("add"), exact: true }).click();
    await imageSettings.getByLabel(image("label"), { exact: true }).fill("Тестовое подключение");
    await imageSettings.getByLabel(image("baseUrl"), { exact: true }).fill(mock.url);
    await imageSettings.getByRole("switch", { name: image("active"), exact: true }).check();
    await imageSettings.getByRole("button", { name: image("allow"), exact: true }).click();
    await imageSettings.getByLabel(image("key"), { exact: true }).fill("desktop-image-test-key");
    await imageSettings.getByRole("button", { name: image("keySave"), exact: true }).click();
    await imageSettings.getByRole("button", { name: image("models"), exact: true }).click();
    await expect.poll(() => mock.modelRequests.filter(Boolean)).toEqual(["Bearer desktop-image-test-key"]);
    await expect(imageSettings.locator("option[value=desktop-image-fixture]").first()).toHaveCount(1);
    await imageSettings.locator('select:has(option[value="desktop-image-fixture"])').first().selectOption("desktop-image-fixture", { force: true });
    await imageSettings.getByRole("button", { name: image("save"), exact: true }).click();
    const imageEnabled = imageSettings.getByRole("switch", { name: image("enabled"), exact: true });
    await imageEnabled.click();
    await expect(imageEnabled).toBeChecked();
    const profiles = await page.evaluate(async () => {
      const desktop = (window as unknown as { deepRoleDesktop: { call(...args: string[]): Promise<any> } }).deepRoleDesktop;
      return (await desktop.call("storageGet", "local", "deeprole_image_settings")).deeprole_image_settings.profiles;
    });
    const chatUrl = page.url(), chatId = new URL(chatUrl).pathname.split("/").at(-1);
    const world = (await libraryRecords(page)).find(row => row.kind === "world");
    const illustration = await runtimeCommand(page, {
      type: "DR_IMAGE_GENERATE",
      input: { worldId: world?.data.id, chatId, chatUrl, messageKey: "test-bridge-illustration",
        providerId: profiles[0].id, prompt: "A copper lantern on a bridge", referenceKeys: [] },
    });
    expect(illustration).toMatchObject({ ok: true, illustration: { chatId, modelId: "desktop-image-fixture" } });
    expect((await libraryRecords(page)).some(row => row.kind === "illustration" && row.data.chatId === chatId)).toBe(true);
    const usage = await page.evaluate(id => fetch("/__desktop/usage?chat_session_id=" + encodeURIComponent(id ?? ""))
      .then(response => response.json()), chatId);
    expect(usage.images).toMatchObject({ requests: 1, unknown: 1 });
  } catch (error) {
    const page = app?.windows().find(window => window.url().startsWith("https://deeprole.local/") && !window.url().endsWith("background.html"));
    if (page) {
      const frame = page.frames().find(frame => frame.url().includes("sidepanel.html"));
      if (frame) await info.attach("library-state", { body: await frame.locator("body").innerText(), contentType: "text/plain" });
      await page.screenshot({ path: info.outputPath("failure.png") });
    }
    throw error;
  } finally {
    await app?.close();
    mock.close();
  }
});

test("records character states and sourced memory and recalls them after moving the client data", async ({}, info) => {
  const fact = "Мира положила ключ в жестяную банку с белой звездой.";
  const world = { id: "observatory", name: "Мастерская у моста", description: "", color: "#527788", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "noah", name: "Ной", worldId: world.id, kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
  const person = { ...hero, id: "mira", name: "Мира", characterSheet: EMPTY_CHARACTER };
  const mock = await provider(prompt => {
    if (prompt.endsWith("Наблюдаю за пристанью.")) return "На пристани тихо. Мира смотрит на воду.";
    if (prompt.endsWith("Где ключ в этой сцене?") || prompt.endsWith("Мира, забираю ключ. Где он?")) return "В жестяной банке с белой звездой.";
    const state = {
      present: ["Ной", "Мира"], partners: ["Мира"],
      updates: [{ id: "Мира", state: { ...EMPTY_STATUS, action: "talking", condition: "Оставила ключ в банке.", stats: [{ label: "Энергия", value: "Бодра" }] } }],
    };
    const options = ["positive", "neutral", "negative", "surprise"].map((kind, i) => ({
      kind, label: ["Уточнить", "Подождать", "Уйти", "Осмотреть мост"][i], text: ["Где ключ?", "Я жду.", "Я ухожу.", "Я осматриваю мост."][i],
    }));
    const evidence = { kind: "event", anchor: "в жестяную банку с белой звездой", risk: "ordinary" };
    const metadata = { facts: [evidence], state: { op: "set", value: state } };
    return `${fact}\n${JSON.stringify(evidence)}\n<deeprole_characters>${JSON.stringify(metadata)}\n<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
  });
  let app: ElectronApplication | undefined;
  const data = info.outputPath("game-data");
  try {
    const started = await openClient(data);
    app = started.app;
    const page = started.page;
    await attachModel(page, mock.url);
    await page.getByRole("button", { name: "Библиотека и настройки" }).click();
    const library = page.frameLocator(".desktop-library iframe");
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await library.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
    const portrait = await page.evaluate(() => {
      const source = document.createElement("canvas");
      source.width = 750;
      source.height = 1000;
      const context = source.getContext("2d")!;
      context.fillStyle = "#335477";
      context.fillRect(0, 0, 750, 1000);
      context.fillStyle = "#edac90";
      context.fillRect(240, 180, 280, 500);
      return source.toDataURL("image/png");
    });
    person.characterSheet = { ...EMPTY_CHARACTER, sprites: { neutral: portrait } };
    await library.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({
      name: "Мастерская.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "deeprole-world", version: 1,
        records: [{ kind: "world", id: world.id, data: world }, ...[hero, person].map(data => ({ kind: "entity", id: data.id, data }))],
      })),
    });
    await library.getByRole("checkbox", { name: "Подключить к открытому чату", exact: true }).check();
    const auto = library.getByRole("checkbox", { name: "Подготовить персонажей из лора", exact: true });
    if (await auto.count()) await auto.uncheck();
    await library.getByRole("button", { name: "Импортировать и подключить", exact: true }).click();
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await expect(library.locator(".lore-connection.is-attached")).toBeVisible();
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    const textbox = page.getByRole("textbox", { name: "Ваша реплика" });
    await textbox.fill("Мира, куда ты положила ключ?");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toContainText(fact);
    await expect(page.locator(".dr-cast-portrait.right small")).toHaveText("Разговаривает");
    await expect.poll(() => page.locator(".dr-cast-portrait.right img[data-current]").evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(1000);
    await expect(page.locator("[data-deeprole-choices-host]")).toContainText("Уточнить");
    await expect.poll(async () => (await libraryRecords(page)).some(row => row.kind === "story" && row.data.automation?.status === "saved" && row.data.memory?.text.includes("белой звездой"))).toBe(true);
    const gamePanel = page.getByRole("complementary", { name: "Игра", exact: true });
    const context = gamePanel.getByRole("navigation", { name: "Разделы игры" });
    await expect(context.getByRole("button", { name: "Сцена", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(gamePanel.getByRole("combobox", { name: "Мир", exact: true }).locator("option:checked")).toHaveText(world.name);
    const scene = gamePanel.locator(".scene-focus-toggle");
    await scene.click();
    await gamePanel.getByRole("checkbox", { name: "Мира", exact: true }).check();
    await expect(scene).toContainText("Мира");
    await gamePanel.locator(".scene-clear").click();
    await expect(gamePanel.getByRole("checkbox", { name: "Мира", exact: true })).not.toBeChecked();
    await scene.click();
    const suggestions = gamePanel.getByRole("switch", { name: "Варианты хода" });
    await expect(suggestions).toHaveAttribute("aria-checked", "true");
    await suggestions.click();
    await expect(suggestions).toHaveAttribute("aria-checked", "false");
    await suggestions.click();
    await expect(suggestions).toHaveAttribute("aria-checked", "true");
    await gamePanel.locator(".dr-character-row").filter({ hasText: "Мира" }).click();
    const character = page.locator(".dr-character-dialog");
    await expect(character).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(character).toHaveCount(0);
    await expect(gamePanel.locator(".dr-character-row").filter({ hasText: "Мира" })).toBeFocused();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: info.outputPath("game.png") });
    await page.emulateMedia({ colorScheme: "light" });
    const choices = page.locator("[data-deeprole-choices-host]");
    await expect(choices.locator("section")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator(".dr-cast-widget").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const optionFills = await choices.locator(".grid button").evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundImage));
    expect(new Set(optionFills).size).toBe(4);
    expect(optionFills.every(fill => fill.startsWith("linear-gradient"))).toBe(true);
    await page.screenshot({ path: info.outputPath("game-light.png") });
    await app.close();
    app = undefined;
    const copied = info.outputPath("copied");
    await cp(data, copied, { recursive: true, filter: source => !/(?:^|[\\/])(?:Singleton\w*|LOCK|lockfile|Crashpad|GPUCache|Code Cache|Cache)$/u.test(source) });
    const restored = await openClient(copied);
    app = restored.app;
    await restored.page.getByRole("link", { name: "Мира, куда ты положила ключ?" }).click();
    await expect(restored.page.locator("[data-role=assistant]")).toContainText(fact);
    await restored.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Где ключ в этой сцене?");
    await restored.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(restored.page.locator("[data-role=assistant]").last()).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[1]).toContain(fact);

    const saved = savedMemoryText("ru");
    const previousChat = restored.page.url();
    await restored.page.locator(".desktop-play-tools-tabs").getByRole("button", { name: /^Память/u }).click();
    await openSavedPreview(restored.page, "ru");
    const preview = restored.page.getByRole("dialog", { name: saved.title, exact: true });
    await expect(preview.locator("blockquote")).toContainText("белой звездой");
    await preview.getByRole("button", { name: saved.open, exact: true }).click();
    await expect(restored.page).toHaveURL("https://deeprole.local/");
    await expect(restored.page.getByText(saved.queued, { exact: true })).toBeVisible();
    expect(mock.prompts).toHaveLength(2);
    await restored.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Мира, забираю ключ. Где он?");
    await restored.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(restored.page.locator("[data-role=assistant]")).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[2]).toContain(fact);
    const currentChat = restored.page.url();
    expect(currentChat).not.toBe(previousChat);
    const currentId = new URL(currentChat).pathname.split("/").at(-1);
    await expect.poll(async () => (await libraryRecords(restored.page)).find(row => row.kind === "world")?.data.sharedGame?.activeChatId).toBe(currentId);
    await expect(restored.page.getByTestId("stop-generation")).toHaveCount(0);
    await restored.page.getByRole("link", { name: "Мира, куда ты положила ключ?" }).click();
    await expect(restored.page).toHaveURL(previousChat);
    const notice = oldChatNoticeText("ru");
    const openCurrent = restored.page.getByRole("region", { name: notice.title }).getByRole("link", { name: notice.open });
    await expect(openCurrent).toHaveAttribute("href", currentChat);

    await restored.page.getByRole("button", { name: "Библиотека и настройки" }).click();
    const restoredLibrary = restored.page.frameLocator(".desktop-library iframe");
    await restoredLibrary.getByRole("button", { name: "Настройки", exact: true }).click();
    await restoredLibrary.getByRole("button", { name: /Резервные копии и защита/ }).click();
    await restoredLibrary.getByRole("button", { name: "Экспорт", exact: true }).click();
    const exportDialog = restoredLibrary.getByRole("dialog", { name: "Экспорт" });
    await exportDialog.getByRole("radio", { name: /Полная резервная копия/ }).check();
    const exportPath = info.outputPath("world-backup.json");
    await restored.app.evaluate(({ session }, file) => {
      session.defaultSession.once("will-download", (_event, item) => { item.setSavePath(file); });
    }, exportPath);
    await exportDialog.getByRole("button", { name: "Скачать файл", exact: true }).click();
    await expect(exportDialog).toHaveCount(0);
    await expect.poll(() => readFile(exportPath, "utf8").catch(() => ""), { timeout: 15_000 }).toContain("deeprole-backup");
    const backup = JSON.parse(await readFile(exportPath, "utf8"));
    expect(backup.format).toBe("deeprole-backup");
    expect(backup.records.some((record: { kind: string; data: { name?: string } }) => record.kind === "world" && record.data.name === world.name)).toBe(true);

    // Recreate the URLs in an extension backup. The browser transcript is not available.
    for (const entry of backup.records) {
      if (entry.kind === "binding") entry.data.chatUrl = entry.data.chatUrl.replace("https://deeprole.local", "https://chat.deepseek.com");
      if (entry.kind === "snapshot") entry.data.sourceChatUrl = entry.data.sourceChatUrl.replace("https://deeprole.local", "https://chat.deepseek.com");
    }
    await app.close();
    app = undefined;
    const imported = await openClient(info.outputPath("extension-import"));
    app = imported.app;
    await attachModel(imported.page, mock.url);
    await imported.page.getByRole("button", { name: "Библиотека и настройки" }).click();
    const importLibrary = imported.page.frameLocator(".desktop-library iframe");
    await importLibrary.getByRole("button", { name: "Настройки", exact: true }).click();
    await importLibrary.getByRole("button", { name: /Резервные копии и защита/ }).click();
    await importLibrary.locator('.dr-settings-page:not([hidden]) input[type="file"]').setInputFiles({
      name: "extension-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
    });
    const restore = importLibrary.getByRole("dialog", { name: "Восстановление копии" });
    await restore.getByRole("button", { name: "Добавить недостающее", exact: true }).click();
    await expect(restore).toHaveCount(0);
    await importLibrary.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(imported.page.locator(".desktop-chat-link")).toHaveCount(0);
    await imported.page.locator(".desktop-play-tools-tabs").getByRole("button", { name: /^Память/u }).click();
    await imported.page.getByRole("button", { name: saved.title, exact: true }).click({ timeout: 8_000 });
    const migratedPreview = imported.page.getByRole("dialog", { name: saved.title, exact: true });
    await expect(migratedPreview.locator("blockquote")).toContainText("белой звездой");
    await migratedPreview.getByRole("button", { name: saved.connect, exact: true }).click();
    await expect(imported.page.getByText(saved.queued, { exact: true })).toBeVisible();
    expect(mock.prompts).toHaveLength(3);
    await imported.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Мира, забираю ключ. Где он?");
    await imported.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(imported.page.locator("[data-role=assistant]")).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[3]).toContain(fact);

    const activeUrl = imported.page.url();
    const id = new URL(activeUrl).pathname.split("/").at(-1);
    const importedData = info.outputPath("extension-import");
    await imported.page.getByRole("button", { name: "test-story", exact: true }).click();
    const model = imported.page.getByRole("dialog", { name: "Текстовая модель" });
    await model.getByLabel("Лимит токенов на ответ").fill("256");
    await model.getByLabel("Окно контекста вручную").fill("8192");
    await model.getByRole("button", { name: "Сохранить подключение", exact: true }).click();
    await expect(model).toBeHidden();
    test.setTimeout(150_000);
    for (const heading of ["Утро. ", "Полдень. "]) {
      const draft = imported.page.getByRole("textbox", { name: "Ваша реплика" });
      await draft.fill(heading + "The dock is quiet today. ".repeat(525) + "Наблюдаю за пристанью.");
      await imported.page.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(draft).toHaveValue("", { timeout: 16_000 });
    }
    const chatFile = path.join(importedData, "Chats", id + ".json");
    const checkpoint = JSON.parse(await readFile(chatFile, "utf8")).contextCheckpoint;
    expect(checkpoint).toMatchObject({ scene: "На пристани тихо. Мира смотрит на воду." });
    await app.close();
    app = undefined;
    const reopened = await openClient(importedData);
    app = reopened.app;
    await reopened.page.goto(activeUrl);
    const reopenedDraft = reopened.page.getByRole("textbox", { name: "Ваша реплика" });
    await expect(reopened.page.locator("[data-role=assistant]").last()).toContainText("Мира смотрит на воду.");
    expect(JSON.parse(await readFile(chatFile, "utf8")).contextCheckpoint).toEqual(checkpoint);
    await reopenedDraft.fill("Где ключ в этой сцене?");
    await reopened.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(reopened.page.locator("[data-role=assistant]").last()).toContainText("В жестяной банке с белой звездой.");
    expect(reopened.page.url()).toBe(activeUrl);
    const sent = mock.requests.at(-1)?.messages ?? [];
    expect(sent.slice(1, -1).map(message => message.content).join("\n")).not.toContain("белой звездой");
    expect(sent.at(-1)?.content).toContain(fact);
  } finally {
    await app?.close();
    mock.close();
  }
});
