import { useState } from "react";
import type { ActivationMode, Locale } from "../../core/types";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";

export function ModeGuide({ locale }: { locale: Locale }) {
  const [example, setExample] = useState<ActivationMode>("smart");
  const x = (key: Parameters<typeof experienceText>[1]) => experienceText(locale, key);
  const subtitles = { smart: "modeSmart", always: "modeAlways", manual: "modeManual" } as const;
  const examples = { smart: "sampleSmart", always: "sampleAlways", manual: "sampleManual" } as const;
  return <section className="dr-mode-guide" aria-label={x("modeExamples")}>
    <h3>{x("modeExamples")}</h3>
    <div className="dr-mode-choices">{(["smart", "always", "manual"] as const).map((mode) => <button key={mode} type="button" className="dr-mode-option" aria-pressed={example === mode} onClick={() => setExample(mode)}><strong>{uiText(locale, mode)}</strong><small>{x(subtitles[mode])}</small></button>)}</div>
    <p className="dr-mode-example" aria-live="polite">{x(examples[example])}</p>
    <p className="setting-copy">{x("selectionGuide")}</p>
  </section>;
}
