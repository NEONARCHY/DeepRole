import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PROFILE_FIELDS } from "../../src/core/character-profile";
import { profileServiceScreenCopy } from "../../src/core/field-service-screen";

for (const locale of ["ru", "en"] as const) for (const mode of ["history", "suggest"] as const) test(`one-profile native worker, masked result and owned cleanup ${locale} ${mode}`, async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 720 });
 await page.goto(`/tests/fixtures/isolated-fields.html?fullProfile=true&fieldMode=${mode}&locale=${locale}&renderGate=true`);
 const screen = page.locator("deeprole-field-screen"), t = profileServiceScreenCopy(locale);
 await expect(screen.locator("h1")).toHaveText(t.title);
 await expect(screen.locator(".brief")).toHaveText(t.brief("", "Mira"));
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 15000 }).toBe(true);
 const result = await page.evaluate(() => ({ outcome: (window as any).outcome, error: (window as any).error, count: (window as any).sentPrompts.length, cleanup: (window as any).cleanupCount, removed: (window as any).removedTabs, foreign: (window as any).foreignClicks, draft: (window as any).mainDraft, focused: (window as any).serviceWindowRequest.focused }));
 expect(result.error).toBeUndefined(); expect(result.outcome.cleanup).toBe("done"); expect(result.count).toBe(1); expect(result.cleanup).toBe(1); expect(result.removed).toEqual([2]); expect(result.foreign).toBe(0); expect(result.focused).toBe(true);
 expect(result.draft).toBe("Untouched manual game message");
 const profile = JSON.parse(result.outcome.text); expect(Object.keys(profile).sort()).toEqual([...PROFILE_FIELDS].sort());
 for (const key of PROFILE_FIELDS) { expect(profile[key].status).toBe(mode === "history" ? "found" : "suggested"); expect(profile[key].text).toContain("Mira"); expect(profile[key].evidence).toHaveLength(mode === "history" ? 1 : 0); }
 expect(result.outcome.text).not.toMatch(/requestId|"source"|h0|field_/u);
 await expect(screen.locator(".status")).toHaveText(t.stages.done);
 expect(await screen.evaluate(el => el.shadowRoot!.textContent)).not.toMatch(/PRIVATE_SYNTHETIC|Request ID|"evidence"|field_/u);
 expect(await screen.locator(".screen").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
 await expect(page.locator("#foreign-row")).toHaveCount(1);
});
