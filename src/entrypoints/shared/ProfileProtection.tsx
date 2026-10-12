import type { CharacterSheet, Locale } from "../../core/types";
import { PROFILE_TEXT_FIELDS } from "../../core/story-profile-view";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { characterText } from "../../core/characters";
export function ProfileProtection({ locale, sheet, disabled, onChange }: { locale: Locale; sheet: CharacterSheet; disabled?: boolean; onChange: (value: CharacterSheet) => void }) {
  const t = storyAutomationText(locale);
  return <details className="dr-profile-protection"><summary>{t.protect}</summary><p className="dr-character-hint">{t.protectHint}</p>{PROFILE_TEXT_FIELDS.map(key => <label className="dr-character-check" key={key}><input type="checkbox" checked={!!sheet.protectedProfileFields?.includes(key)} disabled={disabled} onChange={e => onChange({ ...sheet, protectedProfileFields: e.target.checked ? [...sheet.protectedProfileFields ?? [], key] : sheet.protectedProfileFields?.filter(k => k !== key) ?? [] })}/>{characterText(locale, key)}</label>)}</details>;
}
