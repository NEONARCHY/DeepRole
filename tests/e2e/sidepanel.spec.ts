import { openSettingsSection, setEnglish  } from "./helpers/settings";
import { expect, test } from "@playwright/test";
import { characterText } from "../../src/core/characters";

test("section guidance explains the workflow without per-button question marks", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await expect(page.locator(".bottom-nav button")).toHaveCount(4);
  await expect(page.locator(".app-main .dr-help, .bottom-nav .dr-help")).toHaveCount(0);
  await expect(page.locator(".dr-memory-status")).toContainText("Откройте чат DeepSeek");
  await page.getByText("Добавить или проверить память вручную", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await expect(page.getByText("Запрос подготовлен в DeepSeek", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await setEnglish(page);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Worlds", exact: true })).toBeVisible();
  await expect(page.locator(".dr-mode-guide, .dr-score-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "How memory selection works" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Added context budget", exact: true })).toBeVisible();
});

test("list keeps primary editing visible and secondary actions inside records", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
  await page.getByRole("button", { name: "Список записей", exact: true }).click();
  await expect(page.getByText("Клятва Миры")).toBeVisible();
  await expect(page.getByText("Стиль диалога")).toBeVisible();
  await expect(page.locator(".memory-card .memory-actions button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Удалить все записи", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("deeprole-memory.png"), fullPage: true, animations: "disabled" });
});

test("settings explain categories before exposing advanced tuning", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByText("Резервная копия", { exact: true })).toBeHidden();
  await expect(page.getByRole("spinbutton", { name: "Лимит добавленного контекста", exact: true })).not.toBeVisible();
  await openSettingsSection(page,"memory","ru");
  await expect(page.getByRole("spinbutton", { name: "Лимит добавленного контекста", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Чувствительность поиска" }).selectOption("9");
  await page.getByRole("button", { name: "Сохранить подбор", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Настройки подбора сохранены");
  expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.relevanceThreshold)).toBe(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("settings-ru-360.png"), fullPage: true });
  await openSettingsSection(page,"data","ru");
  await expect(page.getByRole("button", { name: "Экспорт", exact: true })).toBeVisible();
  await expect(page.getByText("Включить локальный сейф").first()).toBeVisible();
});

test("scene pins use persistent switches in compact settings", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await openSettingsSection(page,"app","ru");
  for (const label of ["Закрепить варианты на экране", "Закрепить оба портрета"]) {
    const control = page.getByRole("checkbox", { name: label });
    await expect(control).not.toBeChecked();
    const box = (await control.boundingBox())!;
    expect(box.width).toBe(38); expect(box.height).toBe(22);
    await control.check();
    await expect(control).toBeChecked();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("scene-pins-ru-360.png"), fullPage: true, animations: "disabled" });
  await expect.poll(() => page.evaluate(async () => {
    const saved = (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings;
    return [saved.pinSceneChoices, saved.pinPortraitLeft, saved.pinPortraitRight];
  })).toEqual([true, true, true]);
});

test("does not run analysis or handoff from an empty chat", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByText("Добавить или проверить память вручную", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await expect(page.getByText("Сначала откройте игровой чат DeepSeek.",{exact:true})).toBeVisible();
  await page.locator(".play-continuation > summary").click();
  await page.locator(".play-continuation .memory-detail > summary").click();
  await expect(page.getByRole("button", { name: "Сохранить состояние истории", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Продолжить в новом чате", exact: true })).toBeDisabled();
});

for(const locale of ["ru","en"] as const) test(`preference failure is visible, keeps the saved value and allows retry ${locale}`,async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}`);
  await page.locator(".bottom-nav").getByRole("button",{name:locale==="ru"?"Настройки":"Settings",exact:true}).click();
  for(const item of [
    {section:"app",name:locale==="ru"?"Закрепить варианты на экране":"Pin options on screen",key:"pinSceneChoices"},
    {section:"characters",name:characterText(locale,"enable"),key:"characterSheetsEnabled"},
    {section:"safety",name:locale==="ru"?"Автоматически исправлять данные ответа":"Automatically correct reply metadata",key:"automaticMetadataRepair"},
  ] as const){
    await openSettingsSection(page,item.section,locale);
    const toggle=page.getByRole("checkbox",{name:item.name,exact:true}),wasChecked=await toggle.isChecked();
    const before=await page.evaluate(async()=>(await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings);
    await page.evaluate(()=>(window as any).failSettingsSave=true);await toggle.click();
    await expect(page.getByRole("alert")).toContainText(locale==="ru"?"Настройки не сохранены":"Settings were not saved");
    await expect.poll(()=>toggle.isChecked()).toBe(wasChecked);
    expect(await page.evaluate(async()=>(await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings)).toEqual(before);
    await page.evaluate(()=>(window as any).failSettingsSave=false);await toggle.click();
    await expect.poll(()=>toggle.isChecked()).toBe(!wasChecked);await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(async key=>(await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings[key],item.key)).toBe(!wasChecked);
  }
  expect(errors).toEqual([]);
});

for(const locale of ["ru","en"] as const) test(`slow preference save has a visible pending state and prevents overlapping writes ${locale}`,async({page})=>{
  await page.goto(`/tests/fixtures/sidepanel.html?locale=${locale}`);
  await page.locator(".bottom-nav").getByRole("button",{name:locale==="ru"?"Настройки":"Settings",exact:true}).click();
  await openSettingsSection(page,"app",locale);
  const toggle=page.getByRole("checkbox",{name:locale==="ru"?"Закрепить варианты на экране":"Pin options on screen",exact:true});
  await page.evaluate(()=>(window as any).delaySettingsSave=true); await toggle.click();
  await expect(page.getByRole("status").filter({hasText:locale==="ru"?"Сохраняем настройки…":"Saving settings…"})).toHaveText(locale==="ru"?"Сохраняем настройки…":"Saving settings…");
  await expect(toggle).toBeDisabled();
  expect(await page.evaluate(async()=>(await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.pinSceneChoices??false)).toBe(false);
  await page.evaluate(()=>{(window as any).delaySettingsSave=false;(window as any).releaseSettingsSave();});
  await expect(toggle).toBeEnabled();await expect(toggle).toBeChecked();await expect(page.getByText(locale==="ru"?"Сохраняем настройки…":"Saving settings…",{exact:true})).toHaveCount(0);
});

test("tutorial stays optional and creates a separate editable copy", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Миры", exact: true }).click();
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
