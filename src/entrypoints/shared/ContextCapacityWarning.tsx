import { useEffect, useRef } from "react";
import { ArrowRight, Gauge } from "lucide-react";
import { continuationText } from "../../core/continuation-i18n";
import type { Locale } from "../../core/types";

export function ContextCapacityWarning(props: {
  locale: Locale; level: number; percent: number; busy: boolean;
  onContinue: () => void; onClose: () => void; onDisable?: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
  const t = (key: Parameters<typeof continuationText>[1]) => continuationText(props.locale, key, { percent: new Intl.NumberFormat(props.locale).format(props.percent) });
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="dr-capacity-layer" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); }
    if (event.key === "Tab") {
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const current = event.nativeEvent.composedPath()[0], first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && current === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && current === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="dr-capacity-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dr-capacity-title" aria-describedby="dr-capacity-description">
      <Gauge aria-hidden="true" />
      <h2 id="dr-capacity-title">{t(props.level === 2 ? "critical" : "warning")}</h2>
      <p id="dr-capacity-description">{t("warningBody")}</p>
      <p className="dr-capacity-note">{t("uncertain")}</p>
      {props.busy && <p className="dr-capacity-note" role="status">{t("waiting")}</p>}
      <div className="dr-capacity-actions">
        <button className="button primary" disabled={props.busy} onClick={props.onContinue}>{t("continue")}<ArrowRight size={16} aria-hidden="true" /></button>
        <button ref={close} className="button secondary" onClick={props.onClose}>{t("notNow")}</button>
      </div>
      {props.onDisable && <button className="dr-capacity-disable" onClick={props.onDisable}>{t("disable")}</button>}
    </div>
  </div>;
}
