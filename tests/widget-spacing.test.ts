import { expect, it } from "vitest";
import { nearestWidgetSpace, widgetsOverlap } from "../src/core/widget-spacing";
const viewport = { width: 1280, height: 900 };
it("leaves free positions unchanged and keeps an eight-pixel gap", () => {
  const obstacle = { x: 100, y: 100, width: 200, height: 80 };
  const wanted = { x: 280, y: 100, width: 120, height: 40 };
  const next = nearestWidgetSpace(wanted, [obstacle], viewport)!;
  expect(next.x).toBe(308); expect(widgetsOverlap(next, obstacle)).toBe(false);
  expect(nearestWidgetSpace(next, [obstacle], viewport)).toEqual(next);
});
it("accounts for every obstacle and viewport edge without forcing an overlap", () => {
  const obstacles = [{ x: 8, y: 8, width: 180, height: 60 }, { x: 8, y: 76, width: 180, height: 60 }];
  const next = nearestWidgetSpace({ x: 16, y: 16, width: 80, height: 40 }, obstacles, viewport)!;
  expect(obstacles.some(rect => widgetsOverlap(next, rect))).toBe(false);
  expect(nearestWidgetSpace({ x: 0, y: 0, width: 304, height: 584 }, [{ x: 8, y: 8, width: 20, height: 20 }], { width: 320, height: 600 })).toBeNull();
  expect(nearestWidgetSpace({ x: 0, y: 0, width: 400, height: 20 }, [], { width: 320, height: 600 })).toBeNull();
});
