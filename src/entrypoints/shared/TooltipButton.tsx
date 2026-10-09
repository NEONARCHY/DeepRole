import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";

type Props = Omit<ComponentPropsWithoutRef<"button">, "title" | "aria-label"> & { "aria-label": string; tooltip?: string; nativeTooltip?: boolean };
type Phase = "idle" | "pending" | "open";
let dismissActive: (() => void) | undefined;

/** Help belongs to the action itself; never adds a second focusable control. */
export function TooltipButton({ tooltip, nativeTooltip = false, "aria-label": label, onMouseEnter, onMouseLeave, onFocus, onBlur, onPointerDown, onClick, onKeyDown, ...props }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const phaseRef = useRef<Phase>("idle");
  const keyboardFocus = useRef(false);
  const overTip = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const cancelTimer = useCallback(() => { clearTimeout(timer.current); timer.current = undefined; }, []);
  const hide = useCallback(() => {
    cancelTimer(); phaseRef.current = "idle"; setPhase("idle"); setPosition(null);
    keyboardFocus.current = false; overTip.current = false;
    if (dismissActive === hide) dismissActive = undefined;
  }, [cancelTimer]);
  const show = (immediate = false) => {
    if (props.disabled || nativeTooltip) return;
    cancelTimer();
    if (phaseRef.current === "open") return;
    if (dismissActive !== hide) dismissActive?.();
    dismissActive = hide;
    const open = () => { phaseRef.current = "open"; setPhase("open"); };
    if (immediate) open();
    else { phaseRef.current = "pending"; setPhase("pending"); timer.current = setTimeout(open, 1000); }
  };
  const leave = () => {
    if (keyboardFocus.current || overTip.current) return;
    cancelTimer();
    // A short bridge lets the pointer cross the gap into the tooltip itself.
    if (phaseRef.current === "open") timer.current = setTimeout(hide, 160);
    else hide();
  };

  useEffect(() => () => { cancelTimer(); if (dismissActive === hide) dismissActive = undefined; }, [cancelTimer, hide]);
  useEffect(() => { if (props.disabled || nativeTooltip) hide(); }, [props.disabled, nativeTooltip, hide]);
  useEffect(() => {
    if (phase === "idle") return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (phaseRef.current === "open") { event.preventDefault(); event.stopPropagation(); }
      hide();
    };
    const outside = (event: Event) => {
      const path = event.composedPath();
      if (path.includes(button.current!) || path.includes(tip.current!)) return;
      hide();
    };
    const movement = (event: Event) => { if (!event.composedPath().includes(tip.current!)) hide(); };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", movement, true);
    window.addEventListener("wheel", movement, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", movement, true);
      window.removeEventListener("wheel", movement, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, [phase, hide]);
  useLayoutEffect(() => {
    if (phase !== "open" || !button.current || !tip.current) return;
    const anchor = button.current.getBoundingClientRect();
    const bounds = tip.current.getBoundingClientRect();
    const below = anchor.bottom + 6;
    const top = below + bounds.height <= window.innerHeight - 8 ? below : anchor.top - bounds.height - 6;
    setPosition({ x: Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8)), y: Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8)) });
  }, [phase, label, tooltip]);

  const root = button.current?.getRootNode();
  return <>
    <button {...props} ref={button} type={props.type ?? "button"} aria-label={label} title={nativeTooltip ? [label, tooltip].filter(Boolean).join("\n") : undefined} aria-description={props["aria-description"] ?? (nativeTooltip ? tooltip : undefined)} aria-describedby={[props["aria-describedby"], phase === "open" ? id : undefined].filter(Boolean).join(" ") || undefined}
      onMouseEnter={(event) => { show(); onMouseEnter?.(event); }}
      onMouseLeave={(event) => { leave(); onMouseLeave?.(event); }}
      onFocus={(event) => { keyboardFocus.current = event.currentTarget.matches(":focus-visible"); if (keyboardFocus.current) show(true); onFocus?.(event); }}
      onBlur={(event) => { keyboardFocus.current = false; leave(); onBlur?.(event); }}
      onPointerDown={(event) => { hide(); onPointerDown?.(event); }}
      onClick={(event) => { hide(); onClick?.(event); }}
      onKeyDown={(event) => { if (event.key !== "Tab") hide(); onKeyDown?.(event); }} />
    {phase === "open" && createPortal(<div ref={tip} id={id} role="tooltip" className="dr-help-tooltip dr-hover-tooltip"
      style={{ left: position?.x ?? 8, top: position?.y ?? 8, visibility: position ? "visible" : "hidden" }}
      onMouseEnter={() => { overTip.current = true; cancelTimer(); }} onMouseLeave={() => { overTip.current = false; leave(); }}
      onPointerDown={(event) => event.stopPropagation()}>
      <strong>{label}</strong>{tooltip && <p>{tooltip}</p>}
    </div>, root instanceof ShadowRoot ? root : document.body)}
  </>;
}
