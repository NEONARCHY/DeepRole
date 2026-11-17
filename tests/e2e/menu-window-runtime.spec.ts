import { chromium, expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";

for (const locale of ["ru", "en"] as const) test(`detached menu stays with its source chat ${locale}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge build; no desktop input or real DeepSeek requests");
  test.setTimeout(120000);
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true,
    args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`, "--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND"] });
  try {
    let posts = 0;
    await context.route("https://chat.deepseek.com/**", route => {
      if (route.request().method() === "POST") posts++;
      if (route.request().url().includes("/api/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Test workshop</title></head><body><main><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(setup.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale);
    await setup.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite");
          for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
        };
      });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false }, deeprole_library_change: { token: "menu-seed" } });
    }, { records: f.records, locale });
    const chat = await context.newPage();
    await chat.goto(f.binding.chatUrl!);
    await expect(chat.locator(".dr-launcher")).toBeVisible({ timeout: 15000 });
    await chat.locator(".dr-launcher").click();
    // Reproduce a blank embedded frame on our intercepted, synthetic page.
    await chat.locator('iframe[title="DeepRole"]').evaluate(el => el.setAttribute("srcdoc", ""));
    const open = chat.getByRole("button", { name: locale === "ru" ? "Открыть отдельным окном" : "Open in a separate window", exact: true });
    await expect(open).toBeVisible();
    await chat.setViewportSize({ width: 320, height: 700 });
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await chat.screenshot({ path: info.outputPath(`blank-frame-fallback-${locale}.png`) });
    const next = context.waitForEvent("page");
    await open.press("Enter");
    const menu = await next;
    await expect(menu.locator(".dr-menu-source")).toHaveText(locale === "ru" ? "Меню связано с исходной вкладкой DeepSeek." : "This menu is linked to the original DeepSeek tab.", { timeout: 15000 });
    await expect(menu.locator(".site-status")).toHaveClass(/is-online/);
    const sourceId = Number(new URL(menu.url()).searchParams.get("sourceTab"));
    const windowState = () => worker.evaluate(async ({ sourceId, menuUrl }) => {
      const api = (globalThis as any).chrome, source = await api.tabs.get(sourceId), [panel] = await api.tabs.query({ url: menuUrl });
      return { sourceActive: source.active, sourceWindow: source.windowId, panelWindow: panel.windowId };
    }, { sourceId, menuUrl: menu.url() });
    const windows = await windowState();
    expect(windows.sourceActive).toBe(true); expect(windows.sourceWindow).not.toBe(windows.panelWindow);
    await menu.locator('[data-dr-guide="nav-story"]').click();
    await expect(menu.getByRole("heading", { name: locale === "ru" ? "Память игры" : "Story memory", exact: true })).toBeVisible();
    for (const width of [320, 480]) {
      await menu.setViewportSize({ width, height: 800 });
      expect(await menu.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await menu.screenshot({ path: info.outputPath(`separate-menu-${locale}-${width}.png`) });
    }
    const axe = await new AxeBuilder({ page: menu }).include(".app-shell").analyze();
    expect(axe.violations).toEqual([]);
    await menu.reload();
    await expect(menu.locator(".site-status")).toHaveClass(/is-online/);
    const otherPage = context.waitForEvent("page");
    await worker.evaluate(windowId => (globalThis as any).chrome.tabs.create({ windowId, active: true, url: "https://chat.deepseek.com/chat/s/other" }), windows.sourceWindow);
    await otherPage;
    await expect.poll(async () => (await windowState()).sourceActive).toBe(false);
    await expect(menu.locator(".dr-menu-source")).toHaveClass(/is-warning/);
    await chat.bringToFront();
    await expect(menu.locator(".dr-menu-source")).not.toHaveClass(/is-warning/);
    // A second click finds the existing window instead of creating another one.
    const count = context.pages().length;
    await chat.locator(".dr-launcher").click(); await open.click();
    await expect(chat.locator(".dr-menu-drawer")).toHaveCount(0);
    expect(context.pages()).toHaveLength(count);
    await chat.goto("https://chat.deepseek.com/chat/s/different");
    await expect(menu.locator(".dr-menu-source")).toHaveClass(/is-warning/);
    await expect(menu.locator(".site-status")).not.toHaveClass(/is-online/);
    await chat.goto(f.binding.chatUrl!); await chat.bringToFront();
    await expect(menu.locator(".dr-menu-source")).not.toHaveClass(/is-warning/);
    await chat.close();
    await expect(menu.locator(".dr-menu-source")).toHaveClass(/is-warning/);
    expect(posts).toBe(0);
  } finally { await context.close(); }
});
