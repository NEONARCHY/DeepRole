import { useEffect, useRef, useState, type ReactNode } from "react";
import { Columns2, Maximize2, Minimize2, Plus, X } from "lucide-react";
import type { Locale, WorldProfile } from "../../core/types";
import { mapText } from "../../core/map-i18n";
import { sceneText } from "../../core/scene-i18n";
import { TooltipButton } from "../shared/TooltipButton";
import type { MapPaneController } from "./LoreMap";

interface Props {
  locale: Locale; worlds: WorldProfile[]; initialWorldId: string; activeWorldId: string | null;
  onSelect: (id: string) => void; onClose: () => void; onCreate: (name: string) => Promise<WorldProfile>;
  render: (world: WorldProfile, pane: { active: boolean; onRegister: (controller: MapPaneController | null) => void; onClose: () => void; onExit: (task: () => void) => void }) => ReactNode;
}

/** Two editing surfaces, never two chat bindings. Each mounted world owns its history. */
export function MapWorkspace(props: Props) {
  const m = (key: Parameters<typeof mapText>[1]) => mapText(props.locale, key);
  const t = (key: Parameters<typeof sceneText>[1]) => sceneText(props.locale, key);
  const [mode, setMode] = useState<"full" | "compact">("full");
  const [split, setSplit] = useState(false);
  const [ids, setIds] = useState<(string | null)[]>([props.initialWorldId, null]);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const controllers = useRef<(MapPaneController | null)[]>([null, null]);
  const closeAction = useRef<() => void>(() => {});
  const root = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const operation = useRef(false);
  const lastFocus = useRef(document.activeElement as HTMLElement | null);
  const setLayout = (next: string) => { if (window.parent !== window) window.parent.postMessage({ source: "deeprole-menu", type: "MAP_LAYOUT", mode: next }, "*"); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; setLayout("closed"); lastFocus.current?.focus({ preventScroll: true }); }; }, []);
  useEffect(() => { setLayout(mode); }, [mode]);
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
      if (event.key === "Escape" && !(event.target as Element | null)?.closest(".dr-loremap.is-pane")) { event.preventDefault(); closeAction.current(); }
      if (event.key === "Tab") {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter((node) => !!node.getClientRects().length && !node.closest("[hidden],[inert]"));
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    };
    window.addEventListener("message", parent); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("message", parent); window.removeEventListener("keydown", key); };
  }, []);
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
    await withLeave([pane], async () => { const world = await props.onCreate(title); if (!mounted.current) return; setIds((old) => old.map((value, index) => index === pane ? world.id : value)); setActive(pane); props.onSelect(world.id); setCreating(null); setName(""); });
  }
  return <section ref={root} className={`dr-map-workspace dr-loremap is-${mode}`} role="dialog" aria-modal={mode === "full"} aria-label={t("worldMap")} aria-busy={busy}>
    <header className="lm-workspace-header">
      <span className="lm-workspace-title">{t("worldMap")}</span>
      <TooltipButton className="lm-workspace-action" tooltip={m("emptyWorldHint")} aria-label={m("emptyWorld")} disabled={busy} onClick={() => { setCreating(active); setName(""); }}><Plus size={16} /><span>{m("emptyWorld")}</span></TooltipButton>
      <TooltipButton className="lm-workspace-action" tooltip={m("splitHint")} aria-label={m("split")} aria-pressed={split} disabled={busy} onClick={toggleSplit}><Columns2 size={16} /><span>{m("split")}</span></TooltipButton>
      <TooltipButton aria-label={t(mode === "full" ? "mapCompact" : "mapFullscreen")} onClick={() => setMode(mode === "full" ? "compact" : "full")}>{mode === "full" ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</TooltipButton>
      <TooltipButton aria-label={t("mapClose")} onClick={() => closeAction.current()} disabled={busy}><X size={16} /></TooltipButton>
    </header>
    {creating !== null && <form className="lm-world-create" aria-label={m("emptyWorld")} onSubmit={(event) => void create(event)}><label>{t("name")}<input autoFocus required maxLength={100} aria-label={t("name")} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label><button className="button primary" disabled={busy || !name.trim()} type="submit">{m("createEmpty")}</button><button className="button secondary" type="button" disabled={busy} onClick={() => setCreating(null)}>{m("cancel")}</button><small>{m("emptyWorldHint")}</small></form>}
    {error && <p role="alert" className="lm-history-error">{m("workspaceFailed")}</p>}
    <div className={"lm-workspace-panes" + (split ? " is-split" : "")}>
      {(split ? [0, 1] : [0]).map((pane) => {
        const world = props.worlds.find((world) => world.id === ids[pane]);
        return <div className={"lm-workspace-pane" + (active === pane ? " is-active-pane" : "")} key={pane} data-map-pane={pane} onFocusCapture={() => setActive(pane)} onPointerDownCapture={() => setActive(pane)}>
          <label className="lm-world-picker"><span>{m("editingWorld")}</span><select aria-label={m("editingWorld")} value={world?.id ?? ""} disabled={busy} onChange={(event) => switchWorld(pane, event.target.value)}><option value="" disabled>{m("chooseWorld")}</option>{props.worlds.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.id === ids[1 - pane]}>{candidate.name}{candidate.id === props.activeWorldId ? " · " + m("inChat") : ""}</option>)}</select></label>
          <div className="lm-pane-content" inert={busy}>{world ? <div className="lm-pane-inner" key={world.id}>{props.render(world, { active: active === pane, onRegister: (controller) => { controllers.current[pane] = controller; }, onClose: () => closeAction.current(), onExit: (task) => { void withLeave(split ? [pane, 1 - pane] : [0], task); } })}</div> : <div className="lm-pane-empty"><p>{m("chooseSecondWorld")}</p><button className="button primary" onClick={() => { setCreating(pane); setName(""); }}>{m("emptyWorld")}</button></div>}</div>
        </div>;
      })}
    </div>
  </section>;
}
