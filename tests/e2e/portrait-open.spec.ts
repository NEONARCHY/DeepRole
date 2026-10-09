import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) {
  test(`portrait opens without an extra zoom button ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await page.waitForFunction(() => !!(window as any).getCast);
    const src = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 160;
      const paint = canvas.getContext("2d")!; paint.fillStyle = "#95bbca"; paint.fillRect(0, 0, 120, 160);
      const image = canvas.toDataURL("image/png"), cast = (window as any).getCast();
      (window as any).setCast({ entities: cast.entities.map((p: any) => p.id === "mira" ? { ...p, characterSheet: { ...p.characterSheet, sprites: { neutral: image, happy: image } } } : p) });
      return image;
    });
    const widget = page.locator('.dr-cast-widget[data-character-id="mira"]');
    const card = widget.locator(".dr-cast-portrait"), image = card.locator("img");
    const viewer = page.locator("[data-deeprole-photo-viewer] dialog");
    await expect(image).toHaveAttribute("src", src);
    expect(await widget.locator(".dr-cast-zoom").count()).toBe(0);
    await expect(widget.locator(".dr-cast-move")).toHaveCount(1);
    await expect(widget.locator(".dr-cast-resize")).toHaveCount(1);
    const before = await page.evaluate(() => (window as any).getCast());

    await image.click();
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img")).toHaveAttribute("src", src);
    await page.keyboard.press("Escape"); await expect(viewer).toHaveCount(0);
    await card.focus(); await card.press("Space");
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape"); await expect(card).toBeFocused();
    await card.press("Enter");
    await expect(page.locator(".dr-character-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".dr-character-dialog")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).getCast())).toEqual(before);
    await widget.screenshot({ path: info.outputPath("portrait-without-zoom-button.png") });

    await page.evaluate(() => {
      const cast = (window as any).getCast();
      (window as any).setCast({ entities: cast.entities.map((p: any) => p.id === "mira" ? { ...p, characterSheet: { ...p.characterSheet, sprites: {} } } : p) });
    });
    await expect(card).not.toHaveAttribute("aria-keyshortcuts", "Space");
    await card.press("Space");
    await expect(viewer).toHaveCount(0);
    await expect(page.locator(".dr-character-dialog")).toBeVisible();
  });
}
