import { expect, test } from "vitest";
import { fitPinnedScene, fitScene } from "../src/core/adaptive-layout";

test("fits portraits and options in the remaining page lane", () => {
  for (const width of [320, 640, 900, 1200, 1600, 2200]) for (const count of [0, 1, 2, 4, 40]) {
    const left = width > 1000 ? 284 : 8;
    const fit = fitScene(width, left, width / 2, count);
    expect(fit.x).toBeGreaterThanOrEqual(left);
    expect(fit.x + fit.choices).toBeLessThanOrEqual(width - 8);
    if (!fit.compact && count) {
      expect(fit.x - fit.portrait - 24).toBeGreaterThanOrEqual(left);
      expect(fit.x + fit.choices + (count > 1 ? (count - 1) * (fit.portrait + 6) + 18 : 0)).toBeLessThanOrEqual(width - 8);
    }
  }
});

test("pinned options keep the composer center even in an asymmetric chat lane", () => {
  for (const width of [320, 640, 900, 1200, 1600, 2200]) for (const count of [0, 1, 2, 4, 40]) for (const fraction of [.3, .5, .65]) {
    const center = width * fraction, left = width > 1000 ? 284 : 8;
    const fit = fitPinnedScene(width, left, center, count, Math.min(740, width - 40));
    expect(fit.x + fit.choices / 2).toBeCloseTo(center, 6);
    expect(fit.choices).toBeLessThanOrEqual(Math.min(720, width - 40));
    expect(fit.x).toBeGreaterThanOrEqual(8);
    expect(fit.x + fit.choices).toBeLessThanOrEqual(width - 8);
    if (!fit.compact && count) {
      expect(fit.x - fit.portrait - 24).toBeGreaterThanOrEqual(left);
      expect(fit.x + fit.choices + (count > 1 ? (count - 1) * (fit.portrait + 6) + 18 : 0)).toBeLessThanOrEqual(width - 8);
    }
  }
});

test("pinned portraits become a strip rather than pushing the card away from the input", () => {
  const fit = fitPinnedScene(1500, 284, 390, 4, 740);
  expect(fit.compact).toBe(true);
  expect(fit.x + fit.choices / 2).toBe(390);
  expect(fit.choices).toBe(720);
});
