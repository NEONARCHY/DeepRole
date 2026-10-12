import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterTab } from "./character-helpers";
import { characterUpdateText } from "../../src/core/character-update-i18n";
import { relationshipText } from "../../src/core/relationship-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`character edit guidance ${locale} ${width}: scope, locks, save and accessibility`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto("/tests/fixtures/characters.html?locale=" + locale);
  await expect(page.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible();
  await page.evaluate(async () => {
    const { DEFAULT_RELATIONSHIP } = await import("/src/core/relationships.ts" as string), f = (window as any).getCast();
    (window as any).setCast({ entities: f.entities.map((p: any) => p.id !== "mira" ? p : { ...p, characterSheet: { ...p.characterSheet, relationships: { ...DEFAULT_RELATIONSHIP, enabled: true, milestones: [{ id: "promise", label: "Kept the promise", required: false }] }, attributes: [{ id: "energy", label: "Energy", initial: 70, low: "Tired", high: "Rested", cap: 3 }] } }), scene: { ...f.scene, states: { ...f.scene.states, mira: { ...f.scene.states.mira, bonds: { hero: { trust: 35, affinity: 70, locked: false, completed: [], history: [] } }, attributes: { values: { energy: 65 }, locked: [], history: [] } } } } });
  });
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("note", { name: characterUpdateText(locale, "profile").title })).toBeVisible(); if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(`profile-notice-${locale}-${width}.png`) });
  await dialog.locator(".dr-profile-protection summary").click();await dialog.locator(".dr-profile-protection").getByRole("checkbox").first().check();
   await characterTab(dialog, "scene", locale); const scene = dialog.getByRole("note", { name: characterUpdateText(locale, "scene").title }); await expect(scene).toBeVisible();
  if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(`scene-notice-${locale}-${width}.png`) });
  const condition = dialog.getByRole("textbox", { name: locale === "ru" ? "Состояние" : "Condition", exact: true }); await scene.click(); await expect(condition).not.toBeFocused(); await condition.fill("Resting after the scene");
  const attribute = dialog.locator(".dr-attribute-editor"); await expect(attribute.getByRole("note")).toHaveText(characterUpdateText(locale, "attributes").title + characterUpdateText(locale, "attributes").body);
  await attribute.getByRole("switch").check(); await expect(attribute.getByRole("note")).toHaveAttribute("data-mode", "locked");
  await dialog.getByRole("tab", { name: relationshipText(locale, "title"), exact: true }).click(); const current = dialog.getByRole("region", { name: relationshipText(locale, "current"), exact: true }); await expect(current.getByRole("note")).toHaveAttribute("data-mode", "active");
  await current.getByRole("switch").check(); await expect(current.getByRole("note")).toHaveAttribute("data-mode", "locked"); await current.getByRole("spinbutton", { name: relationshipText(locale, "trust"), exact: true }).fill("40");
  await expect(dialog.locator('[data-kind="events"]')).toHaveAttribute("data-mode", "locked");
  expect((await new AxeBuilder({page}).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await current.scrollIntoViewIfNeeded(); if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(`edit-notice-${locale}-${width}.png`) });
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ sheet: { protectedProfileFields: ["appearance"], attributes: [{ id: "energy", initial: 70 }] }, state: { condition: "Resting after the scene", bonds: { hero: { trust: 40, affinity: 70, locked: true } }, attributes: { values: { energy: 65 }, locked: ["energy"] } } });
});
