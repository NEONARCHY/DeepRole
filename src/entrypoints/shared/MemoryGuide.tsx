import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { memoryGuide } from "../../core/memory-guide";
import { storyGuide } from "../../core/story-guide";
import type { Locale } from "../../core/types";

/** A full manual, not a hover-only tooltip. Shared by settings and chat preview. */
export function MemoryGuide(props: { locale: Locale; threshold?: number; topic?: "memory" | "story" }) {
  const guide = props.topic === "story" ? storyGuide(props.locale) : memoryGuide(props.locale);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current;
    node.showModal();
    return () => { node.close(); trigger.current?.focus({ preventScroll: true }); };
  }, [open]);
  const root = trigger.current?.closest(".dr-root") ?? document.body;
  return <>
    <button ref={trigger} className="dr-memory-help" type="button" title={guide.title} aria-label={guide.title} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}>?</button>
    {open && createPortal(<dialog ref={dialog} id={id} className="dr-memory-guide" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); setOpen(false); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key === "Tab") {
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button, [tabindex='0']");
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2 id={`${id}-title`}>{guide.title}</h2><button type="button" autoFocus aria-label={guide.close} onClick={() => setOpen(false)}>×</button></header>
      <div className="dr-memory-guide-body" tabIndex={0}>
        <p className="dr-memory-guide-intro">{guide.intro}</p>
        {props.threshold !== undefined && <p className="dr-memory-guide-current">{guide.current.replace("{threshold}", String(props.threshold))}</p>}
        {guide.sections.map(section => <section key={section.title}><h3>{section.title}</h3><ul>{section.lines.map(line => <li key={line}>{line}</li>)}</ul></section>)}
      </div>
      <footer><button type="button" onClick={() => setOpen(false)}>{guide.close}</button></footer>
    </dialog>, root)}
  </>;
}
