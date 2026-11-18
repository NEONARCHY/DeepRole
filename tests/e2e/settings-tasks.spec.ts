import { expect, test, type Locator } from "@playwright/test";
import { navigationText } from "../../src/core/navigation-i18n";
import { adaptiveText } from "../../src/core/adaptive-layout";
import { experienceText } from "../../src/core/experience-i18n";

async function checkTargets(surface: Locator) {
  const issues = await surface.evaluateAll(roots => {
    const issues: string[] = [];
    for (const root of roots) for (const el of root.querySelectorAll<HTMLElement>("button,summary,select,input,textarea")) {
      if (!el.checkVisibility() || !el.getClientRects().length || el.matches(":disabled, [type=hidden]")) continue;
      const box = el.getBoundingClientRect();
      const labels = (el as HTMLInputElement).labels;
      const targets = [box, ...Array.from(labels ?? [], label => label.getBoundingClientRect())];
      if (box.left < -1 || box.right > innerWidth + 1 || !targets.some(b => b.width >= 44 && b.height >= 44)) {
        issues.push(el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
      }
    }
    return issues;
  });
  expect(issues).toEqual([]);
}

for (const locale of ["ru", "en"] as const) for (const theme of ["light", "dark"] as const) {
  test(`settings at 320px and 125% text: ${locale} ${theme}`, async ({ page }) => {
    const t = (key: Parameters<typeof navigationText>[1]) => navigationText(locale, key);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 320, height: 440 });
    await page.goto("/tests/fixtures/sidepanel.html?world&locale=" + locale);
    await page.addStyleTag({ content: "html { font-size: 125% !important }" });
    await page.locator(".bottom-nav").getByRole("button", { name: t("settings"), exact: true }).click();
    const saved = () => page.evaluate(() => (window as any).chrome.storage.local.get("deeprole_settings"));
    const before = await saved();
    const directory = page.locator(".dr-settings-directory");
    await expect(directory.getByRole("heading", { level: 1 })).toHaveText(t("settings"));
    for (const section of ["appearance", "app", "characters", "images", "safety", "data", "memory", "diagnostics"] as const) {
      const route = directory.getByRole("button", { name: t(section), exact: true });
      if (section === "memory") await directory.getByText(t("advanced"), { exact: true }).click();
      await expect(route).toHaveAccessibleDescription(t(`${section}Hint`));
      await route.focus(); await page.keyboard.press("Enter");
      await expect(directory.getByRole("heading", { level: 1 })).toBeFocused();
      if (section === "appearance") {
        await expect(page.getByRole("checkbox", { name: adaptiveText(locale).title, exact: true })).toHaveAccessibleDescription(t("adaptive"));
      } else if (section === "app") {
        await expect(page.getByRole("checkbox", { name: experienceText(locale, "memoryContextIndicator"), exact: true })).toHaveAccessibleDescription(t("memoryMeter"));
        await expect(page.locator(".segmented button:visible[aria-pressed=true]")).toHaveCount(1);
      } else if (section === "characters") {
        const editor = page.locator(".dr-action-help");
        await editor.locator("summary").click();
        await editor.locator("textarea").fill("СосредоточенноПрислушиваетсяКРазговору");
      }
      await checkTargets(page.locator(".dr-settings-page:visible"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await directory.getByRole("button", { name: t("back"), exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(route).toBeFocused();
      await expect(route).toBeInViewport();
    }
    expect(await saved()).toEqual(before);
  });
}
