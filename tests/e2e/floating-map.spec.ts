import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"] as const) for (const width of [1440, 360]) {
  test(`map floats over the page, leaves it clickable and restores the sidebar (${locale}, ${width})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/page-widget.html?world=1&locale=${locale}`);
    // Put a real page control in the exposed top margin, even on a narrow screen.
    await page.locator("#underlying-chat-control").evaluate((node) => {
      Object.assign((node as HTMLElement).style, { top: "4px", left: "8px" });
    });
    await expect(page.locator(".dr-menu-drawer")).toHaveCount(0);
    await page.getByRole("button", { name: locale === "en" ? "Open DeepRole menu" : "Открыть меню DeepRole", exact: true }).click();
    await expect(page.locator(".dr-menu-drawer iframe")).toBeVisible();
    const frame = page.frameLocator(".dr-menu-drawer iframe");
    const l = (ru: string, en: string) => locale === "ru" ? ru : en;
    if (locale === "en") {
      await frame.getByRole("button", { name: "Настройки", exact: true }).click();
      await frame.getByRole("button", { name: "Приложение", exact: true }).click();
      await frame.getByRole("button", { name: "English", exact: true }).click();
    }
    await frame.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
    await frame.getByRole("button", { name: l("Открыть карту мира", "Open world map"), exact: true }).click();
    const drawer = page.locator(".dr-menu-drawer");
    const map = frame.getByRole("dialog", { name: l("Карта мира", "World map"), exact: true });
    await expect(drawer).toHaveClass(/map-compact/);
    await expect(map).toBeVisible();
    const bounds = (await drawer.boundingBox())!;
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(1);
    expect(Math.abs(bounds.y + bounds.height / 2 - 450)).toBeLessThan(1);
    expect(bounds.width).toBeLessThan(width);
    expect(bounds.height).toBeLessThan(900);
    // The iframe must end at the window border, rather than cover the DeepSeek page.
    const mapBounds = (await map.boundingBox())!;
    expect(Math.abs(mapBounds.width - bounds.width)).toBeLessThan(1);
    expect(Math.abs(mapBounds.height - bounds.height)).toBeLessThan(1);
    await expect(frame.locator(".bottom-nav")).toBeHidden();
    await page.getByRole("button", { name: "DeepSeek chat control", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-chat-control-clicked", "true");
    await page.screenshot({ path: info.outputPath(`floating-map-${locale}-${width}.png`) });
    expect((await new AxeBuilder({ page }).include([".dr-menu-drawer iframe", ".dr-map-workspace"]).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await map.getByRole("button", { name: l("Развернуть на весь экран", "Expand to full screen"), exact: true }).click();
    await expect(drawer).toHaveClass(/map-full/);
    expect(Math.round((await drawer.boundingBox())!.width)).toBe(width - 24);
    await map.getByRole("button", { name: l("Свернуть в окно", "Collapse to window"), exact: true }).click();
    await expect(drawer).toHaveClass(/map-compact/);
    await map.getByRole("button", { name: l("Закрыть карту", "Close map"), exact: true }).click();
    await expect(map).toHaveCount(0);
    await expect(drawer).toHaveClass(/map-closed/);
    await expect(frame.locator(".bottom-nav")).toBeVisible();
    await expect(frame.getByRole("button", { name: l("Открыть карту мира", "Open world map"), exact: true })).toBeVisible();
    const sidebar = (await drawer.boundingBox())!;
    expect(Math.abs(sidebar.x + sidebar.width - width)).toBeLessThan(1);
    expect(sidebar.width).toBeLessThanOrEqual(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
