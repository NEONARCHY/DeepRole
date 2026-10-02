import { useEffect, useRef, useState, type ReactNode } from "react";
import { Columns2, Maximize2, Minimize2, Plus, X } from "lucide-react";
import type { Locale, WorldProfile } from "../../core/types";
import { BOOK_COLORS } from "../../core/defaults";
import { mapText } from "../../core/map-i18n";
import { sceneText } from "../../core/scene-i18n";
import { TooltipButton } from "../shared/TooltipButton";
import type { MapPaneController } from "./LoreMap";

interface Props {
  locale: Locale; worlds: WorldProfile[]; initialWorldId: string | null; startInCreate?: boolean; activeWorldId: string | null;
  onSelect: (id: string) => void; onClose: () => void; onCreate: (draft: { name: string; description: string; useDescriptionInContext: boolean; color: string }) => Promise<WorldProfile>;
  render: (world: WorldProfile, pane: { active: boolean; onRegister: (controller: MapPaneController | null) => void; onClose: () => void; onExit: (task: () => void) => void }) => ReactNode;
}

/** Two editing surfaces, never two chat bindings. Each mounted world owns its history. */
export function MapWorkspace(props: Props) {
  const m = (key: Parameters<typeof mapText>[1]) => mapText(props.locale, key);
  const t = (key: Parameters<typeof sceneText>[1]) => sceneText(props.locale, key);
  const [mode, setMode] = useState<"compact" | "full">("compact");
  const [split, setSplit] = useState(false);
  const [ids, setIds] = useState<(string | null)[]>([props.initialWorldId, null]);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<number | null>(props.startInCreate ? 0 : null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [useDescriptionInContext, setUseDescriptionInContext] = useState(true);
  const [color, setColor] = useState<string>(BOOK_COLORS[props.worlds.length % BOOK_COLORS.length]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const controllers = useRef<(MapPaneController | null)[]>([null, null]);
  const closeAction = useRef<() => void>(() => {});
  const root = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const operation = useRef(false);
  const lastFocus = useRef(document.activeElement as HTMLElement | null);
  const setLayout = (next: string) => { if (window.parent !== window) window.parent.postMessage({ source: "deeprole-menu", type: "MAP_LAYOUT", mode: next }, "*"); };
  useEffect(() => { mounted.current = true; setLayout("compact"); return () => { mounted.current = false; setLayout("closed"); lastFocus.current?.focus({ preventScroll: true }); }; }, []);
  function openCreate(pane: number) { setCreating(pane); setName(""); setDescription(""); setUseDescriptionInContext(true); setColor(BOOK_COLORS[props.worlds.length % BOOK_COLORS.length]!); }
  async function withLeave(panes: number[], task: () => void | Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(false);
    try {
      for (const pane of panes) if (controllers.current[pane] && !await controllers.current[pane]!.leave()) return;
      if (mounted.current) await task();
    } catch { if (mounted.current) setError(true); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  closeAction.current = () => { void withLeave(split ? [active, 1 - active] : [0], props.onClose); };
  useEffect(() => {
    const parent = (event: MessageEvent) => { if (event.source === window.parent && event.data?.source === "deeprole-page" && event.data.type === "CLOSE_MAP") closeAction.current(); };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && creating !== null) { event.preventDefault(); setCreating(null); return; }
      if (event.key === "Escape" && !(event.target as Element | null)?.closest(".dr-loremap.is-pane")) { event.preventDefault(); closeAction.current(); }
      if (event.key === "Tab" && creating !== null) {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('.lm-create-dialog button:not(:disabled), .lm-create-dialog input:not(:disabled), .lm-create-dialog textarea:not(:disabled)') ?? [])].filter((node) => !!node.getClientRects().length);
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    };
    window.addEventListener("message", parent); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("message", parent); window.removeEventListener("keydown", key); };
  }, [creating]);
  function switchWorld(pane: number, id: string) {
    if (!id || id === ids[pane] || id === ids[1 - pane]) return;
    void withLeave([pane], () => { setIds((old) => old.map((value, index) => index === pane ? id : value)); setActive(pane); props.onSelect(id); });
  }
  function toggleSplit() {
    if (split) { void withLeave([1], () => { setSplit(false); setActive(0); }); }
    else { setIds((old) => [old[0] ?? null, old[1] && old[1] !== old[0] ? old[1] : props.worlds.find((world) => world.id !== old[0])?.id ?? null]); setSplit(true); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim() || creating === null) return;
    const pane = creating; const title = name.trim();
    await withLeave([pane], async () => { const world = await props.onCreate({ name: title, description: description.trim(), useDescriptionInContext: useDescriptionInContext && Boolean(description.trim()), color }); if (!mounted.current) return; setIds((old) => old.map((value, index) => index === pane ? world.id : value)); setActive(pane); props.onSelect(world.id); setCreating(null); setName(""); setDescription(""); });
  }
  function toggleSize() {
    const next = mode === "compact" ? "full" : "compact";
    setMode(next);
    setLayout(next);
  }
  return <section ref={root} className={`dr-map-workspace dr-loremap is-${mode}`} role="dialog" aria-modal="false" aria-label={t("worldMap")} aria-busy={busy}>
    <header className="lm-workspace-header">
      <span className="lm-workspace-title">{t("worldMap")}</span>
      {!(props.startInCreate && creating === 0 && !ids[0]) && <TooltipButton className="lm-workspace-action" tooltip={m("emptyWorldHint")} aria-label={m("emptyWorld")} disabled={busy || creating !== null} onClick={() => openCreate(active)}><Plus size={16} /><span>{m("emptyWorld")}</span></TooltipButton>}
      <TooltipButton className="lm-workspace-action" tooltip={m("splitHint")} aria-label={m("split")} aria-pressed={split} disabled={busy || creating !== null} onClick={toggleSplit}><Columns2 size={16} /><span>{m("split")}</span></TooltipButton>
      <TooltipButton aria-label={t(mode === "compact" ? "mapFullscreen" : "mapCompact")} tooltip={t(mode === "compact" ? "mapFullscreen" : "mapCompact")} aria-pressed={mode === "full"} disabled={busy || creating !== null} onClick={toggleSize}>{mode === "compact" ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</TooltipButton>
      <TooltipButton aria-label={t("mapClose")} onClick={() => closeAction.current()} disabled={busy}><X size={16} /></TooltipButton>
    </header>
    {creating !== null && <div className="lm-create-backdrop"><form className="lm-create-dialog" role="dialog" aria-modal="true" aria-label={m("createWorldTitle")} onSubmit={(event) => void create(event)}>
      <div className="lm-create-heading"><span>{m("createWorldEyebrow")}</span><h2>{m("createWorldTitle")}</h2><p>{m("createWorldHint")}</p></div>
      <label className="lm-create-field">{t("name")}<input autoFocus required maxLength={100} aria-label={t("name")} placeholder={m("worldNamePlaceholder")} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <label className="lm-create-field">{t("description")} <small>{m("optional")}</small><textarea rows={3} maxLength={500} placeholder={m("worldDescriptionPlaceholder")} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="lm-create-check"><input type="checkbox" checked={useDescriptionInContext} disabled={busy} onChange={(event) => setUseDescriptionInContext(event.target.checked)} /><span>{m("useDescriptionInChat")}</span></label>
      <fieldset className="lm-create-colors"><legend>{m("worldColor")}</legend>{BOOK_COLORS.map((option, index) => <label key={option} className={color === option ? "is-selected" : ""} title={`${m("worldColor")} ${index + 1}`}><input type="radio" name="world-color" value={option} aria-label={`${m("worldColor")} ${index + 1}`} checked={color === option} disabled={busy} onChange={() => setColor(option)} /><span style={{ background: option }} /></label>)}</fieldset>
      <p className="lm-create-note">{m("emptyWorldHint")}</p>
      <div className="lm-create-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => setCreating(null)}>{m("cancel")}</button><button className="button primary" disabled={busy || !name.trim()} type="submit">{m("createEmpty")}</button></div>
    </form></div>}
    {error && <p role="alert" className="lm-history-error">{m("workspaceFailed")}</p>}
    <div className={"lm-workspace-panes" + (split ? " is-split" : "")}>
      {(split ? [0, 1] : [0]).map((pane) => {
        const world = props.worlds.find((world) => world.id === ids[pane]);
        return <div className={"lm-workspace-pane" + (active === pane ? " is-active-pane" : "")} key={pane} data-map-pane={pane} onFocusCapture={() => setActive(pane)} onPointerDownCapture={() => setActive(pane)}>
          <label className="lm-world-picker"><span>{m("editingWorld")}</span><select aria-label={m("editingWorld")} value={world?.id ?? ""} disabled={busy || Boolean(props.startInCreate && pane === 0 && !ids[pane])} onChange={(event) => switchWorld(pane, event.target.value)}><option value="" disabled>{m("chooseWorld")}</option>{props.worlds.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.id === ids[1 - pane]}>{candidate.name}{candidate.id === props.activeWorldId ? " · " + m("inChat") : ""}</option>)}</select></label>
          <div className="lm-pane-content" inert={busy || creating !== null}>{world ? <div className="lm-pane-inner" key={world.id}>{props.render(world, { active: active === pane, onRegister: (controller) => { controllers.current[pane] = controller; }, onClose: () => closeAction.current(), onExit: (task) => { void withLeave(split ? [pane, 1 - pane] : [0], task); } })}</div> : props.startInCreate && pane === 0 ? <div className="lm-pane-empty lm-pane-empty-create"><strong>{m("newWorldEmptyTitle")}</strong><p>{m("newWorldEmptyText")}</p>{creating === null && <button className="button primary" onClick={() => openCreate(pane)}>{m("emptyWorld")}</button>}</div> : <div className="lm-pane-empty"><p>{m("chooseSecondWorld")}</p><button className="button primary" onClick={() => openCreate(pane)}>{m("emptyWorld")}</button></div>}</div>
        </div>;
      })}
    </div>
  </section>;
}
