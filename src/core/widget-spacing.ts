export const WIDGET_GAP = 8;
export interface WidgetRect { x: number; y: number; width: number; height: number }
export const widgetsOverlap = (a: WidgetRect, b: WidgetRect, gap = WIDGET_GAP) => a.x < b.x + b.width + gap - .1 && a.x + a.width + gap > b.x + .1 && a.y < b.y + b.height + gap - .1 && a.y + a.height + gap > b.y + .1;

/** Find the closest free rectangle, including space for hover-only controls. */
export function nearestWidgetSpace(wanted: WidgetRect, obstacles: WidgetRect[], viewport: { width: number; height: number }): WidgetRect | null {
  const maxX = viewport.width - WIDGET_GAP - wanted.width, maxY = viewport.height - WIDGET_GAP - wanted.height;
  if (maxX < WIDGET_GAP || maxY < WIDGET_GAP) return null;
  const clampX = (x: number) => Math.max(WIDGET_GAP, Math.min(maxX, x));
  const clampY = (y: number) => Math.max(WIDGET_GAP, Math.min(maxY, y));
  const x = clampX(wanted.x), y = clampY(wanted.y);
  const xs = [...new Set([x, WIDGET_GAP, maxX, ...obstacles.flatMap(r => [r.x - wanted.width - WIDGET_GAP, r.x + r.width + WIDGET_GAP])].map(clampX))];
  const ys = [...new Set([y, WIDGET_GAP, maxY, ...obstacles.flatMap(r => [r.y - wanted.height - WIDGET_GAP, r.y + r.height + WIDGET_GAP])].map(clampY))];
  let best: WidgetRect | null = null, distance = Infinity;
  for (const left of xs) for (const top of ys) {
    const candidate = { ...wanted, x: left, y: top }, score = (left - x) ** 2 + (top - y) ** 2;
    if (score < distance && !obstacles.some(r => widgetsOverlap(candidate, r))) { best = candidate; distance = score; }
  }
  return best;
}
