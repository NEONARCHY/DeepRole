import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

// Isolate browser-owned tab navigation from cast prompts and storage. No real
// DeepSeek request is permitted, including when a mock route fails to attach.
for (const synchronize of [false, true]) test(`owned tab navigation: attach barrier ${synchronize}`, async () => {
  test.skip(test.info().project.name !== "chromium");
  // The unsynchronized control deliberately reproduces a Playwright/Edge
  // attachment deadlock. Run explicitly for diagnosis, not as a quality gate.
  test.skip(!synchronize && process.env.DR_NAVIGATION_DIAGNOSTIC !== "1", "Opt-in unsynchronized browser diagnostic");
  test.setTimeout(60000);
  const folder = path.join(test.info().project.outputDir, "profiles");
  await mkdir(folder, { recursive: true });
  const profile = await mkdtemp(path.join(folder, "navigation-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "msedge", headless: true,
    args: ["--disable-extensions-except=" + path.resolve(".output/chrome-mv3"), "--load-extension=" + path.resolve(".output/chrome-mv3"), "--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND"],
  });
  const requests: string[] = [];
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await context.route("https://chat.deepseek.com/**", async route => {
      requests.push(route.request().url());
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><textarea aria-label='Message'></textarea></body></html>" });
    });
    const panel = await context.newPage();
    await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html");
    const created = context.waitForEvent("page");
    const id = await panel.evaluate(async () => (await (globalThis as any).chrome.tabs.create({ url: "about:blank", active: false })).id);
    if (synchronize) {
      const page = await created;
      await page.evaluate(() => document.readyState);
    }
    await panel.evaluate(async id => { await (globalThis as any).chrome.tabs.update(id, { url: "https://chat.deepseek.com/?navigation_probe=1" }); }, id);
    const page = await created;
    await expect(page.locator("textarea")).toBeVisible({ timeout: 20000 }).catch(async error => {
      throw new Error(String(error) + "\nNavigation diagnostics: " + JSON.stringify({
        synchronize, requests, observedUrl: page.url(),
        tab: await panel.evaluate(id => (globalThis as any).chrome.tabs.get(id), id),
      }));
    });
    expect(requests).toContain("https://chat.deepseek.com/?navigation_probe=1");
  } finally { await context.close(); }
});
