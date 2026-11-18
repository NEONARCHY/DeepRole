import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { panelToolsText } from "../../src/entrypoints/content/PanelTools";

test("a compact chat exposes a memory warning and review shortcut before opening panel settings", async ({ page }) => {
  await page.setViewportSize({width:320,height:440});
  await page.goto("/tests/fixtures/page-widget.html?panels&locale=ru");
  await page.evaluate(() => (window as any).setWidgetState({
    adaptiveLayout:true, analysisSuggested:true, showMemoryContextIndicator:false,
    selection:{entries:[],estimatedTokens:0,omittedCount:0,memoryCoverage:{kind:"incomplete"}},
  }));
  const dock = page.locator(".dr-widget-dock");
  const warning = dock.locator('[data-restore-widget="memory"]');
  await expect(warning).toBeVisible();
  const title = await warning.innerText();
  expect(title.trim().length).toBeGreaterThan(0);
  expect(title.trim()).not.toBe("Память");
  await expect(dock.locator('[data-restore-widget="notices"]')).toHaveText("Проверка");
  await warning.click();
  await expect(page.locator(".dr-memory-issue-summary")).toContainText(title.trim());
  await page.keyboard.press("Escape");
  await expect(warning).toBeFocused();
});

for (const locale of ["ru", "en"] as const) for (const theme of ["dark", "light"] as const) {
  test(`chat panel chooser by touch and keyboard, 320px and 125% text: ${locale} ${theme}`, async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, hasTouch: true, colorScheme: theme, viewport: { width: 320, height: 440 } });
    try {
      const page = await ctx.newPage(), t = panelToolsText[locale];
      await page.goto("/tests/fixtures/page-widget.html?panels&locale=" + locale);
      await page.evaluate(() => (window as any).setWidgetState({ adaptiveLayout:true }));
      await page.addStyleTag({ content: "html{font-size:125%!important}" });
      const stored = () => page.evaluate(() => ({layout:localStorage.getItem("deeprole.widgetLayout.v1"),width:localStorage.getItem("fixture-panel-width")}));
      const before = await stored();
      const opener = page.getByRole("button", {name:t.compactTitle,exact:true});
      await opener.tap();
      const menu = page.getByRole("dialog", {name:t.compactTitle,exact:true});
      await expect(menu).toBeVisible();
      const text = menu.locator("[data-restore-widget]");
      expect(await text.allInnerTexts()).toEqual([t.meter,t.memory,t.choices,t.characters,t.scene]);
      await expect(menu.getByRole("checkbox", {name:t.mode,exact:true})).toHaveAccessibleDescription(t.modeHint);
      const geometry = await menu.evaluate(node => {
        const controls = [...node.querySelectorAll<HTMLElement>("button,input,label.dr-panel-setting")].filter(el => !el.matches('input[type="checkbox"]'));
        return {width:node.scrollWidth<=node.clientWidth, hits:controls.every(el => {
          const box=el.getBoundingClientRect();
          return box.width>=44 && box.height>=44 && box.left>=0 && box.right<=innerWidth;
        })};
      });
      expect(geometry).toEqual({width:true,hits:true});
      expect((await new AxeBuilder({page}).include(".dr-panel-tools-dialog").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
      const reset = menu.getByRole("button",{name:t.reset,exact:true});
      await reset.focus(); await expect(reset).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      await page.keyboard.press("Enter");
      await menu.locator('[data-restore-widget="characters"]').tap();
      const tile = page.locator('[data-widget="characters"]');
      await expect(menu).toHaveCount(0); await expect(tile).toBeFocused(); await expect(tile).toBeInViewport();
      const collapse = tile.locator(".dr-widget-tools button");
      expect(await collapse.innerText()).toBe(locale === "ru" ? "Свернуть" : "Minimize");
      await collapse.tap(); await expect(tile).toBeHidden(); await expect(opener).toBeFocused();
      const grip = page.locator(".dr-widget-deck-tools .dr-widget-move");
      await grip.tap();
      await expect(menu.locator(".dr-panel-tools-body > :first-child")).toHaveText(t.moveHint);
      await menu.getByRole("button",{name:t.close,exact:true}).tap();
      await expect(grip).toBeFocused();
      expect(await stored()).toEqual(before);
    } finally { await ctx.close(); }
  });
}
