import { useEffect, useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

type Option = { value: string; label: string; disabled: boolean; group: string };
type Bounds = { left: number; top?: number; bottom?: number; width: number; maxHeight: number };

/** Keep native labels, validation, forms and change events. Only the OS popup is
 * replaced: focus stays on the select while the branded listbox is explored. */
export function Select({ children, onChange, onKeyDown, onPointerDown, onClick, onBlur, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const select = useRef<HTMLSelectElement>(null), list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [options, setOptions] = useState<Option[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const native = !!props.multiple || (props.size ?? 1) > 1;
  const expanded = open && !props.disabled && !native;
  const portal = select.current?.closest("dialog,[role=dialog],.dr-root,.dr-loremap,.app-shell") ?? select.current?.parentElement;
  const readOptions = () => [...(select.current?.options ?? [])].map(option => ({ value: option.value, label: option.label, disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled), group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "" }));
  const labelText = () => {
    const label = select.current?.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    label?.querySelectorAll("select,input,textarea,button,svg,.dr-select-menu").forEach(node => node.remove());
    return label?.textContent?.trim();
  };
  const show = () => {
    const items = readOptions(); setOptions(items);
    const selected = select.current?.selectedIndex ?? -1;
    setActive(items[selected] && !items[selected]!.disabled ? selected : items.findIndex(option => !option.disabled));
    search.current = { text: "", at: 0 }; setOpen(true);
  };
  const choose = (index: number) => {
    const node = select.current, option = options[index];
    if (!node || node.disabled || !option || option.disabled || !readOptions().some(item => item.value === option.value && !item.disabled)) { setOpen(false); return; }
    if (node.value !== option.value) {
      // Dispatch through React's normal form/change path: no synthetic edit APIs.
      node.value = option.value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (!expanded || !select.current) return;
    const node = select.current, win = node.ownerDocument.defaultView!;
    const viewport = win.visualViewport;
    const place = () => {
      const rect = node.getBoundingClientRect(), pad = 8, gap = 4;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const right = left + (viewport?.width ?? win.innerWidth), bottom = top + (viewport?.height ?? win.innerHeight);
      const below = bottom - rect.bottom - gap - pad, above = rect.top - top - gap - pad;
      const up = below < Math.min(180, options.length * 38 + 8) && above > below;
      const height = Math.max(0, Math.min(320, up ? above : below));
      const width = Math.min(Math.max(rect.width, 160), right - left - pad * 2);
      const next = { left: Math.max(left + pad, Math.min(rect.left, right - width - pad)), top: up ? undefined : rect.bottom + gap, bottom: up ? win.innerHeight - rect.top + gap : undefined, width, maxHeight: height };
      setBounds(old => old && Object.keys(next).every(key => old[key as keyof Bounds] === next[key as keyof Bounds]) ? old : next);
    };
    const outside = (event: globalThis.PointerEvent) => { if (!event.composedPath().includes(node) && !event.composedPath().includes(list.current!)) setOpen(false); };
    const scroll = (event: Event) => { if (event.target instanceof Node && list.current?.contains(event.target)) return; setOpen(false); };
    const observer = new ResizeObserver(place); observer.observe(node);
    win.addEventListener("pointerdown", outside, true); win.addEventListener("resize", place);
    node.ownerDocument.addEventListener("scroll", scroll, true);
    win.addEventListener("deeprole-layout-change", place); viewport?.addEventListener("resize", place);
    place();
    return () => { observer.disconnect(); win.removeEventListener("pointerdown", outside, true); win.removeEventListener("resize", place); node.ownerDocument.removeEventListener("scroll", scroll, true); win.removeEventListener("deeprole-layout-change", place); viewport?.removeEventListener("resize", place); };
  }, [expanded, options.length]);
  useLayoutEffect(() => {
    if (!expanded) return;
    // Scroll only inside this list; scrollIntoView can move the underlying chat.
    const item = list.current?.children[active] as HTMLElement | undefined;
    const container = list.current;
    if (item && container) {
      if (item.offsetTop < container.scrollTop) container.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = item.offsetTop + item.offsetHeight - container.clientHeight;
    }
  }, [expanded, active, bounds]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  useEffect(() => { setOpen(false); }, [props.value]);
  return <><select {...props} ref={select} data-no-widget-drag data-dr-select={!native || undefined}
    aria-expanded={native ? undefined : expanded} aria-controls={expanded ? id : undefined} aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
    onChange={event => { setOpen(false); onChange?.(event); }}
    onPointerDown={event => { onPointerDown?.(event); if (!native && !event.defaultPrevented && event.button === 0) { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); } }}
    onClick={event => { onClick?.(event); if (!native && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); if (expanded) setOpen(false); else show(); } }}
    onBlur={event => { if (!(event.relatedTarget instanceof Node && list.current?.contains(event.relatedTarget))) setOpen(false); onBlur?.(event); }}
    onKeyDown={event => {
      onKeyDown?.(event); if (native || event.defaultPrevented) return;
      const items = expanded ? options : readOptions();
      const enabled = items.map((option, i) => option.disabled ? -1 : i).filter(i => i >= 0);
      if (event.key === "Tab") { if (expanded) choose(active); return; }
      if (event.key === "Escape") { if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); } return; }
      if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
      if (expanded && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); return; }
      const typingSpace = event.key === " " && search.current.text && Date.now() - search.current.at < 700;
      if (["Enter", "ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(event.key) || (event.key === " " && !typingSpace)) {
        event.preventDefault(); event.stopPropagation();
        if (!expanded) { show(); if (event.key === "Home") setActive(enabled[0] ?? -1); if (event.key === "End") setActive(enabled.at(-1) ?? -1); return; }
        if (event.key === "Enter" || event.key === " ") { choose(active); return; }
        const pos = enabled.indexOf(active);
        const step = event.key === "PageDown" ? 8 : event.key === "PageUp" ? -8 : event.key === "ArrowDown" ? 1 : -1;
        setActive(event.key === "Home" ? enabled[0] ?? -1 : event.key === "End" ? enabled.at(-1) ?? -1 : enabled[Math.max(0, Math.min(enabled.length - 1, pos + step))] ?? -1);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); if (!expanded) show();
        const now = Date.now(), char = event.key.toLocaleLowerCase();
        const previous = now - search.current.at < 700 ? search.current.text : "";
        const query = previous && [...previous].every(c => c === char) ? char : previous + char;
        search.current = { text: query, at: now };
        const start = expanded ? active : event.currentTarget.selectedIndex;
        const order = [...enabled.filter(i => i > start), ...enabled.filter(i => i <= start)];
        const match = order.find(i => items[i]!.label.toLocaleLowerCase().startsWith(query));
        if (match !== undefined) setActive(match);
      }
    }}>{children}</select>
    {expanded && bounds && portal && createPortal(<div ref={list} id={id} className="dr-select-menu" role="listbox" tabIndex={0} aria-label={props["aria-label"] ?? labelText()} aria-labelledby={props["aria-labelledby"]} style={bounds} onFocus={() => select.current?.focus({ preventScroll: true })} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => event.stopPropagation()}>
      {options.map((option, index) => <div key={index} id={`${id}-${index}`} role="option" aria-selected={index === active} aria-disabled={option.disabled || undefined} className="dr-select-option" data-active={index === active || undefined} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={event => { event.preventDefault(); event.stopPropagation(); if (!option.disabled) choose(index); }}><span>{option.group && <small>{option.group}</small>}{option.group && " "}{option.label}</span>{option.value === select.current?.value && <Check size={14} aria-hidden="true" />}</div>)}
    </div>, portal)}
  </>;
}
