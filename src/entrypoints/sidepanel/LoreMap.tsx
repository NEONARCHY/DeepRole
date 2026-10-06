import { Select } from "../shared/Select";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, ChevronRight, FileText, Globe2, Link2, MapPin, Plus, Redo2, RotateCcw, Search, Sparkles, Undo2, UserRound, Users, X, ZoomIn, ZoomOut } from "lucide-react";
import { arrangeVisibleLore, buildLoreGraph, loreAncestors, loreExpandedIds, loreOverviewZoom, visibleLoreNodes, type LoreNode, type LoreNodeKind } from "../../core/lore-map";
import { LORE_CATEGORIES, loreCategoryLabel, validateLoreMapLayout } from "../../core/lore-categories";
import { suggestLoreConnections } from "../../core/entry-links";
import { createId } from "../../core/id";
import { mapEntryCount, mapText, type MapKey } from "../../core/map-i18n";
import { sceneText } from "../../core/scene-i18n";
import type { Locale, LoreMapLayout, MemoryBook, MemoryEntry, SceneEntity, StoryTemplate, WorldProfile } from "../../core/types";
import { TooltipButton } from "../shared/TooltipButton";
import { MapEditHistory } from "../../storage/lore-map-history";
import { MemoryConflictError, repository } from "../../storage/repository";
import { MemoryUse } from "../shared/MemoryAssistant";
import { MemoryModeControl } from "../shared/MemoryModeControl";
import { assistantText } from "../../core/assistant-i18n";
import { mapBoxSelection, mapConnectionEntries, mapDropTarget, mapPopover, mapSelectionBox, mapTranslate } from "../../core/map-ux";
import { MapMemoryEditor } from "./MapMemoryEditor";
import type { ContextSelection, MemoryOverrides, ActivationMode } from "../../core/types";

type Point = { x: number; y: number };
type Connection = { from: string; to: string; sourceNode: string; targetNode: string; label: string; mode: "context" | "reference" };
export interface MapPaneController { leave: () => Promise<boolean> }
export interface LoreMapProps {
  embedded?: boolean; activePane?: boolean; onRegister?: (controller: MapPaneController | null) => void; sceneControls?: ReactNode;
  selection?: ContextSelection; overrides?: MemoryOverrides;
  onMemoryUse?: (id: string, action: "include" | "exclude" | "reset") => Promise<void>;
  onActivation?: (entry: MemoryEntry, activation: ActivationMode, history: MapEditHistory) => Promise<void>;
  onBranchActivation?: (entries: MemoryEntry[], activation: ActivationMode, history: MapEditHistory, branchId: string) => Promise<void>;
  locale: Locale; world: WorldProfile; books: MemoryBook[]; entries: MemoryEntry[]; entities: SceneEntity[]; templates: StoryTemplate[];
  confirmDeletions: boolean; onClose: () => void; onEdit: (node: LoreNode) => void;
  onDeleteBranch: (id: string, history: MapEditHistory) => Promise<LoreMapLayout>;
  connectedToChat: boolean; canConnect: boolean; onConnect: () => Promise<boolean>;
  onLayout: (layout: LoreMapLayout, history: MapEditHistory) => Promise<void>;
  onCategory: (entryId: string, categoryId: string | null, history: MapEditHistory, layout?: LoreMapLayout) => Promise<void>;
  onLink: (from: string, to: string, link: { label: string; mode: "context" | "reference" } | null, history: MapEditHistory) => Promise<void>;
  onHistoryChanged: () => Promise<void>;
  onSaveEntry: (entry: MemoryEntry, expected: MemoryEntry | null) => Promise<void>;
  onPerson: (name: string, token: string, entries: string[]) => Promise<string>;
}
type Drag = { pointer: number; start: Point; origin: Point; kind: "pan" | "node" | "link" | "select"; nodeId?: string; points?: Record<string, Point>; before?: LoreMapLayout; worldStart?: Point; baseSelection?: string[]; additive?: boolean; invert?: boolean; moved: boolean };
const icons: Record<LoreNodeKind, typeof Globe2> = { world: Globe2, branch: Sparkles, book: BookOpen, entry: FileText, character: UserRound, location: MapPin, group: Users, template: Sparkles };

export function LoreMap(props: LoreMapProps) {
  const t = (key: Parameters<typeof sceneText>[1]) => sceneText(props.locale, key);
  const m = (key: MapKey) => mapText(props.locale, key);
  // Window sizing belongs to MapWorkspace; individual panes have no size mode.
  const mode = "full";
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 0.6 });
  const [layout, setLayout] = useState<LoreMapLayout>(() => structuredClone(props.world.mapLayout ?? { positions: {}, expandedIds: [], customCategories: [] }));
  // Visibility belongs to this open map, not to the lore. Every opening starts
  // fully expanded, regardless of legacy expandedIds in an imported layout.
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const [selectedId, setSelectedId] = useState("world:" + props.world.id);
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const activePane = useRef(props.activePane); activePane.current = props.activePane;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [newEntry, setNewEntry] = useState<MemoryEntry | null>(null);
  const [textDirty, setTextDirty] = useState(false);
  const editorGuard = useRef<() => boolean>(() => true);
  const dismissCard = useRef<() => boolean>(() => true);
  const [viewportSize, setViewportSize] = useState({ width: 1000, height: 650 });
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [connectingWorld, setConnectingWorld] = useState(false);
  const [connectWorldError, setConnectWorldError] = useState(false);
  const [query, setQuery] = useState("");
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [newBranch, setNewBranch] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchParent, setBranchParent] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [personName, setPersonName] = useState("");
  const [personEntries, setPersonEntries] = useState<string[]>([]);
  const [branchQuery, setBranchQuery] = useState("");
  const [branchLimit, setBranchLimit] = useState(20);
  const [branchMode, setBranchMode] = useState<ActivationMode>("smart");
  const [pending, setPending] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [closing, setClosing] = useState(false);
  const [history] = useState(() => new MapEditHistory(props.world.id, repository, { layout: props.world.mapLayout, entries: props.entries }));
  const [historyError, setHistoryError] = useState<"historyConflict" | "historyFailed" | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyAction = useRef<(action: "undo" | "redo" | "reset") => void>(() => {});
  useEffect(() => {
    if (pending || saveError) return;
    const latest = props.world.mapLayout ?? { positions: {}, expandedIds: [], customCategories: [] };
    if (JSON.stringify(latest) !== JSON.stringify(layoutRef.current)) { const next = structuredClone(latest); layoutRef.current = next; setLayout(next); }
  }, [props.world.mapLayout, pending, saveError]);
  const viewport = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const search = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const ignoreClickUntil = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failures = useRef<(() => Promise<void>)[]>([]);
  const close = useRef<() => void>(() => {});
  const marker = useId().replaceAll(":", "");
  // Position changes do not repeat the expensive text classification.
  const model = useMemo(() => buildLoreGraph({
    ...props, world: { ...props.world, mapLayout: { ...layout, positions: {} } },
    labels: { memory: t("books"), characters: t("mapCharacters"), locations: t("mapLocations"), groups: t("mapGroups"), templates: t("templates") },
    categoryLabel: (id) => loreCategoryLabel(props.locale, id),
  }), [props.world.id, props.world.name, props.world.description, props.world.color, props.books, props.entries, props.entities, props.templates, props.locale, layout.customCategories, layout.categoryNames]);
  const allExpandedIds = useMemo(() => loreExpandedIds(model), [model]);
  const expandedIds = useMemo(() => allExpandedIds.filter((id) => !collapsedIds.includes(id)), [allExpandedIds, collapsedIds]);
  // Pack the entire map once per structural/position change. Toggling visibility
  // must not move other nodes underneath a stationary camera.
  const graph = useMemo(() => arrangeVisibleLore(model, allExpandedIds, layout.positions), [model, layout.positions, allExpandedIds]);
  const nodes = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const graphRef = useRef(graph); graphRef.current = graph;
  const selected = nodes.get(selectedId) ?? graph.nodes[0]!;
  const visible = useMemo(() => visibleLoreNodes(graph, expandedIds), [graph, expandedIds]);
  const visibleNodeKey = JSON.stringify([...visible]);
  useEffect(() => { setSelectionIds((ids) => ids.filter((id) => visible.has(id))); }, [visibleNodeKey]);
  const expanded = new Set(expandedIds);
  const children = useMemo(() => {
    const groups = new Map<string, LoreNode[]>();
    for (const node of graph.nodes) if (node.parentId) groups.set(node.parentId, [...(groups.get(node.parentId) ?? []), node]);
    return groups;
  }, [graph]);
  const entry = props.entries.find((record) => record.id === selected.recordId && selected.kind === "entry");
  const branchEntryIds = useMemo(() => new Set(mapConnectionEntries(model, selected.id, props.entries)), [model, selected.id, props.entries]);
  const branchEntries = useMemo(() => props.entries.filter((entry) => branchEntryIds.has(entry.id)).sort((a, b) => a.title.localeCompare(b.title, props.locale) || a.id.localeCompare(b.id)), [props.entries, branchEntryIds, props.locale]);
  const matchingBranchEntries = branchEntries.filter((entry) => (entry.title + " " + entry.content).toLocaleLowerCase().replaceAll("_", " ").includes(branchQuery.trim().toLocaleLowerCase()));
  const suggestions = useMemo(() => entry ? suggestLoreConnections(entry, props.entries) : [], [entry, props.entries]);
  const connections = graph.edges.filter((edge) => edge.kind !== "branch" && (edge.from === selected.id || edge.to === selected.id));
  const results = query.trim() ? graph.nodes.filter((node) => (node.title + " " + node.content.slice(0, 2000)).toLocaleLowerCase().includes(query.toLocaleLowerCase().replaceAll("_", " ").trim())).slice(0, 30) : [];
  const categories = [...LORE_CATEGORIES.map((c) => ({ id: c.id, title: layout.categoryNames?.[c.id] ?? loreCategoryLabel(props.locale, c.id) })), ...layout.customCategories.map((c) => ({ id: c.id, title: layout.categoryNames?.[c.id] ?? c.title }))];
  const isCategory = selected.kind === "branch" && categories.some((c) => c.id === selected.recordId);
  const isCustom = selected.kind === "branch" && selected.recordId.startsWith("custom-");
  const popupStyle = mapPopover({ x: selected.x * camera.zoom + camera.x, y: selected.y * camera.zoom + camera.y, halfWidth: 135 * camera.zoom, halfHeight: (selected.kind === "world" ? 80 : 45) * camera.zoom }, viewportSize);
  const connectionSources = connection ? mapConnectionEntries(model, connection.sourceNode, props.entries) : [];
  const connectionTargets = connection ? mapConnectionEntries(model, connection.targetNode, props.entries) : [];
  const postLayout = (value: "full" | "closed") => { if (!props.embedded && window.parent !== window) window.parent.postMessage({ source: "deeprole-menu", type: "MAP_LAYOUT", mode: value }, "*"); };
  useEffect(() => {
    props.onRegister?.({ leave: async () => { if (drag.current || !editorGuard.current()) return false; await queue.current; return !failures.current.length; } });
    return () => props.onRegister?.(null);
  }, []);

  function enqueue(task: () => Promise<void>, retry = true) {
    setPending((value) => value + 1);
    queue.current = queue.current.then(task).catch((error) => { if (error instanceof MemoryConflictError) setHistoryError("historyConflict"); else if (retry) { failures.current.push(task); setSaveError(true); } else setHistoryError("historyFailed"); }).then(() => { setPending((value) => value - 1); });
    return queue.current;
  }
  function storeLayout(next: LoreMapLayout) {
    try { validateLoreMapLayout(next); } catch { setSaveError(true); return; }
    layoutRef.current = next; setLayout(next);
    void enqueue(() => props.onLayout(next, history));
  }
  historyAction.current = (action) => {
    if (pending || saveError || closing || drag.current || !(action === "undo" ? history.canUndo : action === "redo" ? history.canRedo : history.canReset || newBranch || connection || renaming)) return;
    if (action === "reset" && !window.confirm(m("sessionResetQuestion"))) return;
    const focus = document.activeElement as HTMLElement | null;
    setHistoryBusy(true); setHistoryError(null); setConnectFrom(null); setGhost(null);
    if (action === "reset") { setConnection(null); setNewBranch(false); setBranchName(""); setRenaming(false); setRenameValue(""); }
    void enqueue(async () => {
      const next = await history[action](); layoutRef.current = next; setLayout(next);
      setBranchParent((parent) => parent && !LORE_CATEGORIES.some((c) => c.id === parent) && !next.customCategories.some((c) => c.id === parent) ? "" : parent);
      if (action === "reset") setCollapsedIds([]);
      await props.onHistoryChanged();
    }, false).finally(() => {
      setHistoryBusy(false);
      requestAnimationFrame(() => { if (!closing) (focus?.isConnected ? focus : viewport.current)?.focus({ preventScroll: true }); });
    });
  };
  function center(node: LoreNode, zoom = camera.zoom) {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    setCamera({ zoom, x: rect.width / 2 - node.x * zoom, y: rect.height / 2 - node.y * zoom });
  }
  function centerOverview(source = graphRef.current) {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    center(source.nodes[0]!, loreOverviewZoom(source, rect.width, rect.height));
  }
  function reveal(id: string, zoom = 0.8) {
    const node = nodes.get(id); if (!node) return;
    if (!editorGuard.current()) return;
    setHasInteracted(true);
    const ancestors = new Set(loreAncestors(graph, id));
    setCollapsedIds((ids) => ids.filter((value) => !ancestors.has(value)));
    setNewEntry(null); setDetailsOpen(true); setSelectedId(id); setSelectionIds([id]); center(node, zoom);
  }
  function startConnection(from: string, to: string) {
    const sourceNode = nodes.has(from) ? from : "entry:" + from;
    const targetNode = nodes.has(to) ? to : "entry:" + to;
    if (sourceNode === targetNode) { setLinkMessage(m("sameLink")); return; }
    const sources = mapConnectionEntries(model, sourceNode, props.entries); const targets = mapConnectionEntries(model, targetNode, props.entries);
    const source = sources.length === 1 ? sources[0]! : ""; const target = targets.length === 1 ? targets[0]! : "";
    const old = props.entries.find((e) => e.id === source)?.links?.find((link) => link.targetId === target);
    setConnection({ from: source, to: target, sourceNode, targetNode, label: old?.label ?? "", mode: old?.mode ?? "reference" });
    setLinkMessage(null); setNewBranch(false);
    setConnectFrom(null); setGhost(null);
  }
  function toggleBranch(node: LoreNode) {
    setCollapsedIds((ids) => ids.includes(node.id) ? ids.filter((id) => id !== node.id) : [...ids, node.id]);
  }
  function choose(node: LoreNode, event?: React.MouseEvent) {
    if (performance.now() < ignoreClickUntil.current) return;
    setHasInteracted(true);
    if (connectFrom) { startConnection(connectFrom, node.id); return; }
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) { setSelectionIds((ids) => ids.includes(node.id) && !event.shiftKey ? ids.filter((id) => id !== node.id) : [...new Set([...ids, node.id])]); return; }
    if ((selectedId !== node.id || newEntry) && !editorGuard.current()) return;
    setSelectionIds([node.id]);
    setNewEntry(null); setDetailsOpen(true);
    setSelectedId(node.id); setRenaming(false);
  }
  dismissCard.current = () => { if (!editorGuard.current()) return false; setDetailsOpen(false); setNewEntry(null); viewport.current?.focus({ preventScroll: true }); return true; };
  close.current = () => { if (props.embedded) { props.onClose(); return; } if (!editorGuard.current()) return; setClosing(true); void queue.current.then(() => props.onClose()); };
  function editSelected() { if (props.embedded) { props.onEdit(selected); return; } if (!editorGuard.current()) return; setClosing(true); void queue.current.then(() => props.onEdit(selected)); }
  function createEntry() {
    if (!editorGuard.current()) return;
    setHasInteracted(true);
    const now = Date.now();
    setConnection(null); setNewBranch(false); setDetailsOpen(true);
    setNewEntry({ id: createId("memory"), worldId: props.world.id, bookId: selected.kind === "book" ? selected.recordId : null, entityIds: ["character", "location", "group"].includes(selected.kind) ? [selected.recordId] : undefined, title: "", content: "", keywords: [], mapCategory: isCategory ? selected.recordId : selected.categoryId && categories.some((c) => c.id === selected.categoryId) ? selected.categoryId : undefined, activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: now, updatedAt: now });
  }
  const escapeAction = useRef<() => void>(() => {});
  escapeAction.current = () => {
    if (connection) { setConnection(null); return; }
    if (newBranch) { setNewBranch(false); return; }
    if (connectFrom) { setConnectFrom(null); setLinkMessage(null); return; }
    if (detailsOpen) { dismissCard.current(); return; }
    close.current();
  };

  useEffect(() => { setPersonName(selected.title); setPersonEntries(selected.inferredEntryIds ?? []); setRenaming(false); setBranchQuery(""); setBranchLimit(20); }, [selected.id]);
  useEffect(() => {
    postLayout(mode);
  }, [mode]);
  useEffect(() => {
    if (!props.embedded || props.activePane) search.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (props.embedded && !activePane.current) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing && event.key.toLowerCase() === "z") {
        const editing = (event.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
        if (editing || event.defaultPrevented) return;
        event.preventDefault(); event.stopPropagation(); historyAction.current(event.shiftKey ? "redo" : "undo"); return;
      }
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        escapeAction.current();
      }
      if (event.key === "Tab" && !props.embedded) {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const fromParent = (event: MessageEvent) => { if (!props.embedded && event.source === window.parent && event.data?.source === "deeprole-page" && event.data.type === "CLOSE_MAP") close.current(); };
    window.addEventListener("keydown", key); window.addEventListener("message", fromParent);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("message", fromParent); postLayout("closed"); previousFocus.current?.focus(); };
  }, []);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    let previousSize: { width: number; height: number } | undefined;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      setViewportSize({ width: rect.width, height: rect.height });
      const previous = previousSize; previousSize = { width: rect.width, height: rect.height };
      if (!previous) { centerOverview(); return; }
      // Keep the same world point in view on resize; never jump to a selected branch.
      setCamera((current) => ({ ...current, x: current.x + (rect.width - previous.width) / 2, y: current.y + (rect.height - previous.height) / 2 }));
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current) return;
      setHasInteracted(true);
      if (event.ctrlKey || event.metaKey) zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1);
      else { const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? element.clientHeight : 1; setCamera((current) => ({ ...current, x: current.x - (event.shiftKey ? event.deltaY : event.deltaX) * unit, y: current.y - (event.shiftKey ? 0 : event.deltaY) * unit })); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);
  useEffect(() => {
    const element = viewport.current; if (!element || typeof IntersectionObserver === "undefined") return;
    // A clipped connector at the canvas edge is not a usable touch/keyboard target.
    // Visibility keeps its box measurable so it becomes available again after panning.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const port = entry.target as HTMLButtonElement; const complete = entry.isIntersecting && entry.intersectionRatio >= 0.999;
        port.style.visibility = complete ? "" : "hidden"; port.disabled = !complete;
      }
    }, { root: element, threshold: [0, 1] });
    element.querySelectorAll(".lm-port").forEach((port) => observer.observe(port));
    return () => observer.disconnect();
  }, [visibleNodeKey]);
  function zoomBy(factor: number) {
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    setCamera((current) => { const zoom = Math.max(0.25, Math.min(1.8, current.zoom * factor)); const ratio = zoom / current.zoom; return { zoom, x: rect.width / 2 - (rect.width / 2 - current.x) * ratio, y: rect.height / 2 - (rect.height / 2 - current.y) * ratio }; });
  }
  function selectedPoints(id: string) { const ids = selectionIds.includes(id) ? selectionIds : [id]; return Object.fromEntries(graphRef.current.nodes.filter((node) => ids.includes(node.id) && visible.has(node.id)).map((node) => [node.id, { x: node.x, y: node.y }])); }
  function moveNode(id: string, dx: number, dy: number) {
    const points = mapTranslate(selectedPoints(id), dx, dy);
    storeLayout({ ...layoutRef.current, positions: { ...layoutRef.current.positions, ...points } });
  }
  function keyPan(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) { event.preventDefault(); setSelectionIds([...visible]); return; }
    if (event.target !== event.currentTarget) return;
    const movements: Record<string, Point> = { ArrowLeft: { x: 80, y: 0 }, ArrowRight: { x: -80, y: 0 }, ArrowUp: { x: 0, y: 80 }, ArrowDown: { x: 0, y: -80 } };
    const delta = movements[event.key]; if (delta) { event.preventDefault(); setCamera((c) => ({ ...c, x: c.x + delta.x, y: c.y + delta.y })); }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(1.2); }
    if (event.key === "-") { event.preventDefault(); zoomBy(1 / 1.2); }
  }
  function nodeDown(event: React.PointerEvent, node: LoreNode, kind: "node" | "link") {
    if (event.button !== 0 || closing) return;
    // Suppress only the synthetic click from the previous drag, never a fresh press.
    ignoreClickUntil.current = 0;
    setHasInteracted(true);
    event.stopPropagation();
    // Keep pointer focus from recentering the canvas underneath a drag in Firefox.
    event.preventDefault();
    drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: camera.x, y: camera.y }, kind, nodeId: node.id, points: selectedPoints(node.id), before: layoutRef.current, moved: false };
  }
  function pointAt(event: React.PointerEvent): Point {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left - camera.x) / camera.zoom, y: (event.clientY - rect.top - camera.y) / camera.zoom };
  }
  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.start.x; const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 5) return;
    current.moved = true; event.currentTarget.setPointerCapture(event.pointerId);
    if (current.kind === "pan") setCamera((c) => ({ ...c, x: current.origin.x + dx, y: current.origin.y + dy }));
    else if (current.kind === "select") {
      const end = pointAt(event); const hits = mapBoxSelection(graphRef.current, visible, current.worldStart!, end); const base = current.baseSelection ?? [];
      setMarquee({ start: current.worldStart!, end });
      setSelectionIds(current.invert ? [...base.filter((id) => !hits.includes(id)), ...hits.filter((id) => !base.includes(id))] : current.additive ? [...new Set([...base, ...hits])] : hits);
    }
    else if (current.kind === "link") setGhost(pointAt(event));
    else {
      const points = mapTranslate(current.points!, dx / camera.zoom, dy / camera.zoom);
      setSelectionIds(Object.keys(points));
      const next = { ...layoutRef.current, positions: { ...layoutRef.current.positions, ...points } };
      layoutRef.current = next; setLayout(next);
    }
  }
  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null; setMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.moved) { if (current.kind === "select" && !current.additive && !current.invert) setSelectionIds([]); return; }
    ignoreClickUntil.current = performance.now() + 300;
    const source = nodes.get(current.nodeId ?? "");
    const point = pointAt(event);
    if (current.kind === "link") {
      const target = mapDropTarget(graph, visible, source?.id ?? "", point);
      setGhost(null); if (source && target) startConnection(source.id, target.id); else if (source) { setConnectFrom(source.id); setLinkMessage(m("noDrop")); }
    } else if (current.kind === "node") {
      storeLayout(layoutRef.current);
    }
  }
  function revealNeighbours() {
    const ids = connections.flatMap((edge) => [edge.from, edge.to]);
    const paths = new Set(ids.flatMap((id) => loreAncestors(graph, id)));
    setCollapsedIds((values) => values.filter((id) => !paths.has(id)));
  }
  function addBranch(event: React.FormEvent) {
    event.preventDefault(); if (!branchName.trim()) return;
    const id = createId("custom").replace("custom_", "custom-");
    storeLayout({ ...layoutRef.current, customCategories: [...layoutRef.current.customCategories, { id, title: branchName.trim(), parentId: branchParent || null }] });
    if (branchParent) {
      const path = new Set(["branch:" + branchParent, ...loreAncestors(graph, "branch:" + branchParent)]);
      setCollapsedIds((ids) => ids.filter((value) => !path.has(value)));
    }
    setNewBranch(false); setBranchName(""); if (editorGuard.current()) { setNewEntry(null); setDetailsOpen(true); setSelectedId("branch:" + id); }
  }
  function field(label: string, text: string, control: ReactNode) { return <label className="lm-field"><span>{label}</span>{control}<small>{text}</small></label>; }
  function tool(label: string, text: string, icon: ReactNode, action: () => void, pressed?: boolean) { return <span className="lm-tool"><TooltipButton onClick={action} aria-label={label} tooltip={text} aria-pressed={pressed}>{icon}</TooltipButton></span>; }

  return <section ref={dialog} className={"dr-loremap is-" + mode + (props.embedded ? " is-pane" : "")} role={props.embedded ? "group" : "dialog"} aria-modal={props.embedded ? undefined : mode === "full"} aria-label={props.embedded ? props.world.name : t("worldMap")} aria-busy={closing}>
    {props.sceneControls}
    <div className="lm-tools" inert={historyBusy}><label className="lm-search"><Search /><input ref={search} aria-label={t("mapSearch")} placeholder={t("mapSearch")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="lm-map-view-tools" role="group" aria-label={m("controls")}>
        {tool(t("mapZoomOut"), m("controlsHelp"), <ZoomOut />, () => zoomBy(1 / 1.2))}<output aria-label={t("mapScale")}>{Math.round(camera.zoom * 100)}%</output>{tool(t("mapZoomIn"), m("controlsHelp"), <ZoomIn />, () => zoomBy(1.2))}
        {tool(m("overview"), m("branchHelp"), <Globe2 />, () => { if (!editorGuard.current()) return; setNewEntry(null); setCollapsedIds([]); setSelectedId(graph.nodes[0]!.id); centerOverview(); })}
        {tool(m("allLinks"), m("allLinksHint"), <Link2 />, () => setShowAllLinks(!showAllLinks), showAllLinks)}
      </div>
      <div className="lm-map-actions">
        {!props.connectedToChat && props.canConnect && <TooltipButton className="button secondary lm-connect-world" aria-label={m("attachWorld")} tooltip={m("attachWorldHint")} disabled={connectingWorld} onClick={() => { setConnectingWorld(true); setConnectWorldError(false); void props.onConnect().then((ok) => setConnectWorldError(!ok)).catch(() => setConnectWorldError(true)).finally(() => setConnectingWorld(false)); }}>{m("attachWorld")}</TooltipButton>}
        <TooltipButton className="button secondary lm-branch-action" aria-label={m("newBranch")} tooltip={m("branchHint")} onClick={() => { setNewBranch(!newBranch); setBranchParent(isCategory ? selected.recordId : ""); }}><Plus />{m("newBranch")}</TooltipButton>
        <TooltipButton className="button primary lm-add-entry" aria-label={m("newEntry")} tooltip={m("writeFirst")} onClick={createEntry}><Plus size={16} />{m("newEntry")}</TooltipButton>
      </div>
      <span className="lm-history-tools" role="group" aria-label={m("history")}>
        <TooltipButton aria-label={m("undo")} tooltip={m("undoHint")} aria-keyshortcuts="Control+Z Meta+Z" disabled={pending > 0 || saveError || !history.canUndo} onClick={() => historyAction.current("undo")}><Undo2 /></TooltipButton>
        <TooltipButton aria-label={m("redo")} tooltip={m("redoHint")} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" disabled={pending > 0 || saveError || !history.canRedo} onClick={() => historyAction.current("redo")}><Redo2 /></TooltipButton>
        <TooltipButton className="lm-session-reset" aria-label={m("sessionReset")} tooltip={m("sessionResetHint")} disabled={pending > 0 || saveError || !history.canReset && !newBranch && !connection && !renaming} onClick={() => historyAction.current("reset")}><RotateCcw /><span>{m("sessionReset")}</span></TooltipButton>
      </span>
      <span className={"lm-save " + (saveError ? "is-error" : "")} role="status">{pending ? m("saving") : saveError ? m("failed") : m("saved")}</span>
      {saveError && <TooltipButton aria-label={m("retry")} tooltip={m("retry")} onClick={() => { const tasks = failures.current.splice(0); setSaveError(false); tasks.forEach((task) => void enqueue(task)); }}><RotateCcw /></TooltipButton>}
    {query.trim() && <div className="lm-results">{results.map((node) => <button key={node.id} onClick={() => { if (connectFrom) startConnection(connectFrom, node.id); else reveal(node.id); setQuery(""); }}>{node.title}</button>)}{!results.length && <span>{t("mapNoResults")}</span>}</div>}
    </div>
    {historyError && <div className="lm-history-error" role="alert">{m(historyError)}</div>}
    {connectWorldError && <div className="lm-history-error" role="alert">{m("attachWorldFailed")}</div>}
    {connectFrom && <div className="lm-notice" role="status"><Link2 />{linkMessage ?? m("connecting")}<button onClick={() => { setConnectFrom(null); setGhost(null); setLinkMessage(null); }}>{m("cancel")}</button></div>}
    <div className="lm-body" inert={historyBusy}><div className="lm-viewport" ref={viewport} tabIndex={0} role="group" aria-label={t("mapCanvas")} onKeyDown={keyPan}
      onAuxClick={(event) => { if (event.button === 1) event.preventDefault(); }}
      onPointerDown={(event) => {
        if (closing || drag.current || event.button !== 0 && event.button !== 1 || event.button === 0 && (event.target as HTMLElement).closest("button")) return;
        const pan = event.button === 1 || event.pointerType === "touch";
        if (!pan && !editorGuard.current()) return;
        setHasInteracted(true);
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        if (!pan) { setDetailsOpen(false); setNewEntry(null); }
        drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: camera.x, y: camera.y }, kind: pan ? "pan" : "select", worldStart: pointAt(event), baseSelection: selectionIds, additive: event.shiftKey, invert: event.ctrlKey || event.metaKey, moved: false };
      }}
      onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { const current = drag.current; if (current?.kind === "node" && current.before) { layoutRef.current = current.before; setLayout(current.before); } if (current?.kind === "select") setSelectionIds(current.baseSelection ?? []); drag.current = null; setMarquee(null); setGhost(null); }}>
      <div className="lm-space" style={{ width: graph.width, height: graph.height, transform: "translate(" + camera.x + "px, " + camera.y + "px) scale(" + camera.zoom + ")" }}>
        <svg className="lm-edges" width={Math.max(graph.width, ...graph.nodes.map((n) => n.x + 300))} height={Math.max(graph.height, ...graph.nodes.map((n) => n.y + 200))} aria-hidden="true"><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#89d7ff" /></marker></defs>
          {graph.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to) && (edge.kind === "branch" || showAllLinks || edge.from === selected.id || edge.to === selected.id)).map((edge) => {
            const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!; const focused = edge.from === selected.id || edge.to === selected.id; const lore = edge.kind === "context" || edge.kind === "reference";
            const dx = to.x - from.x; const dy = to.y - from.y; const horizontal = Math.abs(dx) > Math.abs(dy);
            const bend = lore ? Math.min(180, Math.hypot(dx, dy) * 0.2) : 0;
            const mid = { x: (from.x + to.x) / 2 + (horizontal ? 0 : bend), y: (from.y + to.y) / 2 - (horizontal ? bend : 0) };
            const path = "M " + from.x + " " + from.y + " Q " + mid.x + " " + mid.y + " " + to.x + " " + to.y;
            return <g key={edge.id} className={"lm-edge edge-" + edge.kind + (focused ? " is-highlighted" : "")}><path d={path} style={edge.kind === "branch" ? { stroke: to.color } : undefined} markerEnd={lore ? "url(#" + marker + ")" : undefined} /><title>{edge.label}</title>{lore && focused && edge.label && <text x={mid.x} y={mid.y - 12} textAnchor="middle">{edge.label.slice(0, 50)}</text>}</g>;
          })}
          {ghost && (() => { const from = nodes.get(drag.current?.nodeId ?? connectFrom ?? ""); return from ? <path className="lm-ghost" d={"M " + from.x + " " + from.y + " L " + ghost.x + " " + ghost.y} /> : null; })()}
        </svg>
        {graph.nodes.filter((node) => visible.has(node.id)).map((node) => {
          const Icon = icons[node.kind]; const expandable = children.has(node.id) && node.kind !== "world";
          return <div key={node.id} className="lm-node-wrap" style={{ left: node.x, top: node.y, "--node-color": node.color, "--ui-scale": 1 / camera.zoom } as CSSProperties}>
            <TooltipButton className={"lm-node node-" + node.kind + (selected.id === node.id ? " is-selected" : "") + (selectionIds.includes(node.id) ? " is-box-selected" : "") + (node.inferredToken ? " is-inferred" : "")} aria-label={node.title} tooltip={node.kind === "branch" || node.kind === "world" ? m("branchHelp") : m("nodeHelp")} aria-pressed={selected.id === node.id} aria-expanded={expandable ? expanded.has(node.id) : undefined}
              onPointerDown={(event) => nodeDown(event, node, "node")} onClick={(event) => choose(node, event)} onDoubleClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && expandable && !connectFrom && performance.now() >= ignoreClickUntil.current) toggleBranch(node); }}
              aria-keyshortcuts={expandable ? "Alt+Enter" : undefined}
              onKeyDown={(event) => { if (!event.altKey) return; if (event.key === "Enter" && expandable) { event.preventDefault(); toggleBranch(node); return; } const delta: Record<string, Point> = { ArrowLeft: { x: -40, y: 0 }, ArrowRight: { x: 40, y: 0 }, ArrowUp: { x: 0, y: -40 }, ArrowDown: { x: 0, y: 40 } }; if (delta[event.key]) { event.preventDefault(); moveNode(node.id, delta[event.key]!.x, delta[event.key]!.y); } }}
              data-lore-id={node.id} data-lore-parent={node.parentId}>
              <span className="lm-node-orb"><Icon /></span><span className="lm-node-label"><strong>{node.title}</strong><small>{node.kind === "entry" ? (node.confidence === "manual" ? m("manual") : t("mapEntry")) : node.count ? mapEntryCount(props.locale, node.count) : node.kind === "branch" ? m("empty") : t(node.kind === "book" ? "books" : node.kind === "template" ? "templates" : node.kind)}</small></span>
            </TooltipButton>
            <TooltipButton className="lm-port" aria-label={m("connect") + ": " + node.title} tooltip={m("connectionHint")} onPointerDown={(event) => nodeDown(event, node, "link")} onClick={() => { if (performance.now() >= ignoreClickUntil.current) { setConnectFrom(node.id); setLinkMessage(null); } }}><Link2 /></TooltipButton>
          </div>;
        })}
      </div>
      {marquee && (() => { const box = mapSelectionBox(marquee.start, marquee.end); return <div className="lm-marquee" style={{ left: box.x * camera.zoom + camera.x, top: box.y * camera.zoom + camera.y, width: box.width * camera.zoom, height: box.height * camera.zoom }} />; })()}
      <span className="lm-canvas-note">{selectionIds.length ? m("selectedCards").replace("{count}", String(selectionIds.length)) : showAllLinks ? m("allLinks") : m("selectedLinks")}</span>
    </div>
    {!detailsOpen && !connection && !newBranch && (!props.entries.length || !hasInteracted) && <section className="lm-start-guide" aria-label={m("startTitle")}><strong>{props.entries.length ? m("nextStep") : m("startTitle")}</strong>{!props.entries.length && <><p>{m("startText")}</p><button className="button primary" type="button" onClick={createEntry}>{m("addFirstEntry")}</button></>}</section>}
    {detailsOpen && <aside className="lm-details lm-popover" hidden={!!connection || newBranch} style={popupStyle} aria-label={t("mapDetails")}>
      <div className="lm-detail-heading"><small>{newEntry ? m("newEntry") : t("mapDetails")}</small><TooltipButton aria-label={m("closeDetails")} onClick={() => dismissCard.current()}><X size={16} /></TooltipButton></div><h3>{newEntry ? m("newEntry") : selected.title}</h3>
      {!newEntry && <nav className="lm-breadcrumb" aria-label={m("path")}>{loreAncestors(graph, selected.id).reverse().map((id) => <button key={id} onClick={() => { const node = nodes.get(id); if (node) choose(node); }}>{nodes.get(id)?.title}</button>)}</nav>}
      {(newEntry || entry) && <MapMemoryEditor key={(newEntry ?? entry)!.id} locale={props.locale} entry={(newEntry ?? entry)!} isNew={!!newEntry} modeControl={entry && props.onActivation ? <MemoryModeControl locale={props.locale} value={entry.activation} disabled={pending > 0 || textDirty} onChange={(activation) => { void enqueue(() => props.onActivation!(entry, activation, history)); }} /> : undefined} guard={editorGuard} onDirty={setTextDirty} onSave={props.onSaveEntry} onSaved={(record) => { setNewEntry(null); setSelectedId("entry:" + record.id); const path = new Set(loreAncestors(graphRef.current, "entry:" + record.id)); setCollapsedIds((ids) => ids.filter((id) => !path.has(id))); }} />}
      {!newEntry && <>
      {selected.kind === "world" && <><p>{m("organization")}</p><div className="lm-section"><div className="lm-detail-heading"><h4>{m("branches")}</h4></div>{(children.get(selected.id) ?? []).map((node) => <button className="lm-branch-list" key={node.id} style={{ "--branch-color": node.color } as CSSProperties} onClick={() => choose(node)}><i style={{ background: node.color }} />{node.title}<span>{node.count}</span><ChevronRight /></button>)}</div></>}
      {entry && <div className="lm-section">
        <MemoryUse locale={props.locale} id={entry.id} selection={props.selection} overrides={props.overrides} onChange={props.onMemoryUse} />
        <details><summary>{m("moreActions")}</summary>
        {field(m("category"), m("categoryHelp"), <Select aria-label={m("category")} value={entry.mapCategory ?? ""} disabled={pending > 0} onChange={(e) => { const category = e.target.value || null; void enqueue(() => props.onCategory(entry.id, category, history)); }}><option value="">{m("categoryAuto")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>)}
        <small className="lm-recognition">{m((selected.confidence ?? "uncertain") as MapKey)} · {categories.find((c) => c.id === selected.categoryId)?.title}</small>
        {selected.matches?.length ? <small>{m("evidence")}: {selected.matches.slice(0, 5).join(", ")}</small> : null}
        <button className="button secondary" onClick={editSelected}>{m("fullEditor")}</button></details>
        <button className="button secondary" onClick={() => { setConnectFrom(selected.id); setLinkMessage(null); }}>{m("connect")}</button>
      </div>}
      {selected.kind === "branch" && <details className="lm-section"><summary>{m("branchSettings")}</summary>
        <button className="lm-text-button" onClick={() => { setRenaming(!renaming); setRenameValue(selected.title); }}>{m("rename")}</button>
        {renaming && <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) storeLayout({ ...layoutRef.current, categoryNames: { ...layoutRef.current.categoryNames, [selected.recordId]: renameValue.trim() } }); setRenaming(false); }}>
          <input aria-label={m("branchName")} maxLength={80} required value={renameValue} onChange={(e) => setRenameValue(e.target.value)} /><button className="button primary small" type="submit">{m("renameSave")}</button>
        </form>}
        {isCustom && field(m("reparent"), m("branchHint"), <Select aria-label={m("reparent")} value={layout.customCategories.find((c) => c.id === selected.recordId)?.parentId ?? ""} onChange={(e) => {
          const parentId = e.target.value || null;
          storeLayout({ ...layoutRef.current, customCategories: layoutRef.current.customCategories.map((c) => c.id === selected.recordId ? { ...c, parentId } : c) });
        }}><option value="">{m("worldRoot")}</option>{categories.filter((c) => c.id !== selected.recordId && !loreAncestors(graph, "branch:" + c.id).includes(selected.id)).map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}</Select>)}
        {isCustom && <button className="button secondary small danger" disabled={pending > 0} onClick={() => { if (!props.confirmDeletions || window.confirm(m("deleteBranchQuestion"))) void enqueue(async () => { const next = await props.onDeleteBranch(selected.recordId, history); layoutRef.current = next; setLayout(next); setSelectedId(graph.nodes[0]!.id); }); }}>{m("deleteBranch")}</button>}
      </details>}
      {["branch", "character", "location", "group", "book"].includes(selected.kind) && <section className="lm-section lm-branch-memory" aria-label={m("branchMemory")}>
        <h4>{m("branchMemory")} · {branchEntries.length}</h4><p className="lm-muted">{m("branchHint")}</p><button className="button primary" onClick={createEntry}>{m("addHere")}</button>
        <div className="lm-mode-summary">{(["always", "smart", "manual"] as const).map((mode) => <span key={mode}>{assistantText(props.locale, mode)}: {branchEntries.filter((entry) => entry.activation === mode).length}</span>)}</div>
        {!branchEntries.length ? <p>{m("empty")}</p> : <>
          <input aria-label={m("branchSearch")} placeholder={m("branchSearch")} value={branchQuery} onChange={(e) => { setBranchQuery(e.target.value); setBranchLimit(20); }} />
          <div className="lm-branch-entries">{matchingBranchEntries.slice(0, branchLimit).map((record) => <article key={record.id} data-mode={record.activation}>
            <button className="lm-entry-read" onClick={() => { const node = nodes.get("entry:" + record.id); if (node) choose(node); }}>{nodes.get("entry:" + record.id)?.title ?? record.title}<ChevronRight size={14} /></button>
            {!record.enabled && <small>{m("entryDisabled")}</small>}
            {props.selection?.entries.some((item) => item.entry.id === record.id) && <small className="lm-entry-selected">{m("inChatContext")}</small>}
            {props.onActivation && <Select aria-label={assistantText(props.locale, "mode") + ": " + record.title} value={record.activation} disabled={pending > 0} onChange={(e) => { const mode = e.target.value as ActivationMode; void enqueue(() => props.onActivation!(record, mode, history)); }}>{(["always", "smart", "manual"] as const).map((mode) => <option key={mode} value={mode}>{assistantText(props.locale, mode)}</option>)}</Select>}
          </article>)}</div>
          {!matchingBranchEntries.length && <p>{t("mapNoResults")}</p>}
          {matchingBranchEntries.length > branchLimit && <button className="button secondary small" onClick={() => setBranchLimit((limit) => limit + 20)}>{m("showMore")}</button>}
          {selected.kind === "branch" && props.onBranchActivation && <details className="lm-bulk-modes"><summary>{m("bulkModes")}</summary><p>{m("bulkModesHelp")}</p><Select aria-label={m("branchMode")} value={branchMode} disabled={pending > 0} onChange={(e) => setBranchMode(e.target.value as ActivationMode)}>{(["always", "smart", "manual"] as const).map((mode) => <option key={mode} value={mode}>{assistantText(props.locale, mode)}</option>)}</Select><button className="button secondary small" disabled={pending > 0 || branchEntries.every((entry) => entry.activation === branchMode)} onClick={() => {
            const question = m("bulkModesQuestion").replace("{count}", String(branchEntries.length)).replace("{mode}", assistantText(props.locale, branchMode));
            if (window.confirm(question)) void enqueue(() => props.onBranchActivation!(branchEntries, branchMode, history, selected.id));
          }}>{m("applyBranchMode")} · {branchEntries.length}</button></details>}
        </>}
      </section>}
      {selected.inferredToken && <details className="lm-section lm-inference"><summary>{m("confirmPerson")}</summary><p>{m("inferredHelp")}</p>
        <form onSubmit={(e) => { e.preventDefault(); if (!personName.trim() || !personEntries.length) return; void enqueue(async () => { const id = await props.onPerson(personName.trim(), selected.inferredToken!, personEntries); setSelectedId("character:" + id); setCollapsedIds((ids) => ids.filter((value) => value !== "branch:characters")); }); }}>
          <input aria-label={m("personName")} maxLength={100} required value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <div className="lm-person-entries">{selected.inferredEntryIds?.map((id) => <label key={id}><input type="checkbox" checked={personEntries.includes(id)} onChange={(e) => setPersonEntries(e.target.checked ? [...personEntries, id] : personEntries.filter((item) => item !== id))} /><span>{props.entries.find((e) => e.id === id)?.title.replaceAll("_", " ")}</span></label>)}</div>
          <button disabled={pending > 0 || !personEntries.length} className="button primary" type="submit">{m("confirmPerson")} · {personEntries.length}</button>
        </form></details>}
      {selected.kind !== "branch" && selected.kind !== "entry" && <button className="button primary" onClick={editSelected}>{m("edit")}</button>}
      {selected.content && !entry && <details className="lm-content" open><summary>{t("mapEntry")}</summary><p>{selected.content}</p></details>}
      {selected.kind !== "world" && <div className="lm-section">
        <div className="lm-detail-heading"><h4>{t("entryLinks")}</h4></div>
        {connections.length ? <><button className="lm-text-button" onClick={revealNeighbours}>{m("reveal")}</button><div className="lm-connections">{connections.map((edge) => { const other = nodes.get(edge.from === selected.id ? edge.to : edge.from)!; return <article key={edge.id}><button onClick={() => reveal(other.id)}><small>{edge.label || t("linkedMemory")} · {edge.kind === "context" ? m("context") : edge.kind === "reference" ? m("reference") : t("entities")}</small><span>{edge.from === selected.id ? "→" : "←"} {other.title}</span></button>
          {(edge.kind === "context" || edge.kind === "reference") && <div className="lm-connection-actions"><button onClick={() => startConnection(nodes.get(edge.from)!.recordId, nodes.get(edge.to)!.recordId)}>{m("linkEdit")}</button><button disabled={pending > 0} onClick={() => { if (!props.confirmDeletions || window.confirm(m("linkRemoveQuestion"))) void enqueue(() => props.onLink(nodes.get(edge.from)!.recordId, nodes.get(edge.to)!.recordId, null, history)); }}>{m("linkRemove")}</button></div>}
        </article>; })}</div></> : <p className="lm-muted">{m("noLinks")}</p>}
      </div>}
      {suggestions.length > 0 && <details className="lm-section"><summary>{m("proposals")} · {suggestions.length}</summary><p className="lm-muted">{m("proposalsHint")}</p>{suggestions.map((proposal) => <button key={proposal.entry.id} className="lm-suggestion" onClick={() => startConnection(entry!.id, proposal.entry.id)}><strong>{proposal.entry.title.replaceAll("_", " ")}</strong><small>{m(proposal.reason)}: {proposal.evidence.join(", ")}</small><span>+ {m("connection")}</span></button>)}</details>}
      <details className="lm-advanced"><summary>{t("advanced")}</summary><button className="button secondary small" onClick={() => { if (window.confirm(m("resetQuestion"))) { storeLayout({ ...layoutRef.current, positions: {} }); setCollapsedIds([]); setSelectedId(model.nodes[0]!.id); centerOverview(model); } }}><RotateCcw size={14} />{m("layoutReset")}</button></details>
      </>}
    </aside>}
    {newBranch && <section className="lm-floating-form" style={popupStyle} aria-label={m("newBranch")}><div className="lm-detail-heading"><h3>{m("newBranch")}</h3><button onClick={() => setNewBranch(false)} aria-label={m("cancel")}><X size={16} /></button></div><form onSubmit={addBranch}>
      {field(m("branchName"), m("branchHint"), <input aria-label={m("branchName")} maxLength={80} required value={branchName} onChange={(e) => setBranchName(e.target.value)} autoFocus />)}
      {field(m("branchParent"), m("branchHint"), <Select aria-label={m("branchParent")} value={branchParent} onChange={(e) => setBranchParent(e.target.value)}><option value="">{m("worldRoot")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>)}
      <button className="button primary" disabled={pending > 0 || !branchName.trim()} type="submit">{m("branchSave")}</button>
    </form></section>}
    {connection && <section className="lm-floating-form" style={(() => { const target = nodes.get(connection.targetNode) ?? selected; return mapPopover({ x: target.x * camera.zoom + camera.x, y: target.y * camera.zoom + camera.y, halfWidth: 135 * camera.zoom }, viewportSize); })()} aria-label={m("connection")}><div className="lm-detail-heading"><h3>{m("connection")}</h3><button onClick={() => setConnection(null)} aria-label={m("cancel")}><X size={16} /></button></div>
      <p><strong>{nodes.get(connection.sourceNode)?.title}</strong> → <strong>{nodes.get(connection.targetNode)?.title}</strong></p><p className="lm-muted">{m("linkReview")}</p>
      <form onSubmit={(e) => { e.preventDefault(); const value = connection; if (!value.from || !value.to || value.from === value.to || !connectionSources.includes(value.from) || !connectionTargets.includes(value.to)) return; void enqueue(async () => { await props.onLink(value.from, value.to, { label: value.label.trim(), mode: value.mode }, history); setConnection(null); }); }}>
        {connectionSources.length !== 1 || connectionTargets.length !== 1 ? <><p>{m("branchLinkHint")}</p>{(["from", "to"] as const).map((side) => <label className="lm-field" key={side}>{m(side === "from" ? "linkFrom" : "linkTo")}<Select value={connection[side]} onChange={(event) => { const next = { ...connection, [side]: event.target.value }; const old = props.entries.find((entry) => entry.id === next.from)?.links?.find((link) => link.targetId === next.to); setConnection({ ...next, label: old?.label ?? "", mode: old?.mode ?? "reference" }); }}><option value="">{m("chooseEntry")}</option>{(side === "from" ? connectionSources : connectionTargets).map((id) => <option value={id} key={id}>{props.entries.find((entry) => entry.id === id)?.title.replaceAll("_", " ")}</option>)}</Select></label>)}</> : null}
        {(!connectionSources.length || !connectionTargets.length) && <p role="status">{m("emptyLink")}</p>}
        {connection.from && connection.from === connection.to && <p role="status">{m("sameLink")}</p>}
        {connection.from && connection.to && connection.from !== connection.to && <p className="lm-link-pair">{props.entries.find((entry) => entry.id === connection.from)?.title.replaceAll("_", " ")} → {props.entries.find((entry) => entry.id === connection.to)?.title.replaceAll("_", " ")}</p>}
        {field(m("label"), m("labelHint"), <input aria-label={m("label")} placeholder={m("labelHint")} maxLength={160} value={connection.label} onChange={(e) => setConnection({ ...connection, label: e.target.value })} autoFocus />)}
        {field(m("mode"), m("modeHelp"), <Select aria-label={m("mode")} value={connection.mode} onChange={(e) => setConnection({ ...connection, mode: e.target.value as Connection["mode"] })}><option value="reference">{m("reference")}</option><option value="context">{m("context")}</option></Select>)}
        <p className="lm-link-effect" role="status">{m(connection.mode === "context" ? "contextEffect" : "referenceEffect")}</p><p className="lm-muted">{m("linkHint")}</p><div className="lm-editor-actions"><button className="button primary" disabled={pending > 0 || !connection.from || !connection.to || connection.from === connection.to || !connectionSources.includes(connection.from) || !connectionTargets.includes(connection.to)} type="submit">{m("linkSave")}</button><button type="button" className="button secondary" onClick={() => setConnection(null)}>{m("cancel")}</button></div>
      </form></section>}
    </div>
    <footer><span>{m("controls")}</span></footer>
  </section>;
}
