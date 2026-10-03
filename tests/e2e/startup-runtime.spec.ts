import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

for (const browser of ["edge", "brave"] as const) for (const mode of ["stalled", "rejected", "library-rejected", "library-stalled", "normal", "normal-ru"] as const) test(`installed ${browser} menu survives ${mode} startup`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 installed build");
  const dir = path.join(info.project.outputDir, "profiles");
  await mkdir(dir, { recursive: true });
  const profile = await mkdtemp(path.join(dir, "startup-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { ...(browser === "edge" ? { channel: "msedge" } : { executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" }), headless: true, args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    if (mode === "normal-ru") await worker.evaluate(() => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru" } }));
    await worker.evaluate(mode => {
      const api = (globalThis as any).chrome;
      const localGet = api.storage.local.get.bind(api.storage.local);
      (globalThis as any).restoreStartup = () => { api.storage.local.get = localGet; api.storage.session.get = get; };
      api.storage.local.get = (keys: string) => {
        if (keys === "deeprole_vault") {
          if (mode === "library-stalled") return new Promise(() => {});
          if (mode === "library-rejected") return Promise.reject(new Error("QA unavailable library"));
        }
        return localGet(keys);
      };
      const get = api.storage.session.get.bind(api.storage.session);
      api.storage.session.get = (keys: string) => {
        if (String(keys).startsWith("deeprole_draft_scene_")) {
          if (mode === "stalled") return new Promise(() => {});
          if (mode === "rejected") return Promise.reject(new Error("QA aborted worker request"));
        }
        return get(keys);
      };
    }, mode);
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: '<main><form><textarea aria-label="Message"></textarea><button>Send</button></form></main>' }));
    const chat = await context.newPage();
    await chat.goto("https://chat.deepseek.com/");
    await expect(chat.locator(".dr-launcher")).toBeVisible({ timeout: 12000 });
    if (!mode.startsWith("normal")) await expect(chat.getByRole("alert")).toContainText(/Memory could not connect|Память не подключилась/);
    else await expect(chat.getByRole("alert")).toHaveCount(0);
    await worker.evaluate(() => (globalThis as any).restoreStartup());
    await chat.locator(".dr-launcher").click();
    const menu = chat.frameLocator("iframe[title='DeepRole']");
    if (browser === "brave") {
      const open = menu.getByRole("button", { name: /Open DeepRole in a tab|Открыть DeepRole во вкладке/ });
      await expect(open).toBeVisible();
      if (mode === "normal-ru") await expect(open).toHaveText("Открыть DeepRole во вкладке");
      await menu.getByRole("alert").screenshot({ path: info.outputPath(`menu-fallback-${mode}.png`), animations: "disabled" });
      const nextPage = context.waitForEvent("page");
      await open.click();
      const fullMenu = await nextPage;
      await expect(fullMenu.locator(".onboarding")).toBeVisible();
      await fullMenu.screenshot({ path: info.outputPath(`full-menu-${mode}.png`) });
      const pageCount = context.pages().length;
      await chat.bringToFront();
      await open.click();
      await expect.poll(() => context.pages().length).toBe(pageCount);
    } else await expect(menu.locator(".onboarding")).toBeVisible();
    await expect(chat.getByRole("textbox", { name: "Message" })).toHaveValue("");
    await chat.screenshot({ path: info.outputPath(`startup-${mode}.png`) });
    if (!mode.startsWith("normal")) {
      await worker.evaluate(() => (globalThis as any).restoreStartup());
      await chat.reload();
      await expect(chat.locator(".dr-launcher")).toBeVisible();
      await expect(chat.getByRole("alert")).toHaveCount(0);
    }
  } finally { await context.close(); }
});
