import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { GripHorizontal, Layers, Minus, RotateCcw } from "lucide-react";
import type { Locale } from "../../core/types";
import { nearestWidgetSpace, WIDGET_GAP, type WidgetRect } from "../../core/widget-spacing";

const ids = ["meter", "memory", "characters", "scene", "choices", "notices"] as const;
type Id = typeof ids[number];
type Point = { x: number; y: number };
export interface WidgetLayout { positions: Partial<Record<Id | "dock", Point>>; minimized: Id[]; together: boolean }
export const WIDGET_LAYOUT_KEY = "deeprole.widgetLayout.v1";
const empty = (): WidgetLayout => ({ positions: {}, minimized: [], together: false });
export function parseWidgetLayout(value: unknown): WidgetLayout {
  const result = empty();
  if (!value || typeof value !== "object") return result;
  const v = value as Partial<WidgetLayout>;
  result.together = v.together === true;
  result.minimized = Array.isArray(v.minimized) ? ids.filter(id => v.minimized!.includes(id)) : [];
  for (const id of [...ids, "dock"] as const) {
    const p = v.positions?.[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) result.positions[id] = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
  }
  return result;
}
const copy = {
  ru: { move: "Переместить", all: "Переместить все панели", together: "Вместе", mode: "Перемещать панели вместе", minimize: "Свернуть", restore: "Развернуть", reset: "Сбросить расположение панелей", keys: "Перетаскивайте или используйте стрелки. Shift — шаг больше, Esc — отмена.", failed: "Не удалось сохранить расположение." },
  en: { move: "Move", all: "Move all panels", together: "Together", mode: "Move panels together", minimize: "Minimize", restore: "Restore", reset: "Reset panel layout", keys: "Drag or use arrow keys. Shift for larger steps, Esc to cancel.", failed: "Couldn’t save the layout." },
};
interface TileProps { id: Id; title: string; icon: ReactNode; children: ReactNode }
export function WidgetTile({ children }: TileProps) { return <>{children}</>; }

/** UI-only positioning. No world, portrait, or memory data is stored here. */
export function WidgetDeck({ children, locale, saved, onSave }: { children: ReactNode; locale: Locale; saved?: WidgetLayout; onSave?: (layout: WidgetLayout) => Promise<void> }) {
  const t = copy[locale];
  const tiles = Children.toArray(children).filter(isValidElement<TileProps>).map(child => child.props);
  const [layout, setLayout] = useState(() => parseWidgetLayout(saved));
  const current = useRef(layout); current.current = layout;
  const [error, setError] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [, resized] = useState(0);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const dock = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: string; pointer: number; x: number; y: number; before: WidgetLayout; frozen: WidgetLayout; rects: Map<string, DOMRect>; all: boolean; moved: boolean } | null>(null);
  const saveId = useRef(0);
  // Repair legacy overlaps and size changes locally; a later user move persists
  // the repaired geometry. If no packing fits, use a scrollable, non-overlapping stack.
  useLayoutEffect(() => {
    if (gesture.current || !dock.current) return;
    const nodes = [["dock", dock.current], ...tiles.filter(tile => !layout.minimized.includes(tile.id)).map(tile => [tile.id, refs.current.get(tile.id)] as const)] as const;
    const placed: WidgetRect[] = []; const next = structuredClone(layout); let changed = false, stackY = WIDGET_GAP;
    for (const [id, node] of nodes) {
      if (!node) continue;
      const rect = node.getBoundingClientRect(); const saved = layout.positions[id as Id | "dock"];
      const wanted = { x: overflow ? saved ? saved.x * innerWidth : WIDGET_GAP : rect.x, y: overflow ? saved ? saved.y * innerHeight : stackY : rect.y, width: rect.width, height: rect.height };
      stackY += rect.height + WIDGET_GAP;
      const safe = nearestWidgetSpace(wanted, placed, { width: innerWidth, height: innerHeight });
      if (!safe) { if (!overflow) setOverflow(true); return; }
      placed.push(safe);
      if (overflow || Math.abs(safe.x - rect.x) > .5 || Math.abs(safe.y - rect.y) > .5) {
        next.positions[id as Id | "dock"] = { x: safe.x / innerWidth, y: safe.y / innerHeight }; changed = true;
      }
    }
    if (overflow) setOverflow(false);
    if (changed) { current.current = next; setLayout(next); }
  });
  useEffect(() => { if (!gesture.current) setLayout(parseWidgetLayout(saved)); }, [saved]);
  useLayoutEffect(() => {
    const update = () => resized(n => n + 1);
    const observer = new ResizeObserver(update);
    for (const element of refs.current.values()) observer.observe(element);
    if (dock.current) observer.observe(dock.current);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [tiles.map(tile => tile.id).join(","), layout.minimized.join(",")]);
  const commit = (value: WidgetLayout, rollback = current.current) => {
    current.current = value; setLayout(value); setError(false); const id = ++saveId.current;
    void onSave?.(value).catch(() => { if (id === saveId.current) { setLayout(rollback); setError(true); } });
  };
  const style = (id: string) => {
    if (overflow) return undefined;
    const point = layout.positions[id as Id];
    if (!point) return undefined;
    const node = id === "dock" ? dock.current : refs.current.get(id);
    return { position: "fixed" as const, left: Math.max(WIDGET_GAP, Math.min(point.x * window.innerWidth, window.innerWidth - (node?.offsetWidth ?? 120) - WIDGET_GAP)), top: Math.max(WIDGET_GAP, Math.min(point.y * window.innerHeight, window.innerHeight - (node?.offsetHeight ?? 40) - WIDGET_GAP)) };
  };
  const snapshot = () => {
    const rects = new Map<string, DOMRect>();
    for (const tile of tiles) if (!layout.minimized.includes(tile.id)) { const rect = refs.current.get(tile.id)?.getBoundingClientRect(); if (rect) rects.set(tile.id, rect); }
    if (dock.current) rects.set("dock", dock.current.getBoundingClientRect());
    const frozen = structuredClone(current.current);
    for (const [id, rect] of rects) frozen.positions[id as Id] = { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight };
    return { frozen, rects };
  };
  const shift = (frozen: WidgetLayout, rects: Map<string, DOMRect>, id: string, all: boolean, dx: number, dy: number) => {
    if (overflow) return frozen;
    const moving = [...rects].filter(([key]) => all || key === id).map(([, rect]) => rect);
    if (!moving.length) return frozen;
    dx = Math.max(WIDGET_GAP - Math.min(...moving.map(r => r.left)), Math.min(dx, window.innerWidth - WIDGET_GAP - Math.max(...moving.map(r => r.right))));
    dy = Math.max(WIDGET_GAP - Math.min(...moving.map(r => r.top)), Math.min(dy, window.innerHeight - WIDGET_GAP - Math.max(...moving.map(r => r.bottom))));
    if (!all) {
      const source = rects.get(id)!;
      const safe = nearestWidgetSpace({ x: source.x + dx, y: source.y + dy, width: source.width, height: source.height }, [...rects].filter(([key]) => key !== id).map(([, r]) => ({ x: r.x, y: r.y, width: r.width, height: r.height })), { width: innerWidth, height: innerHeight });
      if (!safe) return frozen;
      dx = safe.x - source.x; dy = safe.y - source.y;
    }
    const next = structuredClone(frozen);
    for (const [key, p] of Object.entries(next.positions)) if (all || key === id) next.positions[key as Id] = { x: Math.max(0, Math.min(1, p.x + dx / window.innerWidth)), y: Math.max(0, Math.min(1, p.y + dy / window.innerHeight)) };
    return next;
  };
  const start = (id: string, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    gesture.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, before: current.current, ...snapshot(), all: id === "dock" || current.current.together, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); event.preventDefault();
  };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
    gesture.current = null;
    if (cancel) { setLayout(active.before); current.current = active.before; }
    else if (active.moved) commit(current.current, active.before);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handle = (id: string, title: string) => <button type="button" className="dr-widget-move" aria-label={title} title={`${title}. ${t.keys}`} onPointerDown={event => start(id, event)} onPointerMove={event => {
    const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true; const next = shift(active.frozen, active.rects, active.id, active.all, dx, dy); current.current = next; setLayout(next);
  }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onKeyDown={event => {
    if (event.key === "Escape" && gesture.current) { setLayout(gesture.current.before); current.current = gesture.current.before; gesture.current = null; event.preventDefault(); return; }
    const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const delta = directions[event.key]; if (!delta) return; event.preventDefault(); const { frozen, rects } = snapshot(); const step = event.shiftKey ? 32 : 8;
    commit(shift(frozen, rects, id, id === "dock" || current.current.together, delta.x * step, delta.y * step));
  }}><GripHorizontal size={14} /></button>;
  return <div className="dr-widget-deck" data-overflow={overflow || undefined}>
    <div className="dr-widget-dock" ref={dock} style={style("dock")}>
      <div className="dr-widget-deck-tools">{handle("dock", t.all)}<button type="button" title={t.mode} aria-label={t.mode} aria-pressed={layout.together} onClick={() => commit({ ...layout, together: !layout.together })}><Layers size={13} /><span>{t.together}</span></button><button type="button" title={t.reset} aria-label={t.reset} onClick={() => commit(empty())}><RotateCcw size={13} /></button></div>
      <div className="dr-widget-minimized">{tiles.filter(tile => layout.minimized.includes(tile.id)).map(tile => <button type="button" key={tile.id} data-restore-widget={tile.id} aria-expanded={false} title={`${t.restore}: ${tile.title}`} aria-label={`${t.restore}: ${tile.title}`} onClick={() => { commit({ ...layout, minimized: layout.minimized.filter(id => id !== tile.id) }); requestAnimationFrame(() => refs.current.get(tile.id)?.querySelector<HTMLButtonElement>("button")?.focus()); }}>{tile.icon}</button>)}</div>
      {error && <small role="alert">{t.failed}</small>}
    </div>
    {tiles.map(tile => <div key={tile.id} ref={node => { if (node) refs.current.set(tile.id, node); else refs.current.delete(tile.id); }} data-widget={tile.id} className="dr-widget-tile" hidden={layout.minimized.includes(tile.id)} style={style(tile.id)}>
      <div className="dr-widget-tools">{handle(tile.id, `${t.move}: ${tile.title}`)}<button type="button" title={`${t.minimize}: ${tile.title}`} aria-label={`${t.minimize}: ${tile.title}`} onClick={() => { commit({ ...layout, minimized: [...layout.minimized, tile.id] }); requestAnimationFrame(() => dock.current?.querySelector<HTMLButtonElement>(`[data-restore-widget="${tile.id}"]`)?.focus()); }}><Minus size={14} /></button></div>
      {tile.children}
    </div>)}
  </div>;
}
