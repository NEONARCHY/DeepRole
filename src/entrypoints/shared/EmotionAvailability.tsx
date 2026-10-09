import { useId, useState } from "react";
import type { CharacterSheet, Locale } from "../../core/types";
import { emotionOptionLabel } from "../../core/characters";
import { allowedCharacterEmotions, MAX_BLOCKED_EMOTIONS, withCharacterEmotionRules } from "../../core/character-emotions";
import { emotionPolicyText, type EmotionPolicyKey } from "../../core/emotion-policy-i18n";

export function EmotionAvailability({ locale, sheet, emotions, disabled, expanded = false, onChange }: {
  locale: Locale; sheet: CharacterSheet; emotions: string[]; disabled?: boolean; expanded?: boolean; onChange: (sheet: CharacterSheet) => void;
}) {
  const id = useId(); const [query, setQuery] = useState(""); const [error, setError] = useState<EmotionPolicyKey | null>(null);
  const t = (key: EmotionPolicyKey, values?: Record<string, string | number>) => emotionPolicyText(locale, key, values);
  const keys = [...new Set(["neutral", ...emotions])]; const blocked = sheet.blockedEmotions ?? [];
  const retired = blocked.filter(key => !keys.includes(key));
  const filtered = keys.filter(key => `${key} ${emotionOptionLabel(locale, key)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  function update(next: string[]) {
    if (next.length > MAX_BLOCKED_EMOTIONS) { setError("limit"); return; }
    try { const value = withCharacterEmotionRules(sheet, next); setError(null); onChange(value); }
    catch { setError("detachFull"); }
  }
  function row(key: string) {
    const label = emotionOptionLabel(locale, key);
    return <label key={key} className="dr-emotion-policy-row"><span><strong>{label}</strong>{key === "neutral" && <small>{t("neutral")}</small>}</span>
      <input type="checkbox" role="switch" data-portrait-preview aria-label={t("allow", { emotion: label })} aria-describedby={id + "-hint"} checked={!blocked.includes(key)} disabled={disabled || key === "neutral"}
        onChange={event => update(event.target.checked ? blocked.filter(value => value !== key) : [...blocked, key])} />
    </label>;
  }
  return <section className="dr-emotion-policy" data-emotion-policy aria-labelledby={id + "-title"}>
    <div className="dr-emotion-policy-heading"><strong id={id + "-title"}>{t("title")}</strong><small>{t("count", { count: number(allowedCharacterEmotions(sheet, keys).length), total: number(keys.length) })}</small></div>
    <p id={id + "-hint"} className="dr-character-hint">{t("hint")}</p>
    <details open={expanded || undefined}><summary>{t("customize")}</summary>
      <div className="dr-emotion-policy-tools"><button type="button" disabled={disabled || !blocked.length} onClick={() => update([])}>{t("all")}</button>
        <button type="button" disabled={disabled || keys.every(key => key === "neutral" || blocked.includes(key))} onClick={() => update([...new Set([...blocked, ...keys.filter(key => key !== "neutral")])])}>{t("neutralOnly")}</button></div>
      <input type="search" data-portrait-preview aria-label={t("search")} placeholder={t("search")} value={query} maxLength={80} disabled={disabled} onChange={event => setQuery(event.target.value)} />
      <div className="dr-emotion-policy-list">{filtered.map(row)}</div>{!filtered.length && <p className="dr-character-hint" role="status">{t("empty")}</p>}
      {retired.length > 0 && <details className="dr-emotion-policy-retired"><summary>{t("retired")} · {number(retired.length)}</summary><p className="dr-character-hint">{t("retiredHint")}</p><div className="dr-emotion-policy-list">{retired.map(row)}</div></details>}
      {error && <p className="error-text" role="alert">{t(error)}</p>}
      <p className="dr-character-hint">{t("images")}</p><p className="dr-character-hint">{t("safety")}</p><p className="dr-character-hint">{t("future")}</p>
    </details>
  </section>;
}
