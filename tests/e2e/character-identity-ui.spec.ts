import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterDiscoveryText as text } from "../../src/core/character-discovery-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("character identity " + locale + " " + width + ": explicit selection, paging, draft and keyboard", async ({ page }, info) => {
 const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); const t = (key: Parameters<typeof text>[1]) => text(locale, key), name = locale === "ru" ? "Алекс" : "Alex";
 await page.setViewportSize({ width, height: 1000 }); await page.goto("/tests/fixtures/character-identity.html?locale=" + locale);
 await page.getByRole("button", { name: t("read"), exact: true }).click(); const card = page.locator("article");
 await card.getByText(t("edit"), { exact: true }).click(); await card.getByLabel(t("background"), { exact: true }).fill("Author draft");
 await card.getByRole("button", { name: t("identityOpen"), exact: true }).click(); await expect(card.getByRole("radio")).toHaveCount(40); await expect(card.getByRole("button", { name: t("identityConfirm"), exact: true })).toBeDisabled();
 await card.getByRole("button", { name: t("next"), exact: true }).click(); await expect(card.getByRole("radio")).toHaveCount(40); await card.getByRole("button", { name: t("next"), exact: true }).click(); await expect(card.getByRole("radio")).toHaveCount(3);
 await card.getByLabel(t("identitySearch"), { exact: true }).fill(name); await page.keyboard.press("Enter"); await expect(card.getByRole("radio")).toHaveCount(2);
 expect(await card.getByRole("radio").first().evaluate(el => { const s = getComputedStyle(el); return { width: s.width, height: s.height, minHeight: s.minHeight, borderRadius: s.borderRadius }; })).toEqual({ width: "16px", height: "16px", minHeight: "0px", borderRadius: "50%" });
 expect(await card.getByLabel(t("background"), { exact: true }).inputValue()).toBe("Author draft"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations; expect(violations).toEqual([]);
 if (info.project.name === "chromium" && width === 320) await page.screenshot({ path: info.outputPath("identity-" + locale + ".png") });
 await card.getByRole("radio", { name: name + " " + (locale === "ru" ? "Курьер" : "Courier"), exact: true }).check(); const confirm = card.getByRole("button", { name: t("identityConfirm") + " · " + name, exact: true }); await confirm.focus(); await page.keyboard.press("Enter"); await expect(card.getByText(t("identityLinked").replace("{name}", name), { exact: true })).toBeVisible();
 const calls = await page.evaluate(() => (window as any).identityFixture.calls); expect(calls.filter((a: any) => a.action === "approve")).toHaveLength(1); expect(calls.at(-1).input.identity).toEqual({ entityId: "person-1", updatedAt: 21 }); expect(calls.at(-1).input.values).toBeUndefined(); expect(calls.some((a: any) => ["run", "profile", "queue"].includes(a.action))).toBe(false); expect(errors).toEqual([]);
 await card.getByRole("button", { name: t("identityRemove"), exact: true }).click(); await expect(card.getByRole("button", { name: t("identityOpen"), exact: true })).toBeVisible();
});
for (const locale of ["ru", "en"] as const) test("character identity " + locale + ": a foreign lookup cannot be selected", async ({ page }) => {
 const t = (key: Parameters<typeof text>[1]) => text(locale, key); await page.goto("/tests/fixtures/character-identity.html?locale=" + locale); await page.getByRole("button", { name: t("read"), exact: true }).click(); await page.evaluate(() => { (window as any).identityFixture.foreign = true; });
 await page.getByRole("button", { name: t("identityOpen"), exact: true }).click(); await expect(page.getByText(t("error"), { exact: true })).toBeVisible(); await expect(page.getByRole("radio")).toHaveCount(0); await expect(page.getByRole("button", { name: t("identityConfirm"), exact: true })).toBeDisabled();
});
