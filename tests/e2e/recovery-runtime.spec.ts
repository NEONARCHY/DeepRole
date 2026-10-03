import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

for (const browser of ["edge", "brave"] as const) for (const locale of ["ru", "en"] as const) test(`recovery ${browser} ${locale}: live ping, failed ping and preserved storage`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3 build");
  const dir = path.join(info.project.outputDir, "profiles");
  await mkdir(dir, { recursive: true });
  const profile = await mkdtemp(path.join(dir, "recovery-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { ...(browser === "edge" ? { channel: "msedge" } : { executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" }), headless: true, args: [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`, "--enable-logging", `--log-file=${info.outputPath("browser.log")}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const keepAlive = await context.newPage();
    await keepAlive.goto("about:blank");
    const id = new URL(worker.url()).host;
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale }, qa_restart_preserved: "kept" }), locale);
    const recovery = await context.newPage();
    await recovery.goto(`chrome-extension://${id}/recovery.html`);
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "ready");
    await expect(recovery.locator("html")).toHaveAttribute("lang", locale);
    await expect(recovery.locator("#status")).toHaveText(locale === "ru" ? "Фоновая часть отвечает" : "The background service responds");
    await recovery.screenshot({ path: info.outputPath("ready.png") });
    await recovery.evaluate(() => {
      const api = (globalThis as any).chrome;
      const original = api.runtime.sendMessage.bind(api.runtime);
      (globalThis as any).restorePing = () => { api.runtime.sendMessage = original; };
      api.runtime.sendMessage = (message: { type: string }) => message.type === "DR_PING" ? Promise.resolve(undefined) : original(message);
    });
    await recovery.locator("#check").click();
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "failed");
    await recovery.evaluate(() => (globalThis as any).restorePing());
    await recovery.locator("#check").click();
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "ready");
    expect(await worker.evaluate(() => (globalThis as any).chrome.storage.local.get("qa_restart_preserved"))).toEqual({ qa_restart_preserved: "kept" });
    await expect(recovery.locator("#library")).toHaveAttribute("href", `chrome-extension://${id}/sidepanel.html`);
  } finally { await context.close(); }
});
