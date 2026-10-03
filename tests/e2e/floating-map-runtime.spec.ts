import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("production iframe is centered, modeless, and returns to the sidebar without losing the chat draft", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime; Firefox UI is covered by the shared fixture");
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-floating-map-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "msedge", headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 15000 });
    const id = new URL(worker.url()).host;
    await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>DeepSeek test page</title><style>body{margin:0;background:#181818;color:#f0f0f2;font:14px system-ui}header{padding:8px 24px}form{position:fixed;bottom:20px;left:25%;width:50%;padding:16px;background:#2b2b2e;border-radius:24px}textarea{width:100%;background:transparent;border:0;color:inherit;font:inherit;min-height:60px}button{padding:8px 12px;border:1px solid #414146;border-radius:12px;background:#353538;color:inherit}</style></head><body><header><button id="page-control">Test chat</button></header><main><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>' }));
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await panel.evaluate(async () => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru", onboardingComplete: true } }));
    await panel.reload();
    await panel.getByRole("button", { name: "Лор", exact: true }).click();
    await panel.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
    await panel.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "Обсерватория.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ name: "Обсерватория", entries: [{ title: "Правило мира", content: "По ночам над городом видны две луны.", activation: "always" }, { title: "Мира", content: "Мира работает в обсерватории и хранит карту неба.", activation: "smart" }, { title: "Башня", content: "Башня стоит на берегу озера.", activation: "smart" }] })) });
    await panel.getByRole("button", { name: "Подтвердить импорт", exact: true }).click();
    const chat = await context.newPage();
    await chat.goto("https://chat.deepseek.com/a/chat/floating-test");
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("Мой несохранённый черновик");
    await expect(chat.locator(".dr-menu-drawer")).toHaveCount(0);
    await chat.getByRole("button", { name: "Открыть меню DeepRole", exact: true }).click();
    await expect(chat.locator(".dr-menu-drawer iframe")).toBeVisible();
    const menu = chat.frameLocator(".dr-menu-drawer iframe");
    await menu.getByRole("button", { name: "Лор", exact: true }).click();
    await menu.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
    const drawer = chat.locator(".dr-menu-drawer");
    const map = menu.getByRole("dialog", { name: "Карта мира", exact: true });
    await expect(drawer).toHaveClass(/map-compact/);
    await expect(map).toBeVisible();
    const bounds = (await drawer.boundingBox())!;
    expect(bounds.width).toBe(1120);
    expect(bounds.height).toBe(820);
    expect(bounds.x).toBe(160);
    expect(bounds.y).toBe(40);
    await expect(menu.locator(".bottom-nav")).toBeHidden();
    await chat.locator("#page-control").click();
    await expect(chat.locator("#page-control")).toBeFocused();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Мой несохранённый черновик");
    await chat.screenshot({ path: info.outputPath("graphite-map-production.png") });
    await chat.keyboard.press("Escape");
    await expect(map).toHaveCount(0);
    await expect(drawer).toHaveClass(/map-closed/);
    await expect(menu.locator(".bottom-nav")).toBeVisible();
    expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(400);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Мой несохранённый черновик");
  } finally { await context.close(); }
});
