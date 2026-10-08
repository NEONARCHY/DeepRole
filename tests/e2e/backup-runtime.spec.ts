import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";

test("installed Edge exports a full backup and restores the same file through the lore picker", async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3 bridge; the shared flow is checked in Firefox");
  test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "deeprole-backup-test-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true,
    args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    await panel.evaluate(async () => {
      const rows = [
        { kind: "world", id: "w", data: { id: "w", name: "Observatory", description: "", color: "#58a6ff", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 } },
        { kind: "entry", id: "e", data: { id: "e", worldId: "w", bookId: null, title: "Key", content: "  The key is in the observatory.\n", keywords: ["key"], activation: "always", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 } },
      ];
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite");
          for (const row of rows) tx.objectStore("records").put({ ...row, pk: row.kind + ":" + row.id, updatedAt: 1 });
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
      await (window as any).chrome.storage.local.set({ deeprole_settings: { locale: "ru", onboardingComplete: true } });
    });
    await panel.reload();
    await panel.getByRole("button", { name: "Настройки", exact: true }).click();
    await panel.getByRole("button", { name: "Файлы и защита", exact: true }).click();
    await panel.getByRole("button", { name: "Экспорт", exact: true }).click();
    const exportDialog = panel.getByRole("dialog", { name: "Экспорт", exact: true });
    await exportDialog.getByRole("radio", { name: /^Полная резервная копия/ }).check();
    const event = panel.waitForEvent("download");
    await exportDialog.getByRole("button", { name: "Скачать файл", exact: true }).click();
    const download = await event, file = (await download.path())!, original = JSON.parse(await readFile(file, "utf8"));
    expect(original.format).toBe("deeprole-backup");
    await panel.evaluate(() => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); tx.objectStore("records").clear();
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    }));
    await panel.reload(); await panel.getByRole("button", { name: "Лор", exact: true }).click();
    await panel.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
    await panel.locator(".rp-import-input").setInputFiles(file);
    const preview = panel.getByRole("dialog", { name: "Восстановление копии", exact: true });
    await expect(preview).toBeVisible();
    await preview.getByRole("button", { name: "Добавить недостающее", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await panel.reload();
    const rows = await panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
      const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, query = db.transaction("records").objectStore("records").getAll();
        query.onsuccess = () => { db.close(); resolve(query.result.map(({ kind, id, data }: any) => ({ kind, id, data }))); }; query.onerror = () => reject(query.error); };
    }));
    expect(rows).toEqual(original.records);
    await panel.getByRole("button", { name: "Лор", exact: true }).click();
    await panel.getByRole("button", { name: /^Библиотека мира:/ }).click();
    await panel.getByRole("menuitemradio", { name: "Observatory", exact: true }).click();
    await expect(panel.getByRole("heading", { name: "Observatory", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Открыть карту мира", exact: true })).toBeEnabled();
    await panel.screenshot({ path: info.outputPath("installed-backup-restored.png") });
  } finally { await context.close(); }
});
