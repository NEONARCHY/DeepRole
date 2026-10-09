import type { PortraitLayout, PortraitPose } from "./types";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const portraitKey = (value: string) => !!value && value.length <= 160 && !["__proto__", "prototype", "constructor"].includes(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
/** Defensive storage bound, not the visible size limit; cards fit their viewport. */
export const PORTRAIT_MAX_WIDTH = 8192;
export function validPortraitPose(value: unknown): value is PortraitPose {
  return object(value) && (value.space === undefined || value.space === "viewport") && (value.dock === undefined || value.dock === "left" || value.dock === "right") && finite(value.x, 0, 1)
    && (value.manualSize === undefined || typeof value.manualSize === "boolean")
    && finite(value.y, 0, value.space === "viewport" ? 1 : 1200) && finite(value.width, 96, PORTRAIT_MAX_WIDTH);
}
export function validPortraitLayout(value: unknown): value is PortraitLayout {
  return object(value) && finite(value.resetAt, 0, Number.MAX_SAFE_INTEGER) && object(value.positions) && Object.keys(value.positions).length <= 40
    && Object.entries(value.positions).every(([id, pose]) => portraitKey(id) && validPortraitPose(pose));
}
export function validPortraitLayouts(value: unknown): boolean {
  return object(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([world, layout]) => portraitKey(world) && validPortraitLayout(layout));
}
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
/** Keep the requested size in storage while fitting the visible viewport. Legacy poses remain readable. */
export function portraitBounds(pose: PortraitPose, available: number, height?: number, captionHeight = 140) {
  const width = Math.min(pose.width, Math.max(1, available), height === undefined ? Infinity : Math.max(96, (height - captionHeight) * .75));
  return { x: pose.x * Math.max(0, available - width), y: pose.space === "viewport" && height !== undefined ? pose.y * height : pose.y, width };
}
export function portraitPose(x: number, y: number, width: number, available: number, height?: number): PortraitPose {
  const requested = clamp(width, 96, PORTRAIT_MAX_WIDTH);
  const rendered = Math.min(requested, available);
  return { x: clamp(x / Math.max(1, available - rendered), 0, 1), y: height === undefined ? clamp(y, 0, 1200) : clamp(y / Math.max(1, height), 0, 1), width: requested, ...(height === undefined ? {} : { space: "viewport" as const }) };
}
