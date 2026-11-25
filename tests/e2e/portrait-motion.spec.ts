import { expect, test, type Page } from "@playwright/test";

const mira = '.dr-cast-widget[data-character-id="mira"]';
const current = "img[data-current]";

async function capturePortraitMotion(page: Page) {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    (window as any).motionLog = [];
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (animation.id.startsWith("deeprole-portrait-")) {
        animation.pause();
        animation.currentTime = 0;
        (window as any).motionLog.push(animation);
      }
      return animation;
    };
  });
}

async function configurePhotos(page: Page, delay = false) {
  return page.evaluate(delay => {
    const fixture = window as any;
    const cast = fixture.getCast();
    const first = fixture.storeFixturePortrait("a");
    const next = fixture.storeFixturePortrait("b");
    if (delay) {
      fixture.pendingFixturePortraits = new Map([[next, new Promise<void>(resolve => { fixture.finishFixturePortrait = resolve; })]]);
    }
    const entities = cast.entities.map((person: any) => person.id === "mira"
      ? { ...person, characterSheet: { ...person.characterSheet, sprites: { happy: first, talking: next, neutral: first } } }
      : person);
    fixture.setCast({ entities });
    return { first, next };
  }, delay);
}

async function nextAction(page: Page) {
  await page.evaluate(() => {
    const fixture = window as any;
    const scene = fixture.getCast().scene;
    fixture.setCast({
      scene: { ...scene, states: { ...scene.states, mira: { ...scene.states.mira, action: "talking", stats: [{ label: "Energy", value: "Tired" }] } } },
    });
  });
}

for (const [locale, width] of [["ru", 320], ["en", 1280]] as const) {
  test(`portrait and changed captions fade in ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await capturePortraitMotion(page);
    await page.goto(`/tests/fixtures/characters.html?saved-portraits&locale=${locale}`);
    const card = page.locator(mira);
    const photo = card.locator(".dr-cast-photo");
    const image = photo.locator(current);
    await expect(image).toHaveCSS("opacity", "0");
    const before = await photo.boundingBox();
    expect(before?.height).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).motionLog.forEach((animation: Animation) => animation.finish()));
    await expect(image).toHaveCSS("opacity", "1");

    const { first, next } = await configurePhotos(page, true);
    await expect(image).toHaveAttribute("data-dr-photo-source", first);
    await page.evaluate(() => {
      const fixture = window as any;
      fixture.motionLog.forEach((animation: Animation) => animation.finish());
      fixture.motionLog.length = 0;
    });
    await expect(photo.locator("img")).toHaveCount(1);
    await nextAction(page);
    const pending = photo.locator("img[data-pending]");
    await expect(pending).toHaveAttribute("data-dr-photo-source", next);
    await expect(pending).toHaveCSS("visibility", "hidden");
    await expect(image).toHaveAttribute("data-dr-photo-source", first);
    await expect(image).toHaveCSS("opacity", "1");
    await expect(card.locator("small")).toHaveText(locale === "ru" ? "Разговаривает" : "Talking");
    await expect(card.locator("small")).toHaveCSS("opacity", "0.25");
    await expect(card.locator(".dr-cast-highlights > span")).toHaveText("Energy: Tired");
    expect(await photo.evaluate(el => [el.clientWidth, el.clientHeight])).toEqual([Math.round(before!.width), Math.round(before!.height)]);

    await page.evaluate(() => {
      const fixture = window as any;
      fixture.syncPortraits();
      fixture.syncPortraits();
      fixture.finishFixturePortrait();
    });
    await expect(image).toHaveAttribute("data-dr-photo-source", next);
    await expect(image).toHaveCSS("opacity", "0");
    const outgoing = photo.locator(`img[data-dr-photo-source="${first}"]`);
    await expect(outgoing).toHaveCSS("opacity", "1");
    await expect(outgoing).toHaveCSS("visibility", "visible");
    const frames = await page.evaluate(() => (window as any).motionLog.map((animation: Animation) => {
      const target = (animation.effect as KeyframeEffect).target!;
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
      return { target: target.tagName, opacity: Number(getComputedStyle(target).opacity) };
    }));
    expect(frames.map((frame: { target: string }) => frame.target)).toEqual(["SMALL", "SPAN", "IMG"]);
    for (const frame of frames) {
      expect(frame.opacity).toBeGreaterThan(0.25);
      expect(frame.opacity).toBeLessThan(1);
    }
    await page.evaluate(() => (window as any).motionLog.forEach((animation: Animation) => animation.finish()));
    await expect(outgoing).toHaveCount(0);
    await expect(image).toHaveCSS("opacity", "1");
  });
}

for (const option of ["setting", "system"]) {
  test(`portrait fades respect the ${option} motion preference`, async ({ page }) => {
    if (option === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    await capturePortraitMotion(page);
    await page.goto(`/tests/fixtures/characters.html?saved-portraits${option === "setting" ? "&animations=off" : ""}`);
    const card = page.locator(mira);
    const image = card.locator(current);
    await expect(image).toHaveCSS("opacity", "1");
    const { first, next } = await configurePhotos(page, true);
    await expect(image).toHaveAttribute("data-dr-photo-source", first);
    await nextAction(page);
    await expect(card.locator("img[data-pending]")).toHaveAttribute("data-dr-photo-source", next);
    await expect(image).toHaveAttribute("data-dr-photo-source", first);
    await page.evaluate(() => (window as any).finishFixturePortrait());
    await expect(image).toHaveAttribute("data-dr-photo-source", next);
    await expect(card.locator("img")).toHaveCount(1);
    await expect(card.locator("small")).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => (window as any).motionLog.length)).toBe(0);
  });
}

test("a missing or superseded pose keeps the usable portrait", async ({ page }) => {
  await page.goto("/tests/fixtures/characters.html?saved-portraits");
  const card = page.locator(mira);
  const image = card.locator(current);
  await expect(image).toBeVisible();
  const { first, next } = await configurePhotos(page, true);
  await expect(image).toHaveAttribute("data-dr-photo-source", first);
  await nextAction(page);
  await expect(card.locator("img[data-pending]")).toHaveAttribute("data-dr-photo-source", next);
  await page.evaluate(() => {
    const fixture = window as any;
    const cast = fixture.getCast();
    const unavailable = `deeprole-photo:${"c".repeat(64)}:1:a:a`;
    const entities = cast.entities.map((person: any) => person.id === "mira"
      ? { ...person, characterSheet: { ...person.characterSheet, sprites: { ...person.characterSheet.sprites, talking: unavailable } } }
      : person);
    fixture.setCast({ entities });
  });
  await expect(card.locator("img")).toHaveCount(1);
  await expect(image).toHaveAttribute("data-dr-photo-source", first);
  await page.evaluate(() => (window as any).finishFixturePortrait());
  await expect(image).toHaveAttribute("data-dr-photo-source", first);
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
});
