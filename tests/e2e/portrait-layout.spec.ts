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

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test(`player speech portrait updates independently ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.waitForFunction(() => !!(window as any).getCast);
  const speech = locale === "ru" ? "Разговаривает" : "speaking";
  const images = await page.evaluate(speech => {
    const image = (color: string) => {
      const canvas = document.createElement("canvas"); canvas.width = 60; canvas.height = 80;
      const context = canvas.getContext("2d")!; context.fillStyle = color; context.fillRect(0, 0, 60, 80);
      return canvas.toDataURL("image/png");
    };
    const neutral = image("#657687"), talking = image("#789d88");
    const current = (window as any).getCast();
    (window as any).setCast({ entities: current.entities.map((person: any) => person.id === "hero"
      ? { ...person, characterSheet: { ...person.characterSheet, sprites: { neutral, [speech]: talking } } }
      : person) });
    return { neutral, talking };
  }, speech);
  const hero = page.locator('.dr-cast-widget[data-character-id="hero"]');
  const mira = page.locator('.dr-cast-widget[data-character-id="mira"]');
  await expect(hero.locator("img")).toHaveAttribute("src", images.neutral);
  const npcBefore = await mira.locator("small").innerText();
  await page.evaluate(speech => {
    const current = (window as any).getCast();
    (window as any).setCast({ scene: { ...current.scene, states: { ...current.scene.states,
      hero: { ...current.scene.states.hero, emotion: speech } } } });
  }, speech);
  await expect(hero.locator("img")).toHaveAttribute("src", images.talking);
  await expect(hero.locator("small")).toHaveText(speech);
  await expect(hero).toHaveAttribute("data-talking", "false");
  await expect(mira.locator("small")).toHaveText(npcBefore);
  await ratio(hero.locator("img"));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`player-speech-${locale}-${width}.png`) });
  await page.evaluate(() => {
    const current = (window as any).getCast();
    (window as any).setCast({ scene: { ...current.scene, states: { ...current.scene.states,
      hero: { ...current.scene.states.hero, emotion: "neutral" } } } });
  });
  await expect(hero.locator("img")).toHaveAttribute("src", images.neutral);
  await expect(mira.locator("small")).toHaveText(npcBefore);
});

for (const width of [320, 1600]) test(`pinned scene keeps portraits with the options at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/tests/fixtures/characters.html?locale=en&pins");
  await page.evaluate(() => {
    const conversation = document.querySelector("#conversation")!;
    for (const place of ["before", "after"] as const) {
      const spacer = document.createElement("div"); spacer.style.height = "1200px";
      if (place === "before") conversation.before(spacer); else conversation.after(spacer);
    }
  });
  const card = page.locator("[data-deeprole-choices-host]");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Pin both portraits" }).click();
  await card.getByRole("button", { name: "Pin options on screen" }).click();
  await expect(card).toHaveAttribute("data-deeprole-choices-pinned", "true");
  const hero = page.locator('.dr-cast-widget[data-character-id="hero"]');
  const mira = page.locator('.dr-cast-widget[data-character-id="mira"]');
  // The card pin flag precedes the portrait reserve calculation.
  await expect.poll(async () => {
    const [c, h, m] = await Promise.all([card.boundingBox(), hero.boundingBox(), mira.boundingBox()]);
    return !!c && !!h && !!m && h.width > 0 && h.height > 0 && m.width > 0 && m.height > 0 && h.y >= 0 && m.y >= 0 && (width < 700
      ? h.y + h.height <= c.y && m.y + m.height <= c.y
      : h.x + h.width <= c.x && m.x >= c.x + c.width);
  }).toBe(true);
  const before = await Promise.all([card.boundingBox(), hero.boundingBox(), mira.boundingBox()]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const after = await Promise.all([card.boundingBox(), hero.boundingBox(), mira.boundingBox()]);
  for (let index = 0; index < before.length; index++) {
    expect(after[index]!.x).toBeCloseTo(before[index]!.x, 0);
    expect(after[index]!.y).toBeCloseTo(before[index]!.y, 0);
  }
  expect(after[0]!.y).toBeGreaterThanOrEqual(0);
  expect(after[0]!.y + after[0]!.height).toBeLessThanOrEqual(800);
  if (width >= 700) {
    expect(after[1]!.x + after[1]!.width).toBeLessThanOrEqual(after[0]!.x);
    expect(after[2]!.x).toBeGreaterThanOrEqual(after[0]!.x + after[0]!.width);
  } else {
    expect(after[1]!.y + after[1]!.height).toBeLessThanOrEqual(after[0]!.y);
    expect(after[2]!.y + after[2]!.height).toBeLessThanOrEqual(after[0]!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath(`pinned-scene-${width}.png`) });
});

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

for (const locale of ["ru", "en"] as const) test(`speaker group and portraits survive a missing choices card ${locale}`, async ({ page }, info) => {
  // Three portraits need room to sit to the right of a 690px choices card.
  await page.setViewportSize({ width: 2100, height: 950 });
  await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  await page.locator("#conversation").evaluate(node => { (node as HTMLElement).style.width = "690px"; });
  await cast(page, 4);
  await page.locator("[data-deeprole-choices-host] section").scrollIntoViewIfNeeded();
  const layer = page.locator("[data-deeprole-portrait-layer]");
  const portrait = (id: string) => layer.locator(`.dr-cast-widget[data-character-id="${id}"]`);
  const box = async (id: string) => (await portrait(id).boundingBox())!;
  const choices = (await page.locator("[data-deeprole-choices-host] section").boundingBox())!;
  await expect.poll(async () => (await box("extra-1")).x).toBeGreaterThan((await box("extra-0")).x);
  const hero = await box("hero"), mira = await box("mira"), leon = await box("extra-0"), visitor = await box("extra-1");
  expect(hero.x + hero.width).toBeLessThanOrEqual(choices.x - 23);
  expect(mira.x).toBeGreaterThanOrEqual(choices.x + choices.width + 23);
  expect(leon.x - mira.x - mira.width).toBeCloseTo(6, 0);
  expect(visitor.x - leon.x - leon.width).toBeCloseTo(6, 0);
  expect(leon.width).toBeCloseTo(mira.width, 0);
  expect(visitor.width / mira.width).toBeCloseTo(.85, 1);
  for (const item of [hero, leon, visitor]) expect(item.y + item.height).toBeCloseTo(mira.y + mira.height, 0);
  await page.screenshot({ path: info.outputPath(`speaker-group-${locale}.png`) });

  await page.evaluate(() => {
    const current = (window as any).getCast();
    (window as any).setCast({ scene: { ...current.scene, partnerIds: ["extra-0"], partnerId: "extra-0" } });
  });
  await expect.poll(async () => (await box("extra-0")).x).toBeLessThan((await box("mira")).x);
  expect((await box("mira")).width / (await box("extra-0")).width).toBeCloseTo(.85, 1);
  const positions = await Promise.all(["hero", "mira", "extra-0", "extra-1"].map(box));
  await page.locator("[data-deeprole-choices-host]").evaluate(node => { (node as HTMLElement).style.display = "none"; });
  await page.evaluate(() => (window as any).syncPortraits());
  for (const [index, id] of ["hero", "mira", "extra-0", "extra-1"].entries()) {
    expect((await box(id)).x).toBeCloseTo(positions[index]!.x, 0);
    expect((await box(id)).y).toBeCloseTo(positions[index]!.y, 0);
  }
  await page.evaluate(async () => {
    (window as any).portraitLayer = document.querySelector("[data-deeprole-portrait-layer]");
    document.querySelector("[data-deeprole-choices-host]")!.remove();
    const modulePath = "/src/adapters/deepseek-characters-dom.ts";
    const { syncChoicePortraits } = await import(modulePath);
    const current = (window as any).getCast();
    syncChoicePortraits(true, current.entities, current.scene, document.documentElement.lang as "ru" | "en", () => {}, document, { scope: JSON.stringify([current.worldId, current.chatId]), resetAt: 0, onSave: async () => {} });
  });
  await expect(layer).toHaveCount(1);
  for (const [index, id] of ["hero", "mira", "extra-0", "extra-1"].entries()) {
    expect((await box(id)).x).toBeCloseTo(positions[index]!.x, 0);
    expect((await box(id)).y).toBeCloseTo(positions[index]!.y, 0);
  }
  await page.evaluate(() => (window as any).syncPortraits());
  await expect(page.locator("[data-deeprole-choices-host]")).toHaveCount(1);
  expect(await layer.evaluate(node => node === (window as any).portraitLayer)).toBe(true);
  await expect(layer.locator(".dr-cast-widget")).toHaveCount(4);
  await page.setViewportSize({ width: 1500, height: 950 });
  await expect.poll(async () => (await box("hero")).x).toBeGreaterThan(0);
});
