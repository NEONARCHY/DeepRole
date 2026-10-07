import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { progressText } from "../../src/core/progress-i18n";
import { relationshipText } from "../../src/core/relationship-i18n";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) test(`characteristics, feedback, undo and locks ${locale} ${width}`, async ({ page }, info) => {
  const t = (key: Parameters<typeof progressText>[1]) => progressText(locale, key);
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`);
  const hero = page.locator(".dr-character-row").filter({ hasText: "Leon" }); await hero.click(); const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: locale === "ru" ? "В сцене" : "In scene", exact: true }).click(); await dialog.getByRole("button", { name: t("starter"), exact: true }).click();
  const attributes = dialog.locator(".dr-attribute-editor");
  await attributes.getByLabel(`${t("name")} 1`, { exact: true }).fill(locale === "ru" ? "Силы" : "Stamina"); const label = locale === "ru" ? "Силы" : "Stamina";
  await attributes.getByLabel(`${t("low")} · ${label}`, { exact: true }).fill("Tired; rest is needed.");
  const save = dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }); const close = dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).last();
  await save.click(); await expect(dialog.locator("footer [role=status]")).toBeVisible(); await close.click(); await expect(hero).toContainText(`${label} 70`);
  await page.evaluate(() => (window as any).playProgressEvent()); const feedback = page.locator(".dr-turn-feedback"); await expect(feedback).toContainText(`${label} +3 · 73`); await expect(feedback).toContainText("Rest helped him recover"); await expect(hero).toContainText(`${label} 73`); await feedback.getByText(t("evidence"), { exact: true }).click(); await expect(feedback.locator("blockquote")).toContainText("Leon rested by the fire");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect((await new AxeBuilder({ page }).include(".dr-characters").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`progress-${locale}-${width}.png`) });
  await page.evaluate(() => (window as any).playProgressEvent()); await expect(feedback).toContainText(t("rejected")); await expect(hero).toContainText(`${label} 73`);
  await hero.click(); await dialog.getByRole("tab", { name: locale === "ru" ? "В сцене" : "In scene", exact: true }).click(); await dialog.locator(".dr-attribute-history summary").click(); await dialog.locator(".dr-attribute-history").getByRole("button", { name: t("undo"), exact: true }).click(); await expect(attributes.getByLabel(`${t("current")} · ${label}`, { exact: true })).toHaveValue("70"); await save.click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  const log = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.hero.attributes); expect(log.values.energy).toBe(70); expect(log.history.map((h: any) => h.source)).toEqual(["manual", "scene"]);
  await attributes.getByRole("switch", { name: t("lock"), exact: true }).first().check(); await save.click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(el => el.clientWidth)); expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); await page.screenshot({ path: info.outputPath(`attributes-${locale}-${width}.png`) }); await close.click();
  await page.evaluate(() => (window as any).playProgressEvent("Leon rested again after the long walk to the harbor.")); await expect(hero).toContainText(`${label} 70`); await expect(feedback).toContainText(t("unchanged"));
  const enabled = page.getByRole("switch", { name: relationshipText(locale, "enabled"), exact: true }); await enabled.uncheck(); await expect(hero.locator(".dr-attribute-summary")).toHaveCount(0); await expect(feedback).toHaveCount(0);
  const exported = await page.evaluate(() => (window as any).exportWorld()); expect(exported.records.find((r: any) => r.id === "hero").data.characterSheet.attributes[0]).toMatchObject({ id: "energy", label, initial: 70 });
});

for (const locale of ["ru", "en"] as const) test(`new world characteristic opt-in ${locale}`, async ({ page }) => {
  const t = (key: Parameters<typeof progressText>[1]) => progressText(locale, key); await page.setViewportSize({ width: 360, height: 900 }); await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`); await page.getByRole("button", { name: locale === "ru" ? "Новый мир" : "New world", exact: true }).click(); const form = page.locator(".lm-create-dialog"); await form.getByLabel(locale === "ru" ? "Название" : "Name", { exact: true }).fill("Adventure"); await form.getByText(relationshipText(locale, "setupTitle"), { exact: true }).click();
  await expect(form.getByRole("switch", { name: t("setup"), exact: true })).toBeDisabled(); await form.getByLabel(relationshipText(locale, "heroName"), { exact: true }).fill("Leon"); await form.getByRole("switch", { name: t("setup"), exact: true }).check(); await form.getByRole("button", { name: relationshipText(locale, "createWorld"), exact: true }).click(); await expect(form).toHaveCount(0);
  const created = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "entity" && r.data.worldId === (window as any).createdWorld.id && r.data.characterSheet.protagonist).data); expect(created.characterSheet.attributes.map((a: any) => a.initial)).toEqual([70, 50]);
});

test("duplicate attribute names reveal the invalid field, not a generic save failure", async ({ page }) => {
  await page.goto("/tests/fixtures/relationships.html?locale=en"); await page.locator(".dr-character-row").filter({ hasText: "Leon" }).click(); const dialog = page.getByRole("dialog"); await dialog.getByRole("tab", { name: "In scene", exact: true }).click(); await dialog.getByRole("button", { name: progressText("en", "starter"), exact: true }).click(); await dialog.getByLabel("Characteristic name 2", { exact: true }).fill("ENERGY"); await dialog.getByRole("tab", { name: "Profile", exact: true }).click(); await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await expect(dialog.getByRole("tab", { name: "In scene", exact: true })).toHaveAttribute("aria-selected", "true"); await expect(dialog.getByLabel("Characteristic name 1", { exact: true })).toBeFocused(); expect(await dialog.getByLabel("Characteristic name 1", { exact: true }).evaluate((el: HTMLInputElement) => el.validationMessage)).toBe(progressText("en", "duplicate"));
});

test("undo of a relationship consequence is a reviewed manual correction", async ({ page }) => {
  await page.goto("/tests/fixtures/relationships.html?locale=en"); await expect(page.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible(); await page.evaluate(() => (window as any).playEvent()); await expect(page.locator(".dr-turn-feedback")).toContainText("Trust +3 · 68"); await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog"); await dialog.getByRole("tab", { name: "Relationships", exact: true }).click(); const log = dialog.locator('[data-editor-section="relationships"] .dr-bond-history'); await log.locator("summary").click(); await log.getByRole("button", { name: progressText("en", "undo"), exact: true }).click(); await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  const bond = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.mira.bonds.hero); expect(bond).toMatchObject({ trust: 65, affinity: 55 }); expect(bond.history.map((h: any) => h.source)).toEqual(["manual", "scene"]);
});
