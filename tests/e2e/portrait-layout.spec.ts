import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function cast(page: Page, count = 4) {
  await page.waitForFunction(() => !!(window as any).getCast);
  await page.evaluate(count => {
    const current = (window as any).getCast();
    const others = Array.from({ length: count - 2 }, (_, index) => ({ ...current.entities[1], id: `extra-${index}`, name: index === 0 ? "Leon" : `Visitor ${index}`, characterSheet: { ...current.entities[1].characterSheet, sprites: {} } }));
    const entities = [...current.entities, ...others];
    (window as any).setCast({ entities, scene: { ...current.scene, presentIds: entities.map((p: any) => p.id), partnerIds: ["mira", "extra-0"], partnerId: "mira", states: { ...current.scene.states, "extra-0": { ...current.scene.states.mira, emotion: "worried", stats: [{ label: "Energy", value: "Tired" }, { label: "Clues", value: "2" }] } } } });
  }, count);
}
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  await handle.scrollIntoViewIfNeeded(); const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 }); await page.mouse.up();
}
async function ratio(image: Locator) { const box = (await image.boundingBox())!; expect(box.width / box.height).toBeCloseTo(.75, 3); }

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test(`independent multi-character portraits and constructor ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`); await cast(page);
  const host = page.locator("[data-deeprole-choices-host]"); const floating = page.locator("[data-deeprole-portrait-layer]"); const widgets = floating.locator(".dr-cast-widget");
  await expect(widgets).toHaveCount(4);
  await expect(floating.locator('.dr-cast-widget[data-talking="true"]')).toHaveCount(2);
  await expect(host.locator("section .dr-cast-widget")).toHaveCount(0);
  for (const image of await widgets.locator("img").all()) await ratio(image);
  const mira = floating.locator('.dr-cast-widget[data-character-id="mira"]'); const leon = floating.locator('.dr-cast-widget[data-character-id="extra-0"]');
  await expect(leon.locator("small")).toHaveText(locale === "ru" ? "Тревога" : "Worried");
  await expect(leon.locator(".dr-cast-highlights>span")).toHaveText(["Energy: Tired", "Clues: 2"]);
  await page.screenshot({ path: info.outputPath(`cast-${locale}-${width}.png`) });
  const sceneBefore = await page.evaluate(() => (window as any).getCast().scene);
  await drag(page, mira.locator(".dr-cast-move"), width < 500 ? -60 : -200, 80);
  await expect(host.getByRole("status").filter({ hasText: locale === "ru" ? "Расстановка сохранена" : "Layout saved" })).toBeVisible();
  const moved = await page.evaluate(() => (window as any).savedLayout); expect(moved.id).toBe("mira"); expect(moved.pose.y).toBeGreaterThan(0); expect(moved.pose.space).toBe("viewport");
  const initialWidth = (await mira.locator("img").boundingBox())!.width;
  await drag(page, mira.locator(".dr-cast-resize"), 40, 45);
  expect((await mira.locator("img").boundingBox())!.width).toBeGreaterThan(initialWidth); await ratio(mira.locator("img"));
  expect(await page.evaluate(() => (window as any).getCast().scene)).toEqual(sceneBefore);
  expect((await new AxeBuilder({ page }).include("[data-deeprole-choices-host]").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`constructor-${locale}-${width}.png`) });
  await mira.locator(".dr-cast-portrait").click(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(mira.locator(".dr-cast-portrait")).toBeFocused();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(JSON.stringify(["w", "a"]))!).positions.mira);
  await page.reload(); await expect(page.locator('.dr-cast-widget[data-character-id="mira"]')).toHaveCSS("position", "absolute");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(JSON.stringify(["w", "a"]))!).positions.mira)).toEqual(saved);
  await page.setViewportSize({ width: 320, height: 950 });
  // ResizeObserver applies the saved position on the next layout turn.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await host.getByRole("button", { name: locale === "ru" ? "Сбросить расстановку" : "Reset layout", exact: true }).click();
  await expect(page.locator('.dr-cast-widget[data-character-id="mira"]')).toHaveCSS("position", "absolute");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(JSON.stringify(["w", "a"]))!).positions)).toEqual({});
});

test("keyboard, cancelled gestures, save errors and scope changes are safe", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?locale=en"); await cast(page);
  const mira = page.locator('.dr-cast-widget[data-character-id="mira"]'); const move = mira.locator(".dr-cast-move"); const resize = mira.locator(".dr-cast-resize");
  await move.focus(); await move.press("ArrowDown"); await expect(page.getByRole("status").filter({ hasText: "Layout saved" })).toBeVisible();
  const pose = await page.evaluate(() => (window as any).savedLayout.pose);
  await resize.focus(); await resize.press("ArrowRight"); await expect.poll(() => page.evaluate(() => (window as any).savedLayout.pose.width)).toBe(pose.width + 8); await ratio(mira.locator("img"));
  await page.evaluate(() => { (window as any).rejectLayout = true; }); const before = await mira.boundingBox();
  await drag(page, move, -50, 60); await expect(page.getByRole("status").filter({ hasText: "Couldn’t save the layout" })).toBeVisible();
  const after = await mira.boundingBox(); expect(after!.x).toBeCloseTo(before!.x, 1); expect(after!.y).toBeCloseTo(before!.y, 1);
  await page.evaluate(() => { (window as any).rejectLayout = false; });
  await move.scrollIntoViewIfNeeded(); const box = (await move.boundingBox())!; await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x - 30, box.y + 70); await page.keyboard.press("Escape"); await page.mouse.up();
  const cancelled = await mira.boundingBox(); expect(cancelled!.x).toBeCloseTo(after!.x, 1); expect(cancelled!.y).toBeCloseTo(after!.y, 1);
  await page.evaluate(() => (window as any).setCast({ chatId: "b" })); await expect(mira).toHaveCSS("position", "absolute");
  await page.evaluate(() => (window as any).setCast({ chatId: "a" })); await expect(mira).toHaveCSS("position", "absolute");
  await page.getByRole("button", { name: "Reset layouts in all chats", exact: true }).click(); await expect(mira).toHaveCSS("position", "absolute");
});

test("twelve participants remain present across changes of addressee", async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 950 }); await page.goto("/tests/fixtures/characters.html?locale=en"); await cast(page, 12);
  await expect(page.locator(".dr-cast-widget")).toHaveCount(12);
  const initialBoxes = await Promise.all((await page.locator(".dr-cast-widget").all()).map(widget => widget.boundingBox()));
  for (let i = 0; i < initialBoxes.length; i++) for (let j = i + 1; j < initialBoxes.length; j++) {
    const a = initialBoxes[i]!; const b = initialBoxes[j]!;
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
  }
  await page.evaluate(() => { const current = (window as any).getCast(); (window as any).setCast({ scene: { ...current.scene, partnerIds: [], partnerId: null } }); });
  await expect(page.locator(".dr-cast-widget")).toHaveCount(12); await expect(page.locator('.dr-cast-widget[data-talking="true"]')).toHaveCount(0);
  await page.evaluate(() => { const current = (window as any).getCast(); (window as any).setCast({ scene: { ...current.scene, partnerIds: ["extra-0"], partnerId: "extra-0", presentIds: current.scene.presentIds.filter((id: string) => id !== "mira") } }); });
  await expect(page.locator(".dr-cast-widget")).toHaveCount(11); await expect(page.locator('.dr-cast-widget[data-character-id="mira"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("twelve-cast.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("odd column counts and a changed protagonist never overlap unplaced portraits", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 950 }); await page.goto("/tests/fixtures/characters.html?locale=en"); await cast(page, 6);
  const widgets = page.locator(".dr-cast-widget"); await expect(widgets).toHaveCount(6);
  const nonOverlapping = async () => {
    const boxes = await Promise.all((await widgets.all()).map(widget => widget.boundingBox()));
    const choices = (await page.locator("[data-deeprole-choices-host] section").boundingBox())!;
    for (const box of boxes) expect(box!.x + box!.width <= choices.x || box!.x >= choices.x + choices.width).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!; const b = boxes[j]!;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  };
  await nonOverlapping();
  await page.evaluate(() => {
    const current = (window as any).getCast();
    (window as any).setCast({ entities: current.entities.map((entity: any) => ({ ...entity, characterSheet: { ...entity.characterSheet, protagonist: entity.id === "mira" } })), scene: { ...current.scene, partnerId: "hero", partnerIds: ["hero"] } });
  });
  await expect(page.locator('.dr-cast-widget[data-character-id="mira"] .dr-cast-role')).toHaveText("Your protagonist");
  await nonOverlapping();
  const hero = (await page.locator('.dr-cast-widget[data-character-id="mira"]').boundingBox())!;
  const partner = (await page.locator('.dr-cast-widget[data-character-id="hero"]').boundingBox())!;
  expect(hero.x).toBeLessThan(partner.x);
  expect(await page.evaluate(() => (window as any).savedLayout)).toBeUndefined();
});

test("portraits snap beside choices and follow their anchor after resize", async ({ page }, info) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/tests/fixtures/characters.html?locale=en");
  await page.evaluate(() => {
    const conversation = document.querySelector("#conversation")!;
    for (const place of ["before", "after"] as const) {
      const spacer = document.createElement("div"); spacer.style.height = "1400px";
      if (place === "before") conversation.before(spacer); else conversation.after(spacer);
    }
  });
  const card = page.locator("[data-deeprole-choices-host] section");
  await card.scrollIntoViewIfNeeded();
  await card.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 180));
  const mira = page.locator('.dr-cast-widget[data-character-id="mira"]');
  const hero = page.locator('.dr-cast-widget[data-character-id="hero"]');
  await expect.poll(async () => (await mira.boundingBox())!.x).toBeGreaterThan((await card.boundingBox())!.x + (await card.boundingBox())!.width);
  const target = (await card.boundingBox())!;
  const handle = (await mira.locator(".dr-cast-move").boundingBox())!;
  await page.mouse.move(handle.x + 20, handle.y + 20); await page.mouse.down();
  await page.mouse.move(target.x - 40, target.y + 24, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).savedLayout?.pose?.dock)).toBe("left");
  const left = (await mira.boundingBox())!, first = (await hero.boundingBox())!;
  expect(left.x + left.width).toBeLessThanOrEqual(target.x);
  expect(first.y + first.height <= left.y || left.y + left.height <= first.y).toBe(true);
  await page.screenshot({ path: info.outputPath("docked-wide.png") });
  const positions = await Promise.all([mira.boundingBox(), hero.boundingBox()]);
  for (const destination of [0, "bottom"] as const) {
    await page.evaluate(destination => window.scrollTo(0, destination === "bottom" ? document.documentElement.scrollHeight : 0), destination);
    await expect.poll(() => page.evaluate(() => {
      const rect = document.querySelector("[data-deeprole-choices-host]")!.getBoundingClientRect();
      return rect.bottom < 0 || rect.top > innerHeight;
    })).toBe(true);
    for (const [index, portrait] of [mira, hero].entries()) {
      await expect.poll(async () => (await portrait.boundingBox())!.x).toBeCloseTo(positions[index]!.x, 0);
      await expect.poll(async () => (await portrait.boundingBox())!.y).toBeCloseTo(positions[index]!.y, 0);
    }
    await page.screenshot({ path: info.outputPath(`docked-scrolled-${destination}.png`) });
  }
  await page.setViewportSize({ width: 480, height: 950 }); await card.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await mira.boundingBox())!.x).toBeGreaterThanOrEqual((await card.boundingBox())!.x);
  const choices = await card.locator(".grid").boundingBox();
  const narrow = (await mira.boundingBox())!;
  await page.screenshot({ path: info.outputPath("docked-narrow.png") });
  expect(narrow.y + narrow.height).toBeLessThanOrEqual(choices!.y);
});
