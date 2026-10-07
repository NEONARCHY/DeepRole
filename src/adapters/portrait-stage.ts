import { characterCast, characterHighlights, characterInterlocutors, characterText, emotionLabel, syncPortraitImage } from "../core/characters";
import { resolveCharacterEmotion } from "../core/character-emotions";
import { clamp, portraitBounds, portraitPose } from "../core/portrait-layout";
import type { CharacterScene, Locale, PortraitLayout, PortraitPose, SceneEntity } from "../core/types";
import portraitStyle from "./portrait-stage.css?raw";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";
import { openPortraitViewer, photoCopy } from "./portrait-viewer";
import { validPortrait } from "../core/portrait-variations";
import { scenePortraitIndex } from "../core/portrait-variations";
import { fitScene } from "../core/adaptive-layout";
import { sceneAvailableLeft, widgetDeck, widgetRects } from "./adaptive-layout";
import { nearestWidgetSpace } from "../core/widget-spacing";
import { composerBounds, fitPinnedChoices, pinnedSceneFit, inlineSceneFit } from "./pinned-choices";

export interface PortraitStageOptions {
  scope: string;
  layout?: PortraitLayout;
  resetAt?: number;
  pinSceneChoices?: boolean;
  pinLeft?: boolean;
  pinRight?: boolean;
  adaptiveLayout?: boolean;
  onSave: (entityId: string | null, pose: PortraitPose | null) => Promise<void>;
}
type Widget = { slot: HTMLElement; box: HTMLElement; move: HTMLButtonElement; resize: HTMLButtonElement; open: HTMLButtonElement; zoom: HTMLButtonElement; pose?: PortraitPose; restingPose?: PortraitPose; statsKey?: string };
type Stage = { anchor: HTMLElement; overlay: HTMLElement; frame: HTMLElement; toolbar: HTMLElement; hint: HTMLElement; status: HTMLElement; reset: HTMLButtonElement; widgets: Map<string, Widget>; options?: PortraitStageOptions; locale: Locale; scope: string; heroId?: string; partnerIds: Set<string>; groupKey?: string; grouped?: boolean; busy: boolean; dragging: boolean; draggingId?: string; placementKey?: string; needsRedock?: boolean; observer: ResizeObserver; onResize: () => void; disposed: boolean };
const stages = new WeakMap<HTMLElement, Stage>();
const activeStages = new Set<Stage>();
let statsId = 0;
const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
const attr = (node: HTMLElement, key: string, value: string) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value); };
const css = (node: HTMLElement, key: string, value: string) => { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); };
const PORTRAIT_CHOICE_GAP = 24;
const PORTRAIT_PEER_GAP = 6;

function clearAdaptive(stage: Stage) {
  if (!stage.anchor.hasAttribute("data-adaptive-portraits")) return;
  stage.anchor.removeAttribute("data-adaptive-portraits");
  stage.anchor.removeAttribute("data-pinned-portrait-reserve");
  stage.anchor.removeAttribute("data-pinned-portrait-count");
  for (const key of ["width", "left", "margin-left", "padding-top"]) css(stage.anchor, key, "");
  const section = stage.anchor.shadowRoot?.querySelector<HTMLElement>("section");
  if (section) css(section, "max-height", "");
  stage.frame.removeAttribute("data-adaptive-compact");
  for (const key of ["left", "top", "width", "height"]) css(stage.frame, key, "");
}

/** A shared lane fits the options and portraits; constrained lanes use a scrollable portrait strip. */
function arrangeAdaptive(stage: Stage, width: number, height: number): boolean {
  if (!stage.options?.adaptiveLayout) return false;
  if (stage.dragging) {
    const widget = stage.widgets.get(stage.draggingId ?? "");
    if (widget?.pose) {
      const bounds = portraitBounds(widget.pose, width - 16, height - 16);
      css(widget.box, "width", `${bounds.width}px`);
      css(widget.box, "left", `${clamp(bounds.x, 8, width - bounds.width - 8)}px`);
      css(widget.box, "top", `${clamp(bounds.y, 8, height - widget.box.offsetHeight - 8)}px`);
    }
    stage.placementKey = undefined;
    return true;
  }
  if (!stage.anchor.isConnected) return true;
  const host = stage.anchor;
  const section = host.shadowRoot!.querySelector<HTMLElement>("section")!;
  const parent = host.parentElement!.getBoundingClientRect();
  const parentStyle = host.ownerDocument.defaultView!.getComputedStyle(host.parentElement!);
  const contentLeft = parent.left + (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.borderLeftWidth) || 0);
  const left = sceneAvailableLeft(host.ownerDocument);
  const center = stage.options.pinSceneChoices ? (left + width - 8) / 2 : parent.left + parent.width / 2;
  const fitted = stage.options.pinSceneChoices ? pinnedSceneFit(host.ownerDocument, stage.widgets.size)
    : composerBounds(host.ownerDocument, true) ? inlineSceneFit(host.ownerDocument, stage.widgets.size) : fitScene(width, left, center, stage.widgets.size);
  const trayHeight = height < 560 ? 70 : 104;
  const dock = widgetDeck(host.ownerDocument)?.querySelector<HTMLElement>(".dr-widget-dock")?.getBoundingClientRect();
  const laneKey = JSON.stringify([width, height, left, parent.left, parent.width, fitted.compact, fitted.x, fitted.choices, fitted.portrait, stage.heroId, [...stage.partnerIds], [...stage.widgets].map(([id, widget]) => [id, widget.pose, widget.statsKey]), stage.options.pinSceneChoices, stage.options.pinLeft, stage.options.pinRight, stage.options.pinSceneChoices ? host.style.bottom : null]);
  const changed = stage.placementKey !== laneKey;
  stage.placementKey = laneKey;
  host.dataset.adaptivePortraits = "true";
  host.dataset.pinnedPortraitCount = String(stage.widgets.size);
  css(host, "width", `${fitted.choices}px`);
  css(host, "left", stage.options.pinSceneChoices ? `${fitted.x + fitted.choices / 2}px` : "");
  css(host, "margin-left", stage.options.pinSceneChoices ? "0px" : `${fitted.x - contentLeft}px`);
  css(host, "padding-top", fitted.compact && !stage.options.pinSceneChoices ? `${trayHeight + 8}px` : "");
  css(section, "padding-top", "");
  host.dataset.pinnedPortraitReserve = String(fitted.compact ? trayHeight + 8 + Math.max(0, (dock?.bottom ?? 0) - 60) : 0);
  css(section, "max-height", "");
  fitPinnedChoices(host);
  const anchor = section.getBoundingClientRect();
  stage.frame.removeAttribute("data-pinned-compact");
  if (fitted.compact) {
    stage.frame.dataset.adaptiveCompact = "true";
    attr(stage.frame, "data-short", String(height < 560));
    if (changed || stage.options.pinSceneChoices || !stage.frame.style.top) {
      let top = clamp(anchor.top - trayHeight - 8, 8, height - trayHeight - 8);
      if (dock && dock.left < fitted.x + fitted.choices && dock.right > fitted.x && top < dock.bottom && top + trayHeight > dock.top) top = Math.min(height - trayHeight - 8, dock.bottom + 8);
      css(stage.frame, "left", `${fitted.x}px`); css(stage.frame, "top", `${top}px`);
    }
    css(stage.frame, "width", `${fitted.choices}px`); css(stage.frame, "height", `${trayHeight}px`);
    for (const [id, widget] of stage.widgets) {
      const ratio = id === stage.heroId || stage.partnerIds.has(id) ? 1 : .85;
      css(widget.box, "width", `${Math.round(fitted.portrait * ratio)}px`);
    }
    stage.grouped = false;
    return true;
  }
  stage.frame.removeAttribute("data-adaptive-compact");
  for (const key of ["left", "top", "width", "height"]) css(stage.frame, key, "");
  if (!changed && stage.grouped) return true;
  // Height is measured after widths change, so silent characters share the baseline.
  const widgets = [...stage.widgets.entries()];
  const heroId = stage.heroId ?? widgets[0]?.[0];
  for (const [id, widget] of widgets) css(widget.box, "width", `${Math.round(fitted.portrait * (id === heroId || stage.partnerIds.has(id) ? 1 : .85))}px`);
  const tallest = Math.max(...widgets.map(([, widget]) => widget.box.offsetHeight));
  const availableBottom = stage.options.pinSceneChoices ? (composerBounds(host.ownerDocument)?.top ?? height) - 12 : height - 8;
  const baseline = clamp(anchor.top, 8, availableBottom - tallest) + tallest;
  let rightX = anchor.right + PORTRAIT_CHOICE_GAP;
  for (const [id, widget] of widgets) {
    const x = id === heroId ? anchor.left - PORTRAIT_CHOICE_GAP - widget.box.offsetWidth : rightX;
    const y = baseline - widget.box.offsetHeight;
    css(widget.box, "left", `${x}px`); css(widget.box, "top", `${y}px`);
    css(widget.resize, "top", `${Math.max(0, widget.open.querySelector("img")!.offsetHeight - 44)}px`);
    widget.restingPose = portraitPose(x, y, widget.box.offsetWidth, width - 16, height - 16);
    if (id !== heroId) rightX += widget.box.offsetWidth + PORTRAIT_PEER_GAP;
  }
  // Honor manual poses where they fit, while keeping other cards and controls clear.
  for (const [id, widget] of widgets) {
    const pinned = stage.options.pinSceneChoices || (id === heroId ? stage.options.pinLeft : stage.options.pinRight);
    if (!widget.pose || pinned) continue;
    const saved = portraitBounds(widget.pose, width - 16, height - 16);
    const obstacles = [anchor, ...widgetRects(host.ownerDocument), ...widgets.filter(([otherId]) => otherId !== id).map(([, other]) => other.box.getBoundingClientRect())].map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    const safe = nearestWidgetSpace({ x: saved.x, y: saved.y, width: widget.box.offsetWidth, height: widget.box.offsetHeight }, obstacles, { width, height }, 8, 8);
    if (safe) { css(widget.box, "left", `${safe.x}px`); css(widget.box, "top", `${safe.y}px`); }
  }
  stage.grouped = true;
  return true;
}

/** Default cast: protagonist left; speakers first on the right, then quieter bystanders. */
function arrangeCastGroup(stage: Stage, anchor: DOMRect, width: number, height: number, preferredWidth: number): boolean {
  const hero = stage.heroId ? stage.widgets.get(stage.heroId) : undefined;
  const others = [...stage.widgets].filter(([id]) => id !== stage.heroId);
  const leftRoom = anchor.left - PORTRAIT_CHOICE_GAP - 8;
  const rightRoom = width - anchor.right - PORTRAIT_CHOICE_GAP - 8;
  if (!hero || !others.length || leftRoom < 96 || rightRoom < 96) return false;
  const ratios = others.map(([id]) => stage.partnerIds.has(id) ? 1 : .85);
  const firstPair = ratios[0]! + (ratios[1] ?? 0);
  const pairWidth = others.length > 1 ? (rightRoom - PORTRAIT_PEER_GAP) / firstPair : rightRoom / ratios[0]!;
  const oneRowWidth = (rightRoom - (others.length - 1) * PORTRAIT_PEER_GAP) / ratios.reduce((sum, ratio) => sum + ratio, 0);
  const fullWidth = Math.max(96, Math.min(preferredWidth, oneRowWidth >= 96 ? oneRowWidth : pairWidth));
  const sized = others.map(([id, widget], index) => ({ id, widget, width: Math.round(fullWidth * ratios[index]!) }));
  if (sized.some(item => item.width < 96 || item.width > rightRoom)) return false;
  css(hero.box, "width", `${Math.min(preferredWidth, leftRoom)}px`);
  for (const item of sized) css(item.widget.box, "width", `${item.width}px`);
  const rows: typeof sized[] = [];
  for (const item of sized) {
    let row = rows.at(-1);
    const used = row?.reduce((sum, entry) => sum + entry.width, 0) ?? 0;
    if (!row || used + (row.length ? row.length * PORTRAIT_PEER_GAP : 0) + item.width > rightRoom) { row = []; rows.push(row); }
    row.push(item);
  }
  const heights = rows.map((row, index) => Math.max(index === 0 ? hero.box.offsetHeight : 0, ...row.map(item => item.widget.box.offsetHeight)));
  const totalHeight = heights.reduce((sum, value) => sum + value, 0) + (rows.length - 1) * PORTRAIT_PEER_GAP;
  // In an extremely crowded viewport the older multi-column fallback keeps
  // everyone reachable instead of pushing the last characters off-screen.
  if (totalHeight > height - 16) return false;
  const top = clamp(anchor.top, 8, height - totalHeight - 8);
  let rowTop = top;
  for (const [index, row] of rows.entries()) {
    const baseline = rowTop + heights[index]!;
    let x = anchor.right + PORTRAIT_CHOICE_GAP;
    for (const item of row) {
      const y = baseline - item.widget.box.offsetHeight;
      css(item.widget.box, "left", `${x}px`); css(item.widget.box, "top", `${y}px`);
      item.widget.restingPose = portraitPose(x, y, item.width, width - 16, height - 16);
      css(item.widget.resize, "top", `${Math.max(0, item.widget.open.querySelector("img")!.offsetHeight - 44)}px`);
      x += item.width + PORTRAIT_PEER_GAP;
    }
    rowTop = baseline + PORTRAIT_PEER_GAP;
  }
  const heroWidth = Math.min(preferredWidth, leftRoom);
  const heroX = anchor.left - PORTRAIT_CHOICE_GAP - heroWidth;
  const heroY = top + heights[0]! - hero.box.offsetHeight;
  css(hero.box, "left", `${heroX}px`); css(hero.box, "top", `${heroY}px`);
  hero.restingPose = portraitPose(heroX, heroY, heroWidth, width - 16, height - 16);
  css(hero.resize, "top", `${Math.max(0, hero.open.querySelector("img")!.offsetHeight - 44)}px`);
  return true;
}

function arrangeCompactPinned(stage: Stage, anchor: DOMRect, width: number, height: number): boolean {
  if (!stage.options?.pinSceneChoices || width >= 700 || stage.widgets.size > 4 || !stage.widgets.size) return false;
  const widgets = [...stage.widgets.values()];
  const gap = 6;
  const itemWidth = Math.min(76, Math.floor((width - 16 - gap * (widgets.length - 1)) / widgets.length));
  if (itemWidth < 52) return false;
  stage.frame.dataset.pinnedCompact = "true";
  const startX = Math.round((width - itemWidth * widgets.length - gap * (widgets.length - 1)) / 2);
  for (const widget of widgets) css(widget.box, "width", `${itemWidth}px`);
  const top = clamp(anchor.top - Math.max(...widgets.map(widget => widget.box.offsetHeight)) - 8, 8, height - 80);
  widgets.forEach((widget, index) => {
    const x = startX + index * (itemWidth + gap);
    css(widget.box, "left", `${x}px`); css(widget.box, "top", `${top}px`);
    widget.restingPose = portraitPose(x, top, itemWidth, width - 16, height - 16);
    css(widget.resize, "top", "2px");
  });
  stage.grouped = false;
  return true;
}

function arrange(stage: Stage) {
  const width = stage.overlay.clientWidth;
  const height = stage.overlay.clientHeight;
  if (!width || !height) return;
  if (arrangeAdaptive(stage, width, height)) return;
  clearAdaptive(stage);
  fitPinnedChoices(stage.anchor);
  const anchor = (stage.anchor.shadowRoot?.querySelector("section") ?? stage.anchor).getBoundingClientRect();
  const section = stage.anchor.shadowRoot?.querySelector<HTMLElement>("section");
  if (!stage.dragging && arrangeCompactPinned(stage, anchor, width, height)) { if (section) section.style.paddingTop = ""; return; }
  stage.frame.removeAttribute("data-pinned-compact");
  // Vertical scrolling must not continuously re-anchor fixed portraits.
  // Reposition only after a real layout/viewport change or an active drag.
  const placementKey = JSON.stringify([width, height, anchor.left, anchor.width, stage.options?.pinSceneChoices ? anchor.top : null, stage.options?.pinSceneChoices, stage.options?.pinLeft, stage.options?.pinRight]);
  const placementChanged = stage.placementKey !== placementKey;
  stage.placementKey = placementKey;
  const groupKey = JSON.stringify([stage.heroId, [...stage.widgets].map(([id, widget]) => [id, widget.box.offsetHeight]), [...stage.partnerIds]]);
  const groupChanged = stage.groupKey !== groupKey; stage.groupKey = groupKey;
  const anchorVisible = anchor.bottom > 0 && anchor.top < height - 100;
  if ((placementChanged || groupChanged) && !anchorVisible) stage.needsRedock = true;
  const shouldRedock = placementChanged || groupChanged || (anchorVisible && stage.needsRedock);
  if (anchorVisible) stage.needsRedock = false;
  const rows = Math.max(1, Math.ceil(stage.widgets.size / 2));
  const defaultWidth = clamp(Math.min(192, (height / Math.min(rows, 4) - 128) * .75, width < 600 ? 120 : 192), 96, 192);
  const allDefault = [...stage.widgets.values()].every(widget => !widget.pose);
  if (stage.grouped && !anchorVisible && !stage.dragging) return;
  if ((allDefault || stage.options?.pinSceneChoices) && !stage.dragging && anchorVisible && (shouldRedock || !stage.grouped)) {
    stage.grouped = arrangeCastGroup(stage, anchor, width, height, defaultWidth);
    if (stage.grouped) { if (section) section.style.paddingTop = ""; return; }
  } else if (stage.grouped && !shouldRedock && (allDefault || stage.options?.pinSceneChoices) && !stage.dragging) return;
  if ((!allDefault && !stage.options?.pinSceneChoices) || stage.dragging) stage.grouped = false;
  const rowHeight = defaultWidth * 4 / 3 + 160;
  const visibleRows = Math.max(1, Math.floor((height - 16) / rowHeight));
  const columns = Math.max(2, Math.ceil(stage.widgets.size / visibleRows));
  const sideWidth = Math.ceil(columns / 2) * (defaultWidth + PORTRAIT_CHOICE_GAP) + 8;
  const outsideFits = anchor.left >= sideWidth && width - anchor.right >= sideWidth;
  const inlineWidth = Math.min(defaultWidth, Math.max(72, (anchor.width - 48) / 2));
  const estimatedLeft = [...stage.widgets.values()].filter((widget, index) => widget.pose?.dock === "left" || !widget.pose?.dock && index % 2 === 0).length;
  const estimatedRight = stage.widgets.size - estimatedLeft;
  if (section) section.style.paddingTop = outsideFits ? "" : `${Math.ceil(Math.max(estimatedLeft, estimatedRight) * (inlineWidth * 4 / 3 + 112) + 12)}px`;
  const startY = clamp(anchor.top, 8, height - Math.min(rows, visibleRows) * rowHeight - 8);
  const dockStartY = clamp(anchor.top, 8, height - Math.min(Math.max(estimatedLeft, estimatedRight), visibleRows) * rowHeight - 8);
  let index = 0;
  const dockCounts = { left: 0, right: 0 };
  for (const widget of stage.widgets.values()) {
    const side = index % 2 === 0 ? "left" : "right";
    const pairedCapacity = Math.floor(columns / 2) * 2 * visibleRows;
    const center = columns % 2 === 1 && index >= pairedCapacity;
    const row = center ? index - pairedCapacity : Math.floor(index / 2) % visibleRows;
    const band = Math.floor(index++ / (visibleRows * 2));
    const column = center ? Math.floor(columns / 2) : side === "left" ? band : columns - 1 - band;
    const defaultX = outsideFits ? side === "left" ? anchor.left - (band + 1) * (defaultWidth + PORTRAIT_CHOICE_GAP) : anchor.right + PORTRAIT_CHOICE_GAP + band * (defaultWidth + PORTRAIT_CHOICE_GAP)
      : columns > 2 ? 8 + column * (width - defaultWidth - 16) / (columns - 1) : side === "left" ? anchor.left - defaultWidth - 16 : anchor.right + 16;
    const saved = widget.pose ? portraitBounds(widget.pose, width - 16, height - 16) : null;
    const collidesWithChoices = saved && saved.x < anchor.right && saved.x + saved.width > anchor.left && saved.y < anchor.bottom && saved.y + saved.width * 4 / 3 + 70 > anchor.top;
    const keepResting = !stage.dragging && !shouldRedock && !!widget.restingPose;
    const pinnedSide = widget === stage.widgets.get(stage.heroId ?? "") ? stage.options?.pinLeft : stage.options?.pinRight;
    const dock = !keepResting && anchorVisible ? pinnedSide || stage.options?.pinSceneChoices ? side : widget.pose?.dock ?? (collidesWithChoices ? side : widget.pose ? null : side) : null;
    const dockRow = dock ? dockCounts[dock]++ : 0;
    const dockWidth = outsideFits ? defaultWidth : inlineWidth;
    const dockX = outsideFits ? dock === "left" ? anchor.left - (dockWidth + PORTRAIT_CHOICE_GAP) * (dockRow >= visibleRows ? Math.floor(dockRow / visibleRows) + 1 : 1) : anchor.right + PORTRAIT_CHOICE_GAP + (dockRow >= visibleRows ? Math.floor(dockRow / visibleRows) : 0) * (dockWidth + PORTRAIT_CHOICE_GAP)
      : dock === "left" ? anchor.left + 12 : anchor.right - dockWidth - 12;
    const dockY = outsideFits ? dockStartY + (dockRow % visibleRows) * rowHeight : anchor.top + 12 + dockRow * (inlineWidth * 4 / 3 + 112);
    // A dock is a placement gesture, not a tether to the scrolling answer.
    // Once the choices leave the viewport, keep the last on-screen position.
    const resting = (keepResting || !anchorVisible) && widget.restingPose ? portraitBounds(widget.restingPose, width - 16, height - 16) : null;
    const bounds = dock ? { width: dockWidth, x: dockX, y: dockY } : resting ?? saved ?? { width: defaultWidth, x: defaultX, y: startY + row * rowHeight };
    // Legacy poses used chat coordinates. Convert for display only, without rewriting stored data.
    if (!dock && widget.pose && widget.pose.space !== "viewport") {
      const legacy = portraitBounds(widget.pose, anchor.width);
      bounds.x = anchor.left + legacy.x; bounds.y = anchor.top + legacy.y;
    }
    const x = clamp(bounds.x, 8, width - bounds.width - 8);
    const y = clamp(bounds.y, 8, height - widget.box.offsetHeight - 8);
    css(widget.box, "width", `${bounds.width}px`);
    css(widget.box, "left", `${x}px`);
    css(widget.box, "top", `${y}px`);
    if (dock) widget.restingPose = portraitPose(x, y, bounds.width, width - 16, height - 16);
    else if (stage.dragging && anchorVisible) widget.restingPose = undefined;
    css(widget.resize, "top", `${Math.max(0, widget.open.querySelector("img")!.offsetHeight - 44)}px`);
  }
}

function nearbyDock(stage: Stage, x: number, y: number, width: number): "left" | "right" | undefined {
  const anchor = (stage.anchor.shadowRoot?.querySelector("section") ?? stage.anchor).getBoundingClientRect();
  if (y < anchor.top - 100 || y > anchor.top + 130) return undefined;
  const center = x + width / 2;
  if (Math.abs(center - anchor.left) < 105) return "left";
  if (Math.abs(center - anchor.right) < 105) return "right";
  return undefined;
}

function dispose(stage: Stage) {
  stage.disposed = true; stage.observer.disconnect();
  stage.anchor.ownerDocument.defaultView?.removeEventListener("resize", stage.onResize);
  stage.anchor.ownerDocument.defaultView?.removeEventListener("scroll", stage.onResize, true);
  stage.anchor.ownerDocument.defaultView?.removeEventListener("deeprole-layout-change", stage.onResize);
  stage.anchor.ownerDocument.defaultView?.removeEventListener("deeprole-pinned-layout", stage.onResize);
  stage.anchor.ownerDocument.defaultView?.removeEventListener("deeprole-inline-layout", stage.onResize);
  clearAdaptive(stage);
  stage.overlay.remove(); stage.toolbar.remove();
  const section = stage.anchor.shadowRoot?.querySelector<HTMLElement>("section");
  section?.classList.remove("dr-cast-content"); if (section) section.style.paddingTop = "";
  stages.delete(stage.anchor); activeStages.delete(stage);
}

async function persist(stage: Stage, id: string | null, pose: PortraitPose | null, rollback: () => void) {
  if (!stage.options || stage.disposed) return;
  stage.busy = true; stage.reset.disabled = true;
  stage.status.textContent = characterText(stage.locale, "layoutSaving");
  try {
    await stage.options.onSave(id, pose);
    stage.status.textContent = characterText(stage.locale, "layoutSaved");
  } catch {
    rollback(); arrange(stage);
    stage.status.textContent = characterText(stage.locale, "layoutFailed");
  } finally { stage.busy = false; stage.reset.disabled = false; }
}

function manipulate(stage: Stage, widget: Widget, id: string, control: HTMLButtonElement, resize: boolean) {
  let gesture: { pointer: number; x: number; y: number; startX: number; startY: number; width: number; previous?: PortraitPose; changed: boolean } | undefined;
  const finish = (cancel: boolean) => {
    if (!gesture) return;
    const completed = gesture; gesture = undefined; stage.dragging = false; stage.draggingId = undefined;
    control.classList.remove("is-dragging");
    if (control.hasPointerCapture(completed.pointer)) control.releasePointerCapture(completed.pointer);
    if (cancel) { widget.pose = completed.previous; arrange(stage); return; }
    if (completed.changed && widget.pose) void persist(stage, id, { ...widget.pose }, () => { widget.pose = completed.previous; });
    else { widget.pose = completed.previous; arrange(stage); }
  };
  control.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || gesture || stage.busy || stage.dragging) return;
    const rect = widget.box.getBoundingClientRect();
    gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: rect.left, startY: rect.top, width: rect.width, previous: widget.pose ? { ...widget.pose } : undefined, changed: false };
    stage.dragging = true; stage.draggingId = id; control.setPointerCapture(event.pointerId); control.classList.add("is-dragging"); control.focus(); event.preventDefault();
  });
  control.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !gesture.changed) return;
    gesture.changed = true;
    const width = resize ? clamp(gesture.width + (Math.abs(dx) >= Math.abs(dy * .75) ? dx : dy * .75), 96, 360) : gesture.width;
    widget.pose = portraitPose(gesture.startX + (resize ? 0 : dx), gesture.startY + (resize ? 0 : dy), width, stage.overlay.clientWidth - 16, stage.overlay.clientHeight - 16);
    if (!resize) widget.pose.dock = nearbyDock(stage, gesture.startX + dx, gesture.startY + dy, width);
    else if (gesture.previous?.dock) widget.pose.dock = gesture.previous.dock;
    arrange(stage); event.preventDefault();
  });
  control.addEventListener("pointerup", event => { if (event.pointerId === gesture?.pointer) finish(false); });
  control.addEventListener("pointercancel", () => finish(true));
  control.addEventListener("lostpointercapture", () => finish(true));
  control.addEventListener("keydown", event => {
    if (event.key === "Escape" && gesture) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
    if (!event.key.startsWith("Arrow") || stage.busy || stage.dragging) return;
    const rect = widget.box.getBoundingClientRect(); const previous = widget.pose ? { ...widget.pose } : undefined;
    const step = event.shiftKey ? 24 : 8;
    const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const dy = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    widget.pose = portraitPose(rect.left + (resize ? 0 : dx), rect.top + (resize ? 0 : dy), rect.width + (resize ? dx || dy : 0), stage.overlay.clientWidth - 16, stage.overlay.clientHeight - 16);
    if (resize && previous?.dock) widget.pose.dock = previous.dock;
    arrange(stage); event.preventDefault(); event.stopPropagation();
    void persist(stage, id, { ...widget.pose }, () => { widget.pose = previous; });
  });
}

export function syncPortraitStage(enabled: boolean, entities: SceneEntity[], scene: CharacterScene | undefined, locale: Locale, onOpen: (id: string) => void, root: ParentNode = document, options?: PortraitStageOptions) {
  const scope = options?.scope ?? "";
  const people = enabled ? characterCast(entities, scene) : [];
  for (const stage of activeStages) if (stage.scope !== scope || !people.length || !scope && !stage.anchor.isConnected) dispose(stage);
  if (!people.length) return;
  const hosts = [...root.querySelectorAll<HTMLElement>("[data-deeprole-choices-host]")];
  // Choices disappear as soon as a new request starts. Keep the body-level
  // portrait layer until the next reply, and reattach it to the next card.
  const detached = [...activeStages].filter(stage => !stage.anchor.isConnected && stage.scope === scope).map(stage => stage.anchor);
  for (const host of [...hosts, ...(!hosts.length ? detached : [])]) {
    const shadow = host.shadowRoot; const section = shadow?.querySelector("section");
    if (!shadow || !section) continue;
    if (!shadow.querySelector("[data-portrait-stage-style]")) { const style = host.ownerDocument.createElement("style"); style.dataset.portraitStageStyle = "true"; style.textContent = portraitStyle; shadow.append(style); }
    section.classList.add("dr-cast-content");
    let stage = stages.get(host);
    if (!stage) {
      stage = [...activeStages].find(candidate => !candidate.anchor.isConnected && candidate.scope === scope);
      if (stage) {
        stages.delete(stage.anchor);
        stage.observer.disconnect(); stage.observer.observe(stage.frame);
        stage.anchor = host; stage.toolbar.remove(); shadow.append(stage.toolbar);
        stage.placementKey = undefined; stage.needsRedock = true;
        stages.set(host, stage); stage.observer.observe(host);
      }
    }
    if (!stage) {
      const doc = host.ownerDocument;
      if (!shadow.querySelector("[data-portrait-stage-style]")) { const style = doc.createElement("style"); style.dataset.portraitStageStyle = "true"; style.textContent = portraitStyle; shadow.append(style); }
      const overlay = doc.createElement("div"); overlay.dataset.deeprolePortraitLayer = "true";
      const floating = overlay.attachShadow({ mode: "open" });
      const style = doc.createElement("style"); style.textContent = designTokens + portraitStyle;
      const frame = doc.createElement("div"); frame.className = "dr-cast-frame";
      floating.append(style, frame); doc.body.append(overlay);
      section.classList.add("dr-cast-content");
      const toolbar = doc.createElement("div"); toolbar.className = "dr-cast-toolbar";
      const hint = doc.createElement("p"); const reset = doc.createElement("button"); reset.type = "button";
      const status = doc.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.className = "dr-cast-layout-status";
      toolbar.append(hint, reset, status); shadow.append(toolbar);
      // The same layer can move to a new choices card after the next reply.
      // Keep resize/scroll listeners bound to the layer, not its former host.
      let currentStage: Stage | undefined;
      let framePending = false;
      const onResize = () => {
        if (framePending) return;
        framePending = true;
        doc.defaultView?.requestAnimationFrame(() => { framePending = false; if (currentStage && !currentStage.disposed) arrange(currentStage); });
      };
      const observer = new ResizeObserver(onResize);
      stage = { anchor: host, overlay, frame, toolbar, hint, reset, status, widgets: new Map(), options, locale, scope, partnerIds: new Set(), busy: false, dragging: false, observer, onResize, disposed: false };
      currentStage = stage;
      stages.set(host, stage); activeStages.add(stage); observer.observe(host); observer.observe(frame);
      doc.defaultView?.addEventListener("resize", onResize);
      doc.defaultView?.addEventListener("scroll", onResize, true);
      doc.defaultView?.addEventListener("deeprole-layout-change", onResize);
      doc.defaultView?.addEventListener("deeprole-pinned-layout", onResize);
      doc.defaultView?.addEventListener("deeprole-inline-layout", onResize);
      reset.addEventListener("click", () => {
        if (stage!.busy || stage!.dragging) return;
        const previous = new Map([...stage!.widgets].map(([id, widget]) => [id, widget.pose]));
        stage!.widgets.forEach(widget => { widget.pose = undefined; }); arrange(stage!);
        void persist(stage!, null, null, () => { stage!.widgets.forEach((widget, id) => { widget.pose = previous.get(id); }); });
      });
    }
    stage.options = options; stage.locale = locale;
    text(stage.hint, characterText(locale, "floatingHint")); text(stage.reset, characterText(locale, "layoutReset"));
    const partners = new Set(characterInterlocutors(entities, scene).map(person => person.id));
    const focused = stage.overlay.shadowRoot!.activeElement as HTMLElement | null;
    const hero = entities.find(entity => entity.characterSheet?.protagonist);
    stage.heroId = hero?.id; stage.partnerIds = partners;
    const other = people.find(entity => entity.id !== hero?.id);
    for (const [id, widget] of stage.widgets) if (!people.some(person => person.id === id)) { widget.slot.remove(); stage.widgets.delete(id); }
    for (const entity of people) {
      let widget = stage.widgets.get(entity.id);
      const side = entity.id === hero?.id ? "left" : entity.id === other?.id ? "right" : "extra";
      if (!widget) {
        const doc = host.ownerDocument; const slot = doc.createElement("div"); const box = doc.createElement("div"); box.className = "dr-cast-widget"; box.dataset.characterId = entity.id;
        const move = doc.createElement("button"); move.type = "button"; move.className = "dr-cast-move";
        const open = doc.createElement("button"); open.type = "button"; open.className = "dr-cast-portrait"; open.dataset.characterId = entity.id;
        const image = doc.createElement("img"); image.alt = ""; image.draggable = false;
        const name = doc.createElement("span"); name.className = "dr-cast-name";
        const mood = doc.createElement("small"); const role = doc.createElement("span"); role.className = "dr-cast-role";
        open.append(image, name, mood, role);
        const resize = doc.createElement("button"); resize.type = "button"; resize.className = "dr-cast-resize"; resize.textContent = "⤡";
        const zoom = doc.createElement("button"); zoom.type = "button"; zoom.className = "dr-cast-zoom"; zoom.textContent = "⤢";
        box.append(move, open, zoom, resize); slot.append(box);
        widget = { slot, box, move, open, zoom, resize }; stage.widgets.set(entity.id, widget);
        manipulate(stage, widget, entity.id, move, false); manipulate(stage, widget, entity.id, resize, true);
      }
      attr(widget.slot, "class", `dr-cast-slot ${side}`);
      const parent = stage.frame;
      if (widget.slot.parentElement !== parent) parent.append(widget.slot);
      attr(widget.open, "class", `dr-cast-portrait ${side}`);
      if (!stage.dragging && !stage.busy) widget.pose = options?.layout?.resetAt === (options?.resetAt ?? 0) ? options.layout.positions[entity.id] : options ? undefined : widget.pose;
      text(widget.move, `⠿ ${entity.name}`); attr(widget.move, "aria-label", `${characterText(locale, "layoutMove")}: ${entity.name}`); attr(widget.move, "title", characterText(locale, "layoutKeys"));
      attr(widget.resize, "aria-label", `${characterText(locale, "layoutResize")}: ${entity.name}`); attr(widget.resize, "title", characterText(locale, "layoutResizeKeys"));
      attr(widget.open, "aria-label", `${characterText(locale, "edit")}: ${entity.name}`);
      const state = scene?.states[entity.id]; syncPortraitImage(widget.open.querySelector("img")!, entity.characterSheet, state?.emotion, scenePortraitIndex(entity, scene));
      const name = widget.open.querySelector(".dr-cast-name")!; if (name.textContent !== entity.name) name.textContent = entity.name;
      const label = state ? emotionLabel(locale, resolveCharacterEmotion(entity.characterSheet, state.emotion)) : characterText(locale, "noState"); const mood = widget.open.querySelector("small")!; if (mood.textContent !== label) mood.textContent = label;
      attr(widget.open, "title", `${entity.name} · ${label}`);
      const role = widget.open.querySelector<HTMLElement>(".dr-cast-role")!; const roleText = characterText(locale, entity.id === hero?.id ? "portraitHero" : partners.has(entity.id) ? "portraitPartner" : "portraitPresent"); if (role.textContent !== roleText) role.textContent = roleText;
      attr(widget.box, "data-talking", String(partners.has(entity.id)));
      const stats = characterHighlights(state); const key = JSON.stringify(stats);
      if (widget.statsKey !== key) {
        let highlights = widget.open.querySelector<HTMLElement>(".dr-cast-highlights");
        if (!highlights) { highlights = host.ownerDocument.createElement("span"); highlights.className = "dr-cast-highlights"; highlights.id = `dr-cast-stats-${++statsId}`; widget.open.append(highlights); }
        highlights.replaceChildren(...stats.map(stat => { const node = host.ownerDocument.createElement("span"); node.textContent = `${stat.label}: ${stat.value}`; node.title = node.textContent; return node; }));
        highlights.hidden = !stats.length;
        if (stats.length) widget.open.setAttribute("aria-describedby", highlights.id); else widget.open.removeAttribute("aria-describedby");
        widget.statsKey = key;
      }
      const image = widget.open.querySelector("img")!;
      const view = () => openPortraitViewer(host.ownerDocument, image.getAttribute("src") ?? "", entity.name, locale);
      const noImage = !validPortrait(image.getAttribute("src")); if (widget.zoom.hidden !== noImage) widget.zoom.hidden = noImage; attr(widget.zoom, "aria-label", `${photoCopy(locale).open}: ${entity.name}`); widget.zoom.onclick = view;
      widget.open.onclick = event => { if (event.target === image && view()) return; onOpen(entity.id); };
    }
    // Scene order may change when the hero or interlocutors change. Keep existing
    // nodes and saved poses, but use the current cast order for unplaced defaults.
    stage.widgets = new Map(people.map(entity => [entity.id, stage!.widgets.get(entity.id)!]));
    for (const [index, widget] of [...stage.widgets.values()].entries()) if (stage.frame.children[index] !== widget.slot) stage.frame.insertBefore(widget.slot, stage.frame.children[index] ?? null);
    if (focused?.isConnected && stage.overlay.shadowRoot!.activeElement !== focused) focused.focus({ preventScroll: true });
    arrange(stage);
  }
}
