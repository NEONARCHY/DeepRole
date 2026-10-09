import { expect, it } from "vitest";
import { anchoredZoomScroll, clampImageZoom, fitImageZoom, MAX_IMAGE_ZOOM } from "../src/core/image-zoom";
it("fits both dimensions without enlarging a small source", () => {
  expect(fitImageZoom(1920,1080,984,564)).toBe(.5);
  expect(fitImageZoom(120,160,1000,800)).toBe(1);
  expect(fitImageZoom(1080,1920,400,984)).toBeCloseTo(376/1080);
});
it("has a stable fit minimum and finite extreme maximum", () => {
  expect(clampImageZoom(-10,.3)).toBe(.3);expect(clampImageZoom(999,.3)).toBe(MAX_IMAGE_ZOOM);
  expect(clampImageZoom(NaN,.3)).toBe(.3);expect(clampImageZoom(.5,.3)).toBe(.5);
});
it("anchors the cursor to the same source pixel through centered and scrollable stages", () => {
  expect(anchoredZoomScroll(0,500,1200,1000,.5,1)).toBe(100);
  expect(anchoredZoomScroll(100,500,1200,1000,1,.5)).toBe(0);
  expect(anchoredZoomScroll(400,100,1200,1000,2,4)).toBe(900);
});
