export const MAX_IMAGE_ZOOM = 128;
export function fitImageZoom(width: number, height: number, viewportWidth: number, viewportHeight: number): number {
  return Math.min(1, Math.max(1, viewportWidth - 24) / Math.max(1, width), Math.max(1, viewportHeight - 24) / Math.max(1, height));
}
export function clampImageZoom(value: number, minimum: number): number {
  return Math.min(MAX_IMAGE_ZOOM, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}
/** Keep the same source pixel under the cursor when zooming, including centered fit images. */
export function anchoredZoomScroll(scroll: number, cursor: number, natural: number, viewport: number, before: number, after: number): number {
  const offset = (scale: number) => Math.max(0, (viewport - natural * scale) / 2);
  const pixel = (scroll + cursor - offset(before)) / before;
  return Math.max(0, pixel * after + offset(after) - cursor);
}
