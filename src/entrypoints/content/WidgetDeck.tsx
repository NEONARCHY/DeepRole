import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, GripHorizontal, Layers, Minus, RotateCcw, ScanLine, Scaling } from "lucide-react";
import { panelWidth as normalizePanelWidth, panelWidthCopy } from "../../core/panel-width";
import { PanelWidthControl } from "../shared/PanelWidthControl";
import { adaptiveText } from "../../core/adaptive-layout";
import type { Locale } from "../../core/types";
import { nearestWidgetSpace, WIDGET_GAP, type WidgetRect } from "../../core/widget-spacing";

const ids = ["meter", "memory", "characters", "scene", "choices", "notices"] as const;
type Id = typeof ids[number];
type Point = { x: number; y: number };
export interface WidgetLayout { positions: Partial<Record<Id | "dock", Point>>; minimized: Id[]; together: boolean; anchorX?: number }
export const WIDGET_LAYOUT_KEY = "deeprole.widgetLayout.v1";
const empty = (): WidgetLayout => ({ positions: {}, minimized: [], together: false });
export function parseWidgetLayout(value: unknown): WidgetLayout {
  const result = empty();
  if (!value || typeof value !== "object") return result;
  const v = value as Partial<WidgetLayout>;
  if (Number.isFinite(v.anchorX)) result.anchorX = Math.max(0, Math.min(1, v.anchorX!));
  result.together = v.together === true;
  result.minimized = Array.isArray(v.minimized) ? ids.filter(id => v.minimized!.includes(id)) : [];
  for (const id of [...ids, "dock"] as const) {
    const p = v.positions?.[id];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) result.positions[id] = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
  }
  return result;
}
const copy = {
  ru: { move: "Переместить", all: "Переместить все панели", together: "Вместе", mode: "Перемещать панели вместе", portraitsOn: "Скрыть портреты персонажей", portraitsOff: "Показать портреты персонажей", minimize: "Свернуть", restore: "Развернуть", reset: "Сбросить расположение панелей", keys: "Перетаскивайте или используйте стрелки. Shift — шаг больше, Esc — отмена.", failed: "Не удалось сохранить расположение." },
  en: { move: "Move", all: "Move all panels", together: "Together", mode: "Move panels together", portraitsOn: "Hide character portraits", portraitsOff: "Show character portraits", minimize: "Minimize", restore: "Restore", reset: "Reset panel layout", keys: "Drag or use arrow keys. Shift for larger steps, Esc to cancel.", failed: "Couldn’t save the layout." },
};
interface TileProps { id: Id; title: string; icon: ReactNode; children: ReactNode }
export function WidgetTile({ children }: TileProps) { return <>{children}</>; }

/** UI-only positioning. No world, portrait, or memory data is stored here. */
export function WidgetDeck({ children, locale, saved, onSave, portraitsVisible, onTogglePortraits, panelWidth, onPanelWidthChange, adaptive = false, onToggleAdaptive, minimumLeft = WIDGET_GAP, minimumTop = WIDGET_GAP }: { children: ReactNode; locale: Locale; saved?: WidgetLayout; onSave?: (layout: WidgetLayout) => Promise<void>; portraitsVisible?: boolean; onTogglePortraits?: () => void | Promise<void>; panelWidth?: number; onPanelWidthChange?: (width: number) => Promise<void>; adaptive?: boolean; onToggleAdaptive?: () => void | Promise<void>; minimumLeft?: number; minimumTop?: number }) {
  const t = copy[locale];
  const tiles = Children.toArray(children).filter(isValidElement<TileProps>).map(child => child.props);
  const [layout, setLayout] = useState(() => parseWidgetLayout(saved));
  // Legacy coordinates retain their initial appearance; new saves also remember
  // the native sidebar boundary. Automatic sidebar movement never writes storage.
  const legacyAnchor = useRef(minimumLeft / window.innerWidth);
  const anchorShift = minimumLeft - (layout.anchorX ?? legacyAnchor.current) * window.innerWidth;
  const current = useRef(layout); current.current = layout;
  const [error, setError] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [compactOpen, setCompactOpen] = useState<Id | null>(null);
  const [widthOpen, setWidthOpen] = useState(false); const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const preferredWidth = normalizePanelWidth(previewWidth ?? panelWidth);
  const [, resized] = useState(0);
  const compact = adaptive && window.innerWidth - minimumLeft < 850;
  const refs = useRef(new Map<string, HTMLDivElement>());
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!widthOpen) return;
    const outside = (event: globalThis.PointerEvent) => { if (event.composedPath().every(node => node !== dock.current)) setWidthOpen(false); };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [widthOpen]);
  const gesture = useRef<{ id: string; pointer: number; x: number; y: number; before: WidgetLayout; frozen: WidgetLayout; rects: Map<string, DOMRect>; all: boolean; moved: boolean; captureTarget: HTMLElement } | null>(null);
  const suppressClick = useRef(false);
  const saveId = useRef(0);
  // Repair legacy overlaps and size changes locally; a later user move persists
  // the repaired geometry. If no packing fits, use a scrollable, non-overlapping stack.
  useLayoutEffect(() => {
    if (compact) { if (overflow) setOverflow(false); return; }
    if (gesture.current || !dock.current) return;
    const nodes = [["dock", dock.current], ...tiles.filter(tile => !layout.minimized.includes(tile.id)).map(tile => [tile.id, refs.current.get(tile.id)] as const)] as const;
    const placed: WidgetRect[] = []; const next = structuredClone(layout); let changed = false, stackY = WIDGET_GAP;
    for (const [id, node] of nodes) {
      if (!node) continue;
      const rect = node.getBoundingClientRect(); const saved = layout.positions[id as Id | "dock"];
      const wanted = { x: overflow ? saved ? saved.x * innerWidth + anchorShift : minimumLeft : rect.x, y: overflow ? saved ? saved.y * innerHeight : stackY : rect.y, width: rect.width, height: rect.height };
      stackY += rect.height + WIDGET_GAP;
      const safe = nearestWidgetSpace(wanted, placed, { width: innerWidth, height: innerHeight }, minimumLeft, minimumTop);
      if (!safe) { if (!overflow) setOverflow(true); return; }
      placed.push(safe);
      if (overflow || Math.abs(safe.x - rect.x) > .5 || Math.abs(safe.y - rect.y) > .5) {
        next.positions[id as Id | "dock"] = { x: (safe.x - anchorShift) / innerWidth, y: safe.y / innerHeight }; changed = true;
      }
    }
    if (overflow) setOverflow(false);
    if (changed) { current.current = next; setLayout(next); }
  });
  useEffect(() => { if (!gesture.current) setLayout(parseWidgetLayout(saved)); }, [saved, adaptive, compact]);
  useEffect(() => {
    if (!compact || !compactOpen) return;
      const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setCompactOpen(null); dock.current?.querySelector<HTMLButtonElement>(`[data-restore-widget='${compactOpen}']`)?.focus(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [compact, compactOpen]);
  useLayoutEffect(() => { window.dispatchEvent(new Event("deeprole-layout-change")); });
  useLayoutEffect(() => {
    const update = () => resized(n => n + 1);
    const observer = new ResizeObserver(update);
    for (const element of refs.current.values()) observer.observe(element);
    if (dock.current) observer.observe(dock.current);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [tiles.map(tile => tile.id).join(","), layout.minimized.join(",")]);
  const commit = (value: WidgetLayout, rollback = current.current) => {
    value = { ...value, anchorX: value.anchorX ?? legacyAnchor.current };
    current.current = value; setLayout(value); setError(false); const id = ++saveId.current;
    void onSave?.(value).catch(() => { if (id === saveId.current) { setLayout(rollback); setError(true); } });
  };
  const style = (id: string) => {
    if (compact) {
      const point = layout.positions.dock;
      const width = dock.current?.offsetWidth ?? 280;
      const left = Math.max(minimumLeft, Math.min(point ? point.x * innerWidth + anchorShift : minimumLeft, innerWidth - width - 8));
      const top = Math.max(minimumTop, Math.min(point ? point.y * innerHeight : minimumTop, innerHeight - 80));
      return id === "dock" ? { position: "fixed" as const, left, top } : { position: "fixed" as const, left, top: top + (dock.current?.offsetHeight ?? 76) + 1, maxHeight: Math.max(120, innerHeight - top - 90) };
    }
    if (overflow) return undefined;
    const point = layout.positions[id as Id];
    if (!point) return undefined;
    const node = id === "dock" ? dock.current : refs.current.get(id);
    return { position: "fixed" as const, left: Math.max(minimumLeft, Math.min(point.x * window.innerWidth + anchorShift, window.innerWidth - (node?.offsetWidth ?? 120) - WIDGET_GAP)), top: Math.max(minimumTop, Math.min(point.y * window.innerHeight, window.innerHeight - (node?.offsetHeight ?? 40) - WIDGET_GAP)) };
  };
  const snapshot = () => {
    const rects = new Map<string, DOMRect>();
    for (const tile of tiles) if (compact ? compactOpen === tile.id : !layout.minimized.includes(tile.id)) { const rect = refs.current.get(tile.id)?.getBoundingClientRect(); if (rect) rects.set(tile.id, rect); }
    if (dock.current) rects.set("dock", dock.current.getBoundingClientRect());
    const frozen = structuredClone(current.current);
    for (const point of Object.values(frozen.positions)) if (point) point.x += anchorShift / window.innerWidth;
    frozen.anchorX = minimumLeft / window.innerWidth;
    for (const [id, rect] of rects) frozen.positions[id as Id] = { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight };
    return { frozen, rects };
  };
  const shift = (frozen: WidgetLayout, rects: Map<string, DOMRect>, id: string, all: boolean, dx: number, dy: number) => {
    if (overflow) return frozen;
    const moving = [...rects].filter(([key]) => all || key === id).map(([, rect]) => rect);
    if (!moving.length) return frozen;
    dx = Math.max(minimumLeft - Math.min(...moving.map(r => r.left)), Math.min(dx, window.innerWidth - WIDGET_GAP - Math.max(...moving.map(r => r.right))));
    dy = Math.max(minimumTop - Math.min(...moving.map(r => r.top)), Math.min(dy, window.innerHeight - WIDGET_GAP - Math.max(...moving.map(r => r.bottom))));
    if (!all) {
      const source = rects.get(id)!;
      const safe = nearestWidgetSpace({ x: source.x + dx, y: source.y + dy, width: source.width, height: source.height }, [...rects].filter(([key]) => key !== id).map(([, r]) => ({ x: r.x, y: r.y, width: r.width, height: r.height })), { width: innerWidth, height: innerHeight }, minimumLeft, minimumTop);
      if (!safe) return frozen;
      dx = safe.x - source.x; dy = safe.y - source.y;
    }
    const next = structuredClone(frozen);
    for (const [key, p] of Object.entries(next.positions)) if ((all || key === id) && rects.has(key)) next.positions[key as Id] = { x: Math.max(0, Math.min(1, p.x + dx / window.innerWidth)), y: Math.max(0, Math.min(1, p.y + dy / window.innerHeight)) };
    return next;
  };
  const start = (id: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    const target = event.target instanceof Element ? event.target : null;
    if (id !== "dock" && target?.closest(".dr-widget-tools,input,select,textarea,[contenteditable=true],[data-no-widget-drag]")) return;
    // Capture on the original button, not the panel: a stationary click still
    // reaches its control, while moving that same button drags the panel.
    const captureTarget = (target?.closest("button") ?? target?.closest<HTMLElement>("*") ?? event.currentTarget) as HTMLElement;
    gesture.current = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, before: current.current, ...snapshot(), all: id === "dock" || current.current.together, moved: false, captureTarget };
    captureTarget.setPointerCapture(event.pointerId);
    if (id === "dock") { event.currentTarget.focus(); event.preventDefault(); }
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true; event.preventDefault();
    const next = shift(active.frozen, active.rects, active.id, active.all, dx, dy); current.current = next; setLayout(next);
  };
  const finish = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const active = gesture.current; if (!active || active.pointer !== event.pointerId) return;
    gesture.current = null;
    if (cancel) { setLayout(active.before); current.current = active.before; }
    else if (active.moved) commit(current.current, active.before);
    if (active.moved) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0); }
    if (active.captureTarget.hasPointerCapture(event.pointerId)) active.captureTarget.releasePointerCapture(event.pointerId);
  };
  const keyMove = (id: string, event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && gesture.current) {
      const active = gesture.current; gesture.current = null; setLayout(active.before); current.current = active.before;
      if (active.captureTarget.hasPointerCapture(active.pointer)) active.captureTarget.releasePointerCapture(active.pointer);
      event.preventDefault(); return;
    }
    if (id !== "dock" && event.target !== event.currentTarget) return;
    const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const delta = directions[event.key]; if (!delta) return; event.preventDefault(); const { frozen, rects } = snapshot(); const step = event.shiftKey ? 32 : 8;
    commit(shift(frozen, rects, id, id === "dock" || current.current.together, delta.x * step, delta.y * step));
  };
  const handle = <button type="button" className="dr-widget-move" aria-label={t.all} title={`${t.all}. ${t.keys}`} onPointerDown={event => start("dock", event)} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onKeyDown={event => keyMove("dock", event)}><GripHorizontal size={14} /></button>;
  // Reset geometry belongs to the current chat boundary, not a legacy parent offset.
  return <div className="dr-widget-deck" data-adaptive={adaptive || undefined} data-compact={compact || undefined} data-minimum-left={minimumLeft} data-overflow={overflow || undefined} style={{ position: "fixed", left: minimumLeft, top: minimumTop, "--dr-min-left": `${minimumLeft}px`, "--dr-min-top": `${minimumTop}px`, "--dr-panel-width": `${Math.min(preferredWidth, Math.max(120, innerWidth - minimumLeft - 8))}px` } as CSSProperties}>
    <div className="dr-widget-dock" ref={dock} style={style("dock")}>
      <div className="dr-widget-deck-tools">{handle}<button type="button" title={t.mode} aria-label={t.mode} aria-pressed={layout.together} onClick={() => commit({ ...layout, together: !layout.together })}><Layers size={13} /><span>{t.together}</span></button>{onTogglePortraits && <button type="button" title={portraitsVisible ? t.portraitsOn : t.portraitsOff} aria-label={portraitsVisible ? t.portraitsOn : t.portraitsOff} aria-pressed={!!portraitsVisible} onClick={() => void onTogglePortraits()}>{portraitsVisible ? <Eye size={13} /> : <EyeOff size={13} />}</button>}<button type="button" title={t.reset} aria-label={t.reset} onClick={() => commit(empty())}><RotateCcw size={13} /></button></div>
      {onToggleAdaptive && <button type="button" className="dr-adaptive-toggle" aria-pressed={adaptive} aria-label={adaptiveText(locale)[adaptive ? "on" : "off"]} title={`${adaptiveText(locale)[adaptive ? "on" : "off"]}. ${adaptiveText(locale).hint}`} onClick={() => void onToggleAdaptive()}><ScanLine size={14} /></button>}
      {onPanelWidthChange && <button type="button" className="dr-width-toggle" aria-label={panelWidthCopy(locale).title} title={panelWidthCopy(locale).title} aria-expanded={widthOpen} onClick={() => setWidthOpen(!widthOpen)}><Scaling size={14} /></button>}
      {widthOpen && onPanelWidthChange && <div className="dr-width-popover" onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { setWidthOpen(false); dock.current?.querySelector<HTMLButtonElement>(".dr-width-toggle")?.focus(); } }}><PanelWidthControl locale={locale} value={panelWidth} onPreview={setPreviewWidth} onSave={onPanelWidthChange} /></div>}
      <div className="dr-widget-minimized">{tiles.filter(tile => compact || layout.minimized.includes(tile.id)).map(tile => <button type="button" key={tile.id} data-restore-widget={tile.id} aria-expanded={compact && compactOpen === tile.id} title={`${t.restore}: ${tile.title}`} aria-label={`${t.restore}: ${tile.title}`} onClick={() => { if (compact) setCompactOpen(compactOpen === tile.id ? null : tile.id); else commit({ ...layout, minimized: layout.minimized.filter(id => id !== tile.id) }); requestAnimationFrame(() => refs.current.get(tile.id)?.querySelector<HTMLButtonElement>("button")?.focus()); }}>{tile.icon}</button>)}</div>
      {error && <small role="alert">{t.failed}</small>}
    </div>
    {tiles.map(tile => <div key={tile.id} ref={node => { if (node) refs.current.set(tile.id, node); else refs.current.delete(tile.id); }} data-widget={tile.id} className="dr-widget-tile" hidden={compact ? compactOpen !== tile.id : layout.minimized.includes(tile.id)} style={style(tile.id)} tabIndex={0} role="group" aria-label={`${t.move}: ${tile.title}. ${t.keys}`} onPointerDown={event => start(tile.id, event)} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onKeyDown={event => keyMove(tile.id, event)} onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
      <div className="dr-widget-tools"><button type="button" title={`${t.minimize}: ${tile.title}`} aria-label={`${t.minimize}: ${tile.title}`} onClick={() => { if (compact) setCompactOpen(null); else commit({ ...layout, minimized: [...layout.minimized, tile.id] }); requestAnimationFrame(() => dock.current?.querySelector<HTMLButtonElement>(`[data-restore-widget="${tile.id}"]`)?.focus()); }}><Minus size={14} /></button></div>
      {tile.children}
    </div>)}
  </div>;
}
