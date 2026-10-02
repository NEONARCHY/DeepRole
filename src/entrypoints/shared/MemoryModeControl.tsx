import { useId } from "react";
import type { ActivationMode, Locale } from "../../core/types";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";

/** One vocabulary and one explanation everywhere memory can be edited. */
export function MemoryModeControl(props: { locale: Locale; value: ActivationMode; onChange: (mode: ActivationMode) => void; disabled?: boolean; example?: boolean }) {
  const hint = useId();
  const t = (key: Parameters<typeof uiText>[1]) => uiText(props.locale, key);
  return <fieldset className="dr-memory-mode" disabled={props.disabled} aria-describedby={hint}>
    <legend>{t("when")}</legend>
    <div className="dr-mode-choices">{(["smart", "always", "manual"] as const).map((mode) =>
      <button className="dr-mode-option" type="button" key={mode} aria-label={t(mode)} aria-pressed={props.value === mode} onClick={() => props.onChange(mode)}><strong>{t(mode)}</strong><small>{experienceText(props.locale, mode === "smart" ? "modeSmart" : mode === "always" ? "modeAlways" : "modeManual")}</small></button>
    )}</div>
    <p id={hint}>{t(`${props.value}Hint`)}</p>
    {props.example && props.value === "smart" && <small>{t("example")}</small>}
  </fieldset>;
}
