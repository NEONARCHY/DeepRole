import { useId, useRef, useState, type ReactNode } from "react";
import { storyUpdateText } from "../../core/story-update-i18n";
import type { Locale } from "../../core/types";

/** Keeping Cancel on the trigger prevents a repeated Enter from confirming. */
export function StoryMemoryAction({ locale, label, confirmLabel, hint, disabled, secondary, children, onConfirm }: {
  locale: Locale; label: string; confirmLabel: string; hint: string; disabled: boolean;
  secondary?: boolean; children?: ReactNode; onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId(), trigger = useRef<HTMLButtonElement>(null);
  return <div className="dr-memory-action" data-confirming={open || undefined}
    onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    {open && <p id={id} role="status">{hint}</p>}
    <div className="button-row">
      <button ref={trigger} type="button" className={"button" + (open || secondary ? " secondary" : "")} disabled={disabled}
        aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen(!open)}>
        {open ? storyUpdateText(locale, "cancelDecision") : label}
      </button>
      {open ? <button type="button" className="button primary" disabled={disabled} aria-describedby={id} onClick={() => {
        setOpen(false); trigger.current?.focus(); onConfirm();
      }}>{confirmLabel}</button> : children}
    </div>
  </div>;
}
