import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { profileCopy } from "../../src/core/character-profile-i18n";
import { characterText } from "../../src/core/characters";
import { PROFILE_FIELDS } from "../../src/core/character-profile";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`single profile review ${locale} ${width}`, async ({ page }) => {
 await page.setViewportSize({ width, height: 860 }); await page.goto(`/tests/fixtures/character-profile.html?locale=${locale}`);
 const editor = page.locator(".dr-character-dialog"), wizard = editor.locator("[data-profile-generator]"), t = profileCopy(locale);
 await expect(wizard.getByRole("button", { name: t.generate })).toBeDisabled(); await editor.getByRole("textbox", { name: characterText(locale, "name"), exact: true }).fill(locale === "ru" ? "Нора" : "Nora");
 const background = editor.locator('[data-character-text-field="background"] textarea'); await background.fill(locale === "ru" ? "Подруга Миры" : "Mira’s friend");
 await wizard.getByRole("button", { name: t.generate }).click(); expect(await page.evaluate(() => (window as any).requests.length)).toBe(0);
 await expect(wizard.getByRole("button", { name: t.history })).toHaveAccessibleDescription(t.historyHint); await wizard.getByRole("button", { name: t.history }).click(); await expect(wizard.getByText(t.ready)).toBeVisible();
 expect(await page.evaluate(() => (window as any).requests.map((r: any) => [r.field.key, r.field.mode, r.field.profileFields]))).toEqual([["character-profile", "history", [...PROFILE_FIELDS]], ["character-profile", "suggest", ["personality", "goals", "background"]]]);
 await expect(wizard.getByText(t.suggested, { exact: true })).toHaveCount(3); await expect(wizard.getByText(t.found, { exact: true })).toHaveCount(1);
 await expect(wizard.getByRole("checkbox", { name: t.select + " · " + characterText(locale, "background"), exact: true })).not.toBeChecked(); expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
 const result = wizard.locator('[data-profile-proposal="personality"] textarea'); await result.fill(locale === "ru" ? "Мой вариант характера." : "My revised personality.");
 expect(await wizard.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
 const axe = await new AxeBuilder({ page }).include(".dr-character-dialog").analyze(); expect(axe.violations).toEqual([]);
 await wizard.getByRole("button", { name: t.apply }).click(); await expect(background).toHaveValue(locale === "ru" ? "Подруга Миры" : "Mira’s friend");
 await expect(editor.locator('[data-character-text-field="personality"] textarea')).toHaveValue(locale === "ru" ? "Мой вариант характера." : "My revised personality."); expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
 await editor.getByRole("button", { name: characterText(locale, "save"), exact: true }).click(); await expect(editor.getByText(characterText(locale, "saveDone"), { exact: true })).toBeVisible();
 expect(await page.evaluate(() => ({name:(window as any).saved.name,profile:(window as any).saved.sheet,scene:(window as any).saved.state,present:(window as any).saved.present}))).toMatchObject({name:locale==="ru"?"Нора":"Nora",profile:{protagonist:false,sprites:{},background:locale==="ru"?"Подруга Миры":"Mira’s friend"},scene:{condition:"",goal:"",relationship:""},present:false});
});
test("unknown character gets only invented suggestions; existing fields and late edits stay protected", async ({ page }) => {
 await page.goto("/tests/fixtures/character-profile.html?existing&scenario=unknown"); const editor = page.locator(".dr-character-dialog"), wizard = editor.locator("[data-profile-generator]");
 await wizard.getByRole("button", { name: "Generate profile" }).click(); await wizard.getByRole("button", { name: "Find in history first" }).click(); await expect(wizard.getByText("Invented", { exact: true })).toHaveCount(4);
 await expect(wizard.getByRole("checkbox", { name: "Insert · Appearance and clothing", exact: true })).not.toBeChecked();
 const goals = editor.locator('[data-character-text-field="goals"] textarea'); await goals.fill("Manual goal after review"); await wizard.getByRole("button", { name: "Insert selected into fields" }).click(); await expect(goals).toHaveValue("Manual goal after review");
 await expect(editor.locator('[data-character-text-field="appearance"] textarea')).toHaveValue("Kept manual coat"); await expect(wizard.getByText(profileCopy("en").skipped)).toBeVisible(); expect(await page.evaluate(() => (window as any).saved)).toBeUndefined();
});
test("failed cleanup does not launch creative fallback", async ({ page }) => {
 await page.goto("/tests/fixtures/character-profile.html?existing"); await page.evaluate(() => { (window as any).cleanupFailed=true; }); const wizard = page.locator("[data-profile-generator]");
 await wizard.getByRole("button", { name: "Generate profile" }).click(); await wizard.getByRole("button", { name: "Find in history first" }).click(); await expect(wizard.getByText(profileCopy("en").cleanup)).toBeVisible(); expect(await page.evaluate(() => (window as any).requests.length)).toBe(1);
 await expect(wizard.getByRole("link")).toHaveAttribute("href", "https://chat.deepseek.com/chat/s/owned");
});
