import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

for (const browser of ["edge", "brave"] as const) for (const locale of ["ru", "en"] as const) test(`recovery ${browser} ${locale}: live ping, failed ping and preserved storage`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3 build");
  test.skip(browser === "brave" && !existsSync("C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"), "Brave is not installed; no browser coverage claimed");
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
    await expect(recovery.locator("#reload")).toBeHidden();
    await recovery.screenshot({ path: info.outputPath("ready.png") });
    await recovery.evaluate(() => {
      const api = (globalThis as any).chrome;
      const original = api.runtime.sendMessage.bind(api.runtime);
      (globalThis as any).restorePing = () => { api.runtime.sendMessage = original; };
      api.runtime.sendMessage = (message: { type: string }) => message.type === "DR_PING" ? Promise.resolve(undefined) : original(message);
    });
    await recovery.locator("#check").click();
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "failed");
    await expect(recovery.locator("#reload")).toBeHidden();
    await recovery.evaluate(() => {
      (globalThis as any).chrome.runtime.sendMessage = async () => ({ ok: true, build: "2025-01-01T00:00:00.000Z" });
    });
    await recovery.setViewportSize({ width: 320, height: 470 });
    await recovery.addStyleTag({ content: "html { font-size: 20px; }" });
    await recovery.locator("#check").focus();
    await recovery.keyboard.press("Enter");
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "mismatch");
    await expect(recovery.locator("#background-build")).toContainText("2025-01-01");
    await recovery.locator("#check").focus();
    await recovery.keyboard.press("Tab");
    await expect(recovery.locator("#reload")).toBeFocused();
    for (const colorScheme of ["light", "dark"] as const) {
      await recovery.emulateMedia({ colorScheme });
      for (const control of await recovery.locator(".button").all()) {
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(await recovery.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await recovery.screenshot({ path: info.outputPath("mismatch-" + colorScheme + ".png"), fullPage: true });
    }
    await recovery.evaluate(() => (globalThis as any).restorePing());
    await recovery.locator("#check").click();
    await expect(recovery.locator("#status")).toHaveAttribute("data-result", "ready");
    expect(await worker.evaluate(() => (globalThis as any).chrome.storage.local.get("qa_restart_preserved"))).toEqual({ qa_restart_preserved: "kept" });
    await expect(recovery.locator("#library")).toHaveAttribute("href", `chrome-extension://${id}/sidepanel.html`);
  } finally { await context.close(); }
});
