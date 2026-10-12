import { Info } from "lucide-react";
import type { Locale } from "../../core/types";
import { characterUpdateText, type CharacterUpdateKind, type CharacterUpdateMode } from "../../core/character-update-i18n";
export function CharacterUpdateNotice({ locale, kind, mode = "active" }: { locale: Locale; kind: CharacterUpdateKind; mode?: CharacterUpdateMode }) {
  const text = characterUpdateText(locale, kind, mode);
  return <div className="dr-character-update-notice" role="note" aria-label={text.title} data-kind={kind} data-mode={mode}>
    <Info size={16} aria-hidden="true" />
    <div><strong>{text.title}</strong><p>{text.body}</p></div>
  </div>;
}
