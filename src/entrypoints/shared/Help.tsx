import { Children, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../core/types";
import { getHelp } from "../../core/help";
import { TooltipButton } from "./TooltipButton";

export const HelpLocale = createContext<Locale>("ru");

export function Help(props: { label: string; text?: string }) {
  const locale = useContext(HelpLocale);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 8, y: 8 });
  const ref = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);
  const id = useId();
  const label = `${locale === "ru" ? "Подсказка" : "Help"}: ${props.label}`;
  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ x: Math.max(8, Math.min(rect.right - 280, window.innerWidth - 288)), y: rect.bottom + 8 > window.innerHeight - 180 ? Math.max(8, rect.top - 180) : rect.bottom + 8 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => { pinned.current = false; setOpen(false); };
    const scroll = () => { if (!pinned.current) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return <>
    <button ref={ref} type="button" className="dr-help" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onMouseEnter={show} onMouseLeave={() => { if (!pinned.current) setOpen(false); }} onFocus={show} onBlur={() => { if (!pinned.current) setOpen(false); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); pinned.current = true; show(); }}>?</button>
    {open && createPortal(<div id={id} role="tooltip" className="dr-help-tooltip" style={{ left: position.x, top: position.y }}><strong>{props.label}</strong><p>{props.text ?? getHelp(locale, props.label)}</p></div>, ref.current?.getRootNode() instanceof ShadowRoot ? (ref.current.getRootNode() as ShadowRoot) : document.body)}
  </>;
}

function textOf(children: ReactNode): string {
  let text = "";
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") text += child;
    else if (isValidElement<{ children?: ReactNode }>(child)) text += textOf(child.props.children);
  });
  return text.trim();
}

function firstKnownLabel(children: ReactNode, locale: Locale): string | undefined {
  let found: string | undefined;
  Children.forEach(children, (child) => {
    if (found) return;
    if (typeof child === "string" && getHelp(locale, child) !== getHelp(locale, "")) found = child;
    else if (isValidElement<{ children?: ReactNode }>(child)) found = firstKnownLabel(child.props.children, locale);
  });
  return found;
}

/** Ordinary actions stay ordinary: help belongs to the section, not every button. */
export function HelpButton(props: ComponentProps<"button">) {
  const locale = useContext(HelpLocale);
  const label = props["aria-label"] ?? firstKnownLabel(props.children, locale) ?? textOf(props.children);
  if (label && !textOf(props.children) && !props.ref) {
    const { ref: _ref, title, ...button } = props;
    return <TooltipButton {...button} aria-label={label} tooltip={title} />;
  }
  return <button {...props} aria-label={label || undefined} />;
}
export function HelpSection(props: ComponentProps<"section">) { return <section {...props} />; }

export function SectionGuide(props: { locale: Locale; text: string }) {
  return <aside className="dr-section-guide"><p>{props.text}</p></aside>;
}
