import { setEnglish } from "./helpers/settings";
import { expect, test } from "@playwright/test";

test("section guidance explains the workflow without per-button question marks", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.locator(".bottom-nav button")).toHaveCount(3);
  await expect(page.locator(".app-main .dr-help, .bottom-nav .dr-help")).toHaveCount(0);
  await expect(page.locator(".dr-memory-status")).toContainText("Откройте чат DeepSeek");
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await expect(page.getByText("Запрос подготовлен в DeepSeek", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await setEnglish(page);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lore", exact: true })).toBeVisible();
  await expect(page.locator(".dr-mode-guide, .dr-score-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "How memory selection works" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Memory limit", exact: true })).toBeVisible();
});

test("list keeps primary editing visible and secondary actions inside records", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await expect(page.getByText("Клятва Миры")).toBeVisible();
  await expect(page.getByText("Стиль диалога")).toBeVisible();
  await expect(page.locator(".memory-card .memory-actions button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Удалить все записи", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("deeprole-memory.png"), fullPage: true, animations: "disabled" });
});

test("compact settings expose tuning without opening any disclosure", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByText("Резервная копия", { exact: true })).toBeHidden();
  await expect(page.getByRole("spinbutton", { name: "Лимит памяти", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Чувствительность поиска" }).selectOption("9");
  await page.getByRole("button", { name: "Сохранить подбор", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Настройки подбора сохранены");
  expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.relevanceThreshold)).toBe(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("settings-ru-360.png"), fullPage: true });
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  await expect(page.getByRole("button", { name: "Экспорт", exact: true })).toBeVisible();
  await expect(page.getByText("Включить локальный сейф").first()).toBeVisible();
});

test("does not run analysis or handoff from an empty chat", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await expect(page.getByText("Сначала отправьте реплику в чат").first()).toBeVisible();
  await page.locator(".play-continuation > summary").click();
  await expect(page.getByRole("button", { name: "Сохранить состояние истории", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Продолжить в новом чате", exact: true })).toBeDisabled();
});

test("tutorial stays optional and creates a separate editable copy", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await page.locator(".lore-list-options > summary").click();
  await page.getByRole("button", { name: "Посмотреть пример", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Учебный пресет" })).toBeVisible();
  await expect(page.getByText("Ночь без звёзд")).toBeVisible();
  await expect(page.getByText("Скрытая дверь")).toBeVisible();
  await page.getByRole("button", { name: "Создать редактируемую копию", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Карта мира", exact: true })).toBeVisible();
  await expect(page.locator(".lm-world-picker option:checked")).toContainText("Обсерватория Миры");
});

test("Russian and English play screens stay compact at panel width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.locator(".bottom-nav")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("play-ru.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await setEnglish(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("play-en.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
