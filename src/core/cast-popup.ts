export interface CastPopupPoint { x: number; y: number }
export interface CastPopupRect { left: number; right: number; top: number; bottom: number }
const EDGE = 8, GAP = 10;
export function clampCastPopup(point: CastPopupPoint, size: { width: number; height: number }, viewport: { width: number; height: number }): CastPopupPoint {
  return { x: Math.max(EDGE, Math.min(point.x, viewport.width - size.width - EDGE)), y: Math.max(EDGE, Math.min(point.y, viewport.height - size.height - EDGE)) };
}
/** Prefer the panel's right/top edge, not the wand's inline position. */
export function dockCastPopup(anchor: CastPopupRect, size: { width: number; height: number }, viewport: { width: number; height: number }): CastPopupPoint {
  const x = anchor.right + GAP + size.width <= viewport.width - EDGE ? anchor.right + GAP
    : anchor.left - GAP - size.width >= EDGE ? anchor.left - GAP - size.width : anchor.left;
  const y = x === anchor.left ? anchor.bottom + GAP : anchor.top;
  return clampCastPopup({ x, y }, size, viewport);
}
