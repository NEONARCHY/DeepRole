import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const pinned of [false, true]) test(`adaptive scene survives live resize ${locale} pinned=${pinned}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.addInitScript(() => localStorage.setItem("poses", JSON.stringify({ resetAt: 0, positions: { "0": { x: .1, y: .2, width: 260, space: "viewport" } } })));
  await page.goto(`/tests/fixtures/adaptive-scene.html?locale=${locale}${pinned ? "&pinned" : ""}`);
  const card = page.locator("[data-deeprole-choices-host]");
  const deck = page.locator(".dr-widget-deck");
  const before = await page.evaluate(() => localStorage.getItem("poses"));
  await expect(card).toBeVisible();
  const wide = (await card.boundingBox())!.width;
  const assertFits = async () => {
    const shapes = await page.evaluate(() => {
      const card = document.querySelector("[data-deeprole-choices-host]")!;
      const frame = document.querySelector("[data-deeprole-portrait-layer]")!.shadowRoot!.querySelector<HTMLElement>(".dr-cast-frame")!;
      const portraits = frame.hasAttribute("data-adaptive-compact") ? [frame] : [...frame.querySelectorAll<HTMLElement>(".dr-cast-widget")];
      const boxes = [card.shadowRoot!.querySelector("section")!, ...portraits, ...document.querySelectorAll(".dr-widget-dock,.dr-widget-tile:not([hidden])")].map(node => {
        const r = node.getBoundingClientRect();return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const visible = boxes.filter(b => b.y < innerHeight && b.y + b.height > 0);
      return { overflow: document.documentElement.scrollWidth > innerWidth, outside: visible.some(b => b.x < -1 || b.x + b.width > innerWidth + 1), overlaps: visible.flatMap((a,i) => visible.slice(i+1).filter(b => a.x < b.x + b.width - 1 && a.x + a.width - 1 > b.x && a.y < b.y + b.height - 1 && a.y + a.height - 1 > b.y)).length };
    });
    expect(shapes).toEqual({ overflow: false, outside: false, overlaps: 0 });
  };
  for (const width of [1200, 900, 640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => { try { await assertFits(); return true; } catch { return false; } }).toBe(true);
    if (width < 850) await expect(deck).toHaveAttribute("data-compact", "true");
    if (width <= 640) expect((await card.boundingBox())!.width).toBeLessThan(wide);
  }
  await page.screenshot({ path: info.outputPath("adaptive-narrow.png") });
  await page.locator('[data-restore-widget="characters"]').click();
  await expect(page.locator('[data-widget="characters"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-widget="characters"]')).toBeHidden();
  await page.setViewportSize({ width: 320, height: 460 });
  await expect.poll(async () => { try { await assertFits(); return true; } catch { return false; } }).toBe(true);
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect.poll(async () => { try { await assertFits(); return true; } catch { return false; } }).toBe(true);
  await expect(deck).not.toHaveAttribute("data-compact", "true");
  expect((await card.boundingBox())!.width).toBeCloseTo(wide, 0);
  expect(await page.evaluate(() => localStorage.getItem("poses"))).toBe(before);
  await page.getByRole("button", { name: locale === "ru" ? "Адаптивный размер: вкл" : "Adaptive sizing: on", exact: true }).click();
  await expect(deck).not.toHaveAttribute("data-adaptive", "true");
  expect(await page.evaluate(() => localStorage.getItem("poses"))).toBe(before);
  await page.screenshot({ path: info.outputPath("manual-sizes-restored.png") });
});

for (const locale of ["ru", "en"]) test(`adaptive sizing setting is saved ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") {
    const { setEnglish } = await import("./helpers/settings"); await setEnglish(page);
  }
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: locale === "ru" ? "Адаптивный размер" : "Adaptive sizing", exact: true });
  await expect(toggle).toBeChecked(); await toggle.uncheck();
  await expect.poll(() => page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.adaptiveLayout)).toBe(false);
});

test("manual movement stays available in the adaptive wide layout", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto("/tests/fixtures/adaptive-scene.html");
  const hero = page.locator('.dr-cast-widget[data-character-id="0"]');
  await expect(hero).toBeVisible(); await hero.hover();
  const before = (await hero.boundingBox())!;
  const handle = (await hero.locator(".dr-cast-move").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 250, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await hero.boundingBox())!.y).toBeGreaterThan(before.y + 100);
  await expect.poll(() => page.evaluate(() => !!JSON.parse(localStorage.getItem("poses") ?? "null")?.positions["0"])).toBe(true);
});

test("crowded compact scene keeps every portrait reachable without covering choices", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/tests/fixtures/adaptive-scene.html?crowded&pinned");
  const frame = page.locator(".dr-cast-frame[data-adaptive-compact]");
  await expect(frame.locator(".dr-cast-widget")).toHaveCount(40);
  const last = frame.locator(".dr-cast-widget").last();
  await last.scrollIntoViewIfNeeded();
  const row = (await frame.boundingBox())!, portrait = (await last.boundingBox())!;
  expect(portrait.x).toBeGreaterThanOrEqual(row.x - 1); expect(portrait.x + portrait.width).toBeLessThanOrEqual(row.x + row.width + 1);
  const choices = (await page.locator("[data-deeprole-choices-host] section").boundingBox())!;
  expect(row.y + row.height).toBeLessThanOrEqual(choices.y);
});
