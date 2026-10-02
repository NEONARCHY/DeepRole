import { setEnglish } from "./helpers/settings";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"] as const) {
  test(`visible tuning changes the connected world only and protects newer edits (${locale})`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/tests/fixtures/sidepanel.html?world=1");
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    if (locale === "en") await setEnglish(page);
    const l = (ru: string, en: string) => locale === "ru" ? ru : en;
    await expect(page.locator(".settings-scope")).toContainText("Observatory");
    await page.getByRole("combobox", { name: l("Чувствительность поиска", "Search sensitivity"), exact: true }).selectOption("9");
    await page.getByRole("spinbutton", { name: l("Лимит памяти", "Memory limit"), exact: true }).fill("4500");
    await page.getByRole("button", { name: l("Сохранить подбор", "Save selection settings"), exact: true }).click();
    await expect(page.getByRole("status")).toContainText(l("Настройки подбора сохранены", "Selection settings saved"));
    const data = await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      return { worlds: await repository.list("world"), settings: (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings };
    });
    expect(data.worlds.find((w: any) => w.id === "world-a")).toMatchObject({ contextBudget: 4500, relevanceThreshold: 9 });
    expect(data.worlds.find((w: any) => w.id === "world-b")).toMatchObject({ contextBudget: 3000, relevanceThreshold: 6 });
    expect(data.settings).toMatchObject({ contextBudget: 2000, relevanceThreshold: 6 });
    // Saving again must use the new record version, not conflict with our own save.
    await page.getByRole("spinbutton", { name: l("Лимит памяти", "Memory limit"), exact: true }).fill("4750");
    await page.getByRole("button", { name: l("Сохранить подбор", "Save selection settings"), exact: true }).click();
    await expect(page.getByRole("button", { name: l("Сохранить подбор", "Save selection settings"), exact: true })).toBeDisabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`settings-${locale}-320.png`), fullPage: true });
    await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      const world = (await repository.list("world")).find((w: any) => w.id === "world-a");
      await repository.put("world", { ...world, description: "Written in another editor", updatedAt: Date.now() });
    });
    await page.getByRole("spinbutton", { name: l("Лимит памяти", "Memory limit"), exact: true }).fill("5000");
    await page.getByRole("button", { name: l("Сохранить подбор", "Save selection settings"), exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(async () => {
      const { repository } = await import("/src/storage/repository.ts" as string);
      return (await repository.list("world")).find((w: any) => w.id === "world-a");
    })).toMatchObject({ description: "Written in another editor", contextBudget: 4750 });
  });
}

test("vault has its own password and disabling an unlocked vault needs no export password", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Файлы и защита", exact: true }).click();
  await page.getByLabel("Пароль для файла (необязательно)", { exact: true }).fill("export-only");
  await expect(page.getByRole("button", { name: "Включить локальный сейф", exact: true })).toBeDisabled();
  await page.getByLabel("Новый пароль сейфа", { exact: true }).fill("vault-only");
  await page.getByRole("button", { name: "Включить локальный сейф", exact: true }).click();
  await page.getByLabel("Пароль для файла (необязательно)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Отключить сейф", exact: true }).click();
  await expect(page.getByRole("button", { name: "Включить локальный сейф", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.list("entry")).length; })).toBe(2);
});
