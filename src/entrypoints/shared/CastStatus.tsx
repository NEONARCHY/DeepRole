import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Grip, RotateCcw, X } from "lucide-react";
import { clampCastPopup, dockCastPopup, type CastPopupPoint } from "../../core/cast-popup";
import { castText } from "../../core/cast-i18n";
import type { CastView } from "../../adapters/cast-coordinator";
import type { Locale } from "../../core/types";

export function CastStatus({ job, locale, compact, anchor, children, onHide }: { job: CastView; locale: Locale; compact: boolean; anchor: RefObject<HTMLDivElement | null>; children: ReactNode; onHide: () => void }) {
  const box = useRef<HTMLDivElement>(null), manual = useRef<CastPopupPoint | null>(null);
  const drag = useRef<{ id: number; start: CastPopupPoint; pointer: CastPopupPoint; previous: CastPopupPoint | null } | null>(null);
  const [point, setPoint] = useState<CastPopupPoint | null>(null), [hint, setHint] = useState(0), [dragging, setDragging] = useState(false);
  const t = (key: Parameters<typeof castText>[1]) => castText(locale, key);
  const preparing = ["opening", "reading", "analyzing"].includes(job.phase);
  const waiting = preparing || job.cleanup === "pending";
  const place = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    if (!compact) return;
    const panel = anchor.current?.closest<HTMLElement>(".dr-characters") ?? anchor.current;
    const element = box.current;
    if (!panel || !element) return;
    const update = () => {
      if (drag.current) return;
      const size = { width: element.offsetWidth, height: element.offsetHeight }, viewport = { width: innerWidth, height: innerHeight };
      const rect = panel.getBoundingClientRect(), tools = panel.closest(".dr-widget-tile")?.querySelector(".dr-widget-tools")?.getBoundingClientRect();
      const dock = { left: rect.left, right: Math.max(rect.right, tools?.right ?? rect.right), top: rect.top, bottom: rect.bottom };
      const next = manual.current ? clampCastPopup(manual.current, size, viewport) : dockCastPopup(dock, size, viewport);
      if (manual.current) manual.current = next;
      setPoint(old => old?.x === next.x && old?.y === next.y ? old : next);
    };
    place.current = update;
    // The surrounding deck may move during DeepSeek's sidebar transition.
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    const resize = new ResizeObserver(schedule); resize.observe(panel); resize.observe(element);
    const deck = panel.closest(".dr-widget-deck") ?? panel;
    resize.observe(deck);
    const mutations = new MutationObserver(schedule); mutations.observe(deck, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ["style", "class", "hidden"] });
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
    update();
    return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); place.current = () => {}; };
  }, [compact, anchor]);
  useEffect(() => {
    setHint(0);
    if (!waiting) return;
    const timer = setInterval(() => { if (!document.hidden) setHint(old => (old + 1) % 3); }, 3600);
    return () => clearInterval(timer);
  }, [waiting, job.phase, job.step, job.repair]);
  const endDrag = (cancel = false) => {
    if (!drag.current) return;
    const previous = drag.current.previous; drag.current = null; setDragging(false);
    if (cancel) { manual.current = previous; place.current(); }
  };
  const status = <div ref={box} className={"dr-cast-status" + (compact ? " is-floating" : "")} data-positioned={!compact || !!point} data-dragging={dragging || undefined} style={compact ? { left: point?.x ?? 8, top: point?.y ?? 8 } : undefined} onKeyDown={e => {
    if (e.key === "Escape" && !e.defaultPrevented && !drag.current) { e.preventDefault(); e.stopPropagation(); onHide(); }
  }}>
    <div className="dr-cast-status-heading">
      {compact && <button type="button" className="dr-cast-status-grip" aria-label={t("move")} title={t("moveHint")} onPointerDown={e => {
        if (e.button !== 0 || !e.isPrimary || drag.current || !point) return;
        e.preventDefault(); e.stopPropagation(); e.currentTarget.focus({ preventScroll: true });
        drag.current = { id: e.pointerId, start: point, pointer: { x: e.clientX, y: e.clientY }, previous: manual.current }; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e => {
        const d = drag.current, element = box.current; if (!d || d.id !== e.pointerId || !element) return;
        const next = clampCastPopup({ x: d.start.x + e.clientX - d.pointer.x, y: d.start.y + e.clientY - d.pointer.y }, { width: element.offsetWidth, height: element.offsetHeight }, { width: innerWidth, height: innerHeight });
        manual.current = next; setPoint(next);
      }} onPointerUp={e => { if (drag.current?.id === e.pointerId) endDrag(); }} onPointerCancel={e => { if (drag.current?.id === e.pointerId) endDrag(true); }} onLostPointerCapture={() => endDrag(true)} onKeyDown={e => {
        if (e.key === "Escape" && drag.current) { e.preventDefault(); e.stopPropagation(); endDrag(true); return; }
        const shift = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[e.key];
        if (shift && point) { e.preventDefault(); e.stopPropagation(); manual.current = { x: point.x + shift[0]! * (e.shiftKey ? 32 : 8), y: point.y + shift[1]! * (e.shiftKey ? 32 : 8) }; place.current(); }
      }}><Grip size={14}/><span>{t("title")}</span></button>}
      {compact && <button type="button" className="icon-button dr-cast-status-reset" title={t("dock")} aria-label={t("dock")} onClick={() => { manual.current = null; place.current(); }}><RotateCcw size={14}/></button>}
      {!compact && <strong className="dr-cast-status-title">{t("title")}</strong>}
      <button type="button" className="icon-button dr-cast-status-reset" title={t("hide")} aria-label={t("hide")} onClick={onHide}><X size={14}/></button>
    </div>
    <div className="dr-cast-phase" role="status" aria-live="polite"><span className={waiting ? "dr-cast-spinner" : "dr-cast-ready-dot"} aria-hidden="true"/><strong>{t(job.phase)}</strong></div>
    {preparing && <><div className="dr-cast-activity" aria-hidden="true"><span/></div><p className="dr-cast-waiting-hint" aria-live="off">{t((job.phase === "opening" ? ["waitOpening", "waitConnection", "waitService"] : job.phase === "reading" ? ["waitFragments", "waitSources", "waitService"] : ["waitProfiles", "waitRelationships", "waitService"])[hint] as Parameters<typeof castText>[1])}</p>
      <small>{job.phase === "analyzing" ? t("finalStep") : job.phase === "opening" ? t("source") + ": " + job.sourceCount : t("fragment") + " " + Math.min(job.step + 1, job.partCount) + "/" + job.partCount}{job.repair ? " · " + t("repairStep") : ""}</small></>}
    {!!job.draft?.characters.length && preparing && <small>{t("savedCount")}: {job.draft.characters.length}</small>}
    {children}
  </div>;
  return compact && anchor.current ? createPortal(status, anchor.current.closest(".dr-root") ?? anchor.current.ownerDocument.body) : status;
}
