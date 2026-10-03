import { characterCast, characterHighlights, characterInterlocutors, characterText, emotionLabel, syncPortraitImage } from "../core/characters";
import { clamp, portraitBounds, portraitPose } from "../core/portrait-layout";
import type { CharacterScene, Locale, PortraitLayout, PortraitPose, SceneEntity } from "../core/types";
import portraitStyle from "./portrait-stage.css?raw";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";

export interface PortraitStageOptions {
  scope: string;
  layout?: PortraitLayout;
  resetAt?: number;
  onSave: (entityId: string | null, pose: PortraitPose | null) => Promise<void>;
}
type Widget = { slot: HTMLElement; box: HTMLElement; move: HTMLButtonElement; resize: HTMLButtonElement; open: HTMLButtonElement; pose?: PortraitPose; statsKey?: string };
type Stage = { anchor: HTMLElement; overlay: HTMLElement; frame: HTMLElement; toolbar: HTMLElement; hint: HTMLElement; status: HTMLElement; reset: HTMLButtonElement; widgets: Map<string, Widget>; options?: PortraitStageOptions; locale: Locale; scope: string; busy: boolean; dragging: boolean; observer: ResizeObserver; onResize: () => void; disposed: boolean };
const stages = new WeakMap<HTMLElement, Stage>();
const activeStages = new Set<Stage>();
let statsId = 0;
const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
const attr = (node: HTMLElement, key: string, value: string) => { if (node.getAttribute(key) !== value) node.setAttribute(key, value); };
const css = (node: HTMLElement, key: string, value: string) => { if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value); };

function arrange(stage: Stage) {
  const width = stage.frame.clientWidth;
  const height = stage.frame.clientHeight;
  if (!width || !height) return;
  const anchor = (stage.anchor.shadowRoot?.querySelector("section") ?? stage.anchor).getBoundingClientRect();
  const rows = Math.max(1, Math.ceil(stage.widgets.size / 2));
  const defaultWidth = clamp(Math.min(192, (height / Math.min(rows, 4) - 128) * .75, width < 600 ? 120 : 192), 96, 192);
  const rowHeight = defaultWidth * 4 / 3 + 160;
  const visibleRows = Math.max(1, Math.floor((height - 16) / rowHeight));
  const columns = Math.max(2, Math.ceil(stage.widgets.size / visibleRows));
  const sideWidth = Math.ceil(columns / 2) * (defaultWidth + 16) + 8;
  const outsideFits = anchor.left >= sideWidth && width - anchor.right >= sideWidth;
  const startY = clamp(anchor.top, 8, height - Math.min(rows, visibleRows) * rowHeight - 8);
  let index = 0;
  for (const widget of stage.widgets.values()) {
    const side = index % 2 === 0 ? "left" : "right";
    const pairedCapacity = Math.floor(columns / 2) * 2 * visibleRows;
    const center = columns % 2 === 1 && index >= pairedCapacity;
    const row = center ? index - pairedCapacity : Math.floor(index / 2) % visibleRows;
    const band = Math.floor(index++ / (visibleRows * 2));
    const column = center ? Math.floor(columns / 2) : side === "left" ? band : columns - 1 - band;
    const defaultX = outsideFits ? side === "left" ? anchor.left - (band + 1) * (defaultWidth + 16) : anchor.right + 16 + band * (defaultWidth + 16)
      : columns > 2 ? 8 + column * (width - defaultWidth - 16) / (columns - 1) : side === "left" ? anchor.left - defaultWidth - 16 : anchor.right + 16;
    const bounds = widget.pose ? portraitBounds(widget.pose, width - 16, height - 16) : { width: defaultWidth, x: defaultX, y: startY + row * rowHeight };
    // Legacy poses used chat coordinates. Convert for display only, without rewriting stored data.
    if (widget.pose && widget.pose.space !== "viewport") {
      const legacy = portraitBounds(widget.pose, anchor.width);
      bounds.x = anchor.left + legacy.x; bounds.y = anchor.top + legacy.y;
    }
    css(widget.box, "width", `${bounds.width}px`);
    css(widget.box, "left", `${clamp(bounds.x, 8, width - bounds.width - 8)}px`);
    css(widget.box, "top", `${clamp(bounds.y, 8, height - widget.box.offsetHeight - 8)}px`);
    css(widget.resize, "top", `${Math.max(0, widget.move.offsetHeight + widget.open.querySelector("img")!.offsetHeight - 44)}px`);
  }
}

function dispose(stage: Stage) {
  stage.disposed = true; stage.observer.disconnect();
  stage.anchor.ownerDocument.defaultView?.removeEventListener("resize", stage.onResize);
  stage.overlay.remove(); stage.toolbar.remove();
  stage.anchor.shadowRoot?.querySelector("section")?.classList.remove("dr-cast-content");
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
    const completed = gesture; gesture = undefined; stage.dragging = false;
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
    stage.dragging = true; control.setPointerCapture(event.pointerId); control.classList.add("is-dragging"); control.focus(); event.preventDefault();
  });
  control.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !gesture.changed) return;
    gesture.changed = true;
    const width = resize ? clamp(gesture.width + (Math.abs(dx) >= Math.abs(dy * .75) ? dx : dy * .75), 96, 360) : gesture.width;
    widget.pose = portraitPose(gesture.startX + (resize ? 0 : dx), gesture.startY + (resize ? 0 : dy), width, stage.frame.clientWidth - 16, stage.frame.clientHeight - 16);
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
    widget.pose = portraitPose(rect.left + (resize ? 0 : dx), rect.top + (resize ? 0 : dy), rect.width + (resize ? dx || dy : 0), stage.frame.clientWidth - 16, stage.frame.clientHeight - 16);
    arrange(stage); event.preventDefault(); event.stopPropagation();
    void persist(stage, id, { ...widget.pose }, () => { widget.pose = previous; });
  });
}

export function syncPortraitStage(enabled: boolean, entities: SceneEntity[], scene: CharacterScene | undefined, locale: Locale, onOpen: (id: string) => void, root: ParentNode = document, options?: PortraitStageOptions) {
  for (const stage of activeStages) if (!stage.anchor.isConnected || !stage.anchor.shadowRoot?.querySelector("section")) dispose(stage);
  for (const host of root.querySelectorAll<HTMLElement>("[data-deeprole-choices-host]")) {
    const shadow = host.shadowRoot; const section = shadow?.querySelector("section");
    if (!shadow || !section) continue;
    const people = enabled ? characterCast(entities, scene) : [];
    let stage = stages.get(host);
    const scope = options?.scope ?? "";
    if (!people.length || stage && stage.scope !== scope) {
      if (stage) { dispose(stage); stage = undefined; }
      if (!people.length) continue;
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
      const onResize = () => { const active = stages.get(host); if (active && !active.disposed) arrange(active); };
      const observer = new ResizeObserver(onResize);
      stage = { anchor: host, overlay, frame, toolbar, hint, reset, status, widgets: new Map(), options, locale, scope, busy: false, dragging: false, observer, onResize, disposed: false };
      stages.set(host, stage); activeStages.add(stage); observer.observe(host); observer.observe(frame);
      doc.defaultView?.addEventListener("resize", onResize);
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
        box.append(move, open, resize); slot.append(box);
        widget = { slot, box, move, open, resize }; stage.widgets.set(entity.id, widget);
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
      const state = scene?.states[entity.id]; syncPortraitImage(widget.open.querySelector("img")!, entity.characterSheet, state?.emotion);
      const name = widget.open.querySelector(".dr-cast-name")!; if (name.textContent !== entity.name) name.textContent = entity.name;
      const label = state ? emotionLabel(locale, state.emotion) : characterText(locale, "noState"); const mood = widget.open.querySelector("small")!; if (mood.textContent !== label) mood.textContent = label;
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
      widget.open.onclick = () => onOpen(entity.id);
    }
    // Scene order may change when the hero or interlocutors change. Keep existing
    // nodes and saved poses, but use the current cast order for unplaced defaults.
    stage.widgets = new Map(people.map(entity => [entity.id, stage!.widgets.get(entity.id)!]));
    for (const [index, widget] of [...stage.widgets.values()].entries()) if (stage.frame.children[index] !== widget.slot) stage.frame.insertBefore(widget.slot, stage.frame.children[index] ?? null);
    if (focused?.isConnected && stage.overlay.shadowRoot!.activeElement !== focused) focused.focus({ preventScroll: true });
    arrange(stage);
  }
}
