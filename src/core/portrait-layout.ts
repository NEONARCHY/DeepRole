import type { PortraitLayout, PortraitPose } from "./types";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const portraitKey = (value: string) => !!value && value.length <= 160 && !["__proto__", "prototype", "constructor"].includes(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export function validPortraitPose(value: unknown): value is PortraitPose {
  return object(value) && finite(value.x, 0, 1) && finite(value.y, 0, 1200) && finite(value.width, 96, 360);
}
export function validPortraitLayout(value: unknown): value is PortraitLayout {
  return object(value) && finite(value.resetAt, 0, Number.MAX_SAFE_INTEGER) && object(value.positions) && Object.keys(value.positions).length <= 40
    && Object.entries(value.positions).every(([id, pose]) => portraitKey(id) && validPortraitPose(pose));
}
export function validPortraitLayouts(value: unknown): boolean {
  return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([world, layout]) => portraitKey(world) && validPortraitLayout(layout));
}
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
/** Keep the user's requested width, but render safely inside a narrower chat. */
export function portraitBounds(pose: PortraitPose, available: number) {
  const width = Math.min(pose.width, Math.max(96, available));
  return { x: pose.x * Math.max(0, available - width), y: pose.y, width };
}
export function portraitPose(x: number, y: number, width: number, available: number): PortraitPose {
  const requested = clamp(width, 96, 360);
  const rendered = Math.min(requested, available);
  return { x: clamp(x / Math.max(1, available - rendered), 0, 1), y: clamp(y, 0, 1200), width: requested };
}
