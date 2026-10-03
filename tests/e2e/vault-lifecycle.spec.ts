import { setEnglish } from "./helpers/settings";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const kind of ["entry", "book"] as const) {
  test(`locking the vault clears the open ${kind} editor instead of reviving it on unlock`, async ({ page }) => {
    await page.goto("/tests/fixtures/sidepanel.html");
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      await repository.enableVault("session-password");
    });
    await page.getByRole("button", { name: "Лор", exact: true }).click();
    await page.getByRole("button", { name: "Список записей", exact: true }).click();
    if (kind === "book") {
      await page.locator(".lore-list-options > summary").click();
      await page.locator(".book-row").getByRole("button", { name: "Изменить", exact: true }).click();
    } else {
      await page.locator(".memory-card").filter({ hasText: "Клятва Миры" }).getByRole("button", { name: "Изменить", exact: true }).click();
    }
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      await repository.lockVault();
    });
    await expect(page.getByPlaceholder("Пароль", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByPlaceholder("Пароль", { exact: true }).fill("session-password");
    await page.getByRole("button", { name: "Разблокировать", exact: true }).click();
    await expect(page.getByRole("button", { name: "Лор", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const record = await page.evaluate(async (kind) => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      return repository.get(kind, kind === "entry" ? "memory-1" : "book-1");
    }, kind);
    expect(record).toMatchObject(kind === "entry" ? { content: "Мира поклялась не покидать город до рассвета." } : { description: "Основной сюжет" });
  });
}

test("locking removes a private quick-memory draft from the page, not just its context", async ({ page }) => {
  await page.goto("/tests/fixtures/page-widget.html");
  await page.getByRole("button", { name: /^Контекст / }).click();
  await page.getByRole("button", { name: "Запомнить", exact: true }).click();
  await page.getByRole("textbox", { name: "Что нужно оставить в памяти?", exact: true }).fill("PRIVATE_UNSAVED_DRAFT");
  await page.evaluate(() => (window as any).setWidgetState({ vaultLocked: true }));
  await expect(page.locator(".dr-assistant textarea")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Сейф закрыт/ })).toBeVisible();
  await page.getByRole("button", { name: "DeepSeek chat control", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-chat-control-clicked", "true");
  await page.evaluate(() => (window as any).setWidgetState({ vaultLocked: false }));
  await page.getByRole("button", { name: /^Контекст / }).click();
  await page.getByRole("button", { name: "Запомнить", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Что нужно оставить в памяти?", exact: true })).toHaveValue("");
});

for (const locale of ["ru", "en"] as const) {
  test(`explicit lock, wrong password, and safe unlock (${locale})`, async ({ page }, testInfo) => {
    await page.goto("/tests/fixtures/sidepanel.html");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
    if (locale === "en") { await setEnglish(page); await page.getByRole("button", { name: "Files & security", exact: true }).click(); }
    const password = page.getByPlaceholder(locale === "ru" ? "Пароль" : "Password", { exact: true });
    await page.getByLabel(locale === "ru" ? "Новый пароль сейфа" : "New vault password", { exact: true }).fill("session-password");
    
    await page.getByRole("button", { name: locale === "ru" ? "Включить локальный сейф" : "Enable local vault", exact: true }).click();
    await page.getByRole("button", { name: locale === "ru" ? "Закрыть сейф" : "Lock vault", exact: true }).click();
    const unlock = page.getByRole("button", { name: locale === "ru" ? "Разблокировать" : "Unlock", exact: true });
    await expect(unlock).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`vault-locked-${locale}.png`), animations: "disabled" });
    await password.fill("wrong-password"); await unlock.click();
    await expect(page.locator(".error-text")).toContainText(locale === "ru" ? "Неверный пароль" : "Wrong password");
    await password.fill("session-password"); await password.press("Enter");
    await expect(page.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true })).toBeVisible();
    expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.list("entry")).length; })).toBe(2);
  });
}

for (const cancel of ["lock", "leave"] as const) {
  test(`a prepared export is not downloaded after ${cancel}`, async ({ page }) => {
    await page.goto("/tests/fixtures/sidepanel.html?vault=1");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const original = repository.rawRecords.bind(repository);
      const gate = new Promise<void>((resolve) => { (window as any).releaseExport = resolve; });
      repository.rawRecords = async () => {
        const rows = await original();
        // Capture a decrypted copy, then hold only this read once outside its lock.
        repository.rawRecords = original; (window as any).exportReady = true;
        await gate; return rows;
      };
      (window as any).downloads = [];
      HTMLAnchorElement.prototype.click = function () { (window as any).downloads.push(this.download); };
    });
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByRole("radio", { name: /^Полная резервная копия/ }).check();
    await page.getByRole("button", { name: "Скачать файл", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).exportReady)).toBe(true);
    if (cancel === "lock") {
      await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); await repository.lockVault(); });
      await expect(page.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();
    } else { await page.getByRole("dialog", { name: "Экспорт", exact: true }).getByRole("button", { name: "Закрыть", exact: true }).click(); await page.getByRole("button", { name: "Лор", exact: true }).click(); }
    await page.evaluate(async () => {
      (window as any).releaseExport();
      // The fixture storage returns already-resolved promises. Drain their chain
      // deterministically, including the createBackup continuation and download.
      for (let i = 0; i < 100; i++) await Promise.resolve();
    });
    expect(await page.evaluate(() => (window as any).downloads)).toEqual([]);
  });
}

test("encrypted backup preview works, and unsafe headers are not mistaken for passwords", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  await page.getByLabel("Пароль для импорта (если нужен)", { exact: true }).fill("backup-password");
  const backup = await page.evaluate(async () => { const { createBackup } = await import("/src/storage/backup.ts" as string); return createBackup("backup-password"); });
  const choose = (value: unknown) => page.locator('input[type="file"]').setInputFiles({ name: "backup.vault.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await choose(backup);
  await page.getByRole("dialog", { name: "Восстановление копии", exact: true }).getByRole("button", { name: "Отмена", exact: true }).click();
  await choose({ ...backup, iterations: 4_000_000_000 });
  await expect(page.getByRole("status")).toHaveText("Не удалось прочитать резервную копию");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.list("entry")).length; })).toBe(2);
});

test("an unfinished world export is cancelled on lock, while a normal export still downloads", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html?vault=1");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const now = Date.now(); await repository.put("world", { id: "w", name: "Export World", description: "Private world notes", color: "#58a6ff", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now });
    (window as any).downloads = [];
    HTMLAnchorElement.prototype.click = function () { (window as any).downloads.push(this.download); };
  });
  await page.getByRole("button", { name: /^Библиотека мира:/ }).click();
  await page.getByRole("menuitemradio", { name: "Export World", exact: true }).click();
  await page.getByRole("button", { name: "Мир и профили", exact: true }).click();
  const card = page.locator(".rp-card").filter({ has: page.getByRole("heading", { name: "Export World", exact: true }) });
  await card.locator("summary").click();
  await card.getByRole("button", { name: "Экспорт", exact: true }).click();
  await page.getByRole("button", { name: "Скачать файл", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).downloads.length)).toBe(1);
  await expect(page.locator(".worlds-view")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    (window as any).downloads = [];
    const original = repository.rawRecords.bind(repository);
    const gate = new Promise<void>((resolve) => { (window as any).releaseExport = resolve; });
    repository.rawRecords = async () => { const records = await original(); repository.rawRecords = original; (window as any).exportReady = true; await gate; return records; };
  });
  await card.getByRole("button", { name: "Экспорт", exact: true }).click();
  await page.getByRole("button", { name: "Скачать файл", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).exportReady)).toBe(true);
  await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); await repository.lockVault(); });
  await expect(page.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();
  await page.evaluate(async () => { (window as any).releaseExport(); for (let i = 0; i < 100; i++) await Promise.resolve(); });
  expect(await page.evaluate(() => (window as any).downloads)).toEqual([]);
});

for (const closing of ["X", "Escape"] as const) test(`the locked embedded menu still closes with ${closing} and does not block DeepSeek`, async ({ page }) => {
  await page.goto("/tests/fixtures/page-widget.html");
  await page.getByRole("button", { name: "Открыть меню DeepRole", exact: true }).click();
  const menu = page.frameLocator("iframe");
  await menu.getByRole("button", { name: "Настройки", exact: true }).click();
  await menu.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  await menu.getByLabel("Новый пароль сейфа", { exact: true }).fill("session-password");

  await menu.getByRole("button", { name: "Включить локальный сейф", exact: true }).click();
  await menu.getByRole("button", { name: "Закрыть сейф", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Разблокировать", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "DeepSeek chat control", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  if (closing === "X") await menu.getByRole("button", { name: "Закрыть", exact: true }).click();
  else { await menu.getByPlaceholder("Пароль", { exact: true }).focus(); await page.keyboard.press("Escape"); }
  await expect(page.locator("iframe")).toHaveCount(0);
});
