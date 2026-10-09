import { expect, it } from "vitest";
import { clampCastPopup, dockCastPopup } from "../src/core/cast-popup";
const anchor = { left: 270, right: 494, top: 282, bottom: 704 }, size = { width: 272, height: 196 };
it("docks to the panel right, aligned at its top", () => {
  expect(dockCastPopup(anchor, size, { width: 1100, height: 1000 })).toEqual({ x: 504, y: 282 });
});
it("uses the left edge when the right has no room", () => {
  expect(dockCastPopup({ left: 650, right: 874, top: 282, bottom: 704 }, size, { width: 900, height: 1000 })).toEqual({ x: 368, y: 282 });
});
it("falls below the panel on a narrow page, keeping the controls on screen", () => {
  expect(dockCastPopup({ left: 8, right: 232, top: 100, bottom: 300 }, size, { width: 320, height: 720 })).toEqual({ x: 8, y: 310 });
});
it("clamps manual dragging and a shrinking viewport", () => {
  expect(clampCastPopup({ x: 2000, y: -100 }, size, { width: 800, height: 600 })).toEqual({ x: 520, y: 8 });
  expect(clampCastPopup({ x: 500, y: 500 }, { width: 304, height: 440 }, { width: 320, height: 456 })).toEqual({ x: 8, y: 8 });
});
