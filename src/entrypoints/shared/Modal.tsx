import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { HelpButton, HelpSection } from "./Help";

export function Modal(props: { title: string; closeLabel: string; children: ReactNode; onClose: () => void; wide?: boolean; returnFocus?: HTMLElement | null }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = props.returnFocus ?? document.activeElement as HTMLElement | null;
    const root = backdrop.current;
    const hidden: { element: HTMLElement; inert: boolean; aria: string | null }[] = [];
    // Only hide siblings in this extension document, never the host DeepSeek chat.
    for (let branch: HTMLElement | null = root; branch?.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        hidden.push({ element: sibling, inert: sibling.inert, aria: sibling.getAttribute("aria-hidden") });
        sibling.inert = true; sibling.setAttribute("aria-hidden", "true");
      }
      if (branch.parentElement === document.body) break;
    }
    if (!root?.contains(previous)) root?.querySelector<HTMLElement>("button, input, textarea, select")?.focus();
    return () => {
      for (const item of hidden) { item.element.inert = item.inert; if (item.aria === null) item.element.removeAttribute("aria-hidden"); else item.element.setAttribute("aria-hidden", item.aria); }
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div ref={backdrop} className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); }
    if (event.key !== "Tab") return;
    const controls = [...(backdrop.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><HelpSection className={`modal ${props.wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={props.title}><header><h2>{props.title}</h2><HelpButton className="icon-button" onClick={props.onClose} aria-label={props.closeLabel}><X /></HelpButton></header><div className="modal-body">{props.children}</div></HelpSection></div>;
}
