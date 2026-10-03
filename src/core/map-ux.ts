import { loreBranchEntryIds, type LoreGraph, type LoreNode } from "./lore-map";
import type { MemoryEntry } from "./types";

export type MapPoint = { x: number; y: number };
export function mapSelectionBox(start: MapPoint, end: MapPoint) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}
/** Windows-style frame: any visible card touched by the frame is selected. */
export function mapBoxSelection(graph: LoreGraph, visible: Set<string>, start: MapPoint, end: MapPoint): string[] {
  const box = mapSelectionBox(start, end);
  return graph.nodes.filter((node) => visible.has(node.id) && node.x + 135 >= box.x && node.x - 135 <= box.x + box.width && node.y + (node.kind === "world" ? 80 : 45) >= box.y && node.y - (node.kind === "world" ? 80 : 45) <= box.y + box.height).map((node) => node.id);
}
/** Keep spacing intact when a group reaches an edge of the editable world. */
export function mapTranslate(points: Record<string, MapPoint>, dx: number, dy: number): Record<string, MapPoint> {
  const all = Object.values(points); if (!all.length) return {};
  const x = Math.max(-Math.min(...all.map((p) => p.x)), Math.min(12000 - Math.max(...all.map((p) => p.x)), dx));
  const y = Math.max(-Math.min(...all.map((p) => p.y)), Math.min(12000 - Math.max(...all.map((p) => p.y)), dy));
  return Object.fromEntries(Object.entries(points).map(([id, p]) => [id, { x: p.x + x, y: p.y + y }]));
}

/** A folder is not a story fact. Resolve concrete entries before connecting it. */
export function mapConnectionEntries(graph: LoreGraph, id: string, entries: MemoryEntry[] = []): string[] {
  const node = graph.nodes.find((node) => node.id === id);
  if (!node) return [];
  if (node.kind === "entry") return [node.recordId];
  if (node.kind === "book") return entries.filter((entry) => entry.bookId === node.recordId).map((entry) => entry.id);
  const descendants = loreBranchEntryIds(graph, id);
  const profileEntries = ["character", "location", "group"].includes(node.kind) ? graph.edges.filter((edge) => edge.kind === "entity" && edge.from === id).map((edge) => graph.nodes.find((target) => target.id === edge.to)).filter((target) => target?.kind === "entry").map((target) => target!.recordId) : [];
  return [...new Set([...descendants, ...profileEntries])];
}

/** Only the actual displayed card is a drop target, not an invisible padded halo. */
export function mapDropTarget(graph: LoreGraph, visible: Set<string>, source: string, point: { x: number; y: number }): LoreNode | undefined {
  return graph.nodes.filter((node) => node.id !== source && visible.has(node.id) && Math.abs(point.x - node.x) <= 135 && Math.abs(point.y - node.y) <= (node.kind === "world" ? 80 : 45))
    .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
}

/** Screen-space cards stay readable at every map zoom and inside the viewport. */
export function mapPopover(anchor: { x: number; y: number; halfWidth: number; halfHeight?: number }, viewport: { width: number; height: number }, preferred = { width: 370, height: 540 }) {
  const pad = 12;
  const width = Math.max(0, Math.min(preferred.width, viewport.width - pad * 2));
  const height = Math.max(0, Math.min(preferred.height, viewport.height - pad * 2));
  const right = anchor.x + anchor.halfWidth + 16;
  const left = anchor.x - anchor.halfWidth - width - 16;
  const x = right + width <= viewport.width - pad ? right : left >= pad ? left : right;
  const placedX = Math.max(pad, Math.min(x, viewport.width - width - pad));
  let top = Math.max(pad, Math.min(anchor.y - 45, viewport.height - height - pad));
  let maxHeight = Math.max(0, viewport.height - top - pad);
  const halfHeight = anchor.halfHeight ?? anchor.halfWidth / 3;
  // In a narrow window neither side may fit. Keep the clicked card uncovered,
  // so its second click can still deliver the branch's double-click action.
  if (placedX < anchor.x + anchor.halfWidth && placedX + width > anchor.x - anchor.halfWidth && top < anchor.y + halfHeight && top + maxHeight > anchor.y - halfHeight) {
    const below = viewport.height - anchor.y - halfHeight - 16 - pad;
    const above = anchor.y - halfHeight - 16 - pad;
    if (Math.max(below, above) > 0) {
      if (below >= above) { top = anchor.y + halfHeight + 16; maxHeight = below; }
      else { top = Math.max(pad, anchor.y - halfHeight - 16 - height); maxHeight = anchor.y - halfHeight - top - 16; }
    }
  }
  return { left: placedX, top, width, maxHeight };
}
