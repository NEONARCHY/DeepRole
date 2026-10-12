import { SettingsHelp } from "./SettingsHelp";
import type { DeepRoleSettings } from "../../core/types";
import { storyUpdateText } from "../../core/story-update-i18n";
export function StoryUpdateSettings({ settings, onSave }: { settings: DeepRoleSettings; onSave: (settings: DeepRoleSettings) => void }) {
  const t = (key: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(settings.locale, key);
  return <section className="settings-card"><header><h2>{t("settings")}</h2></header><div>
    <div className="toggle-row"><SettingsHelp locale={settings.locale} title={t("autoRepair")} text={t("autoRepairHint")}/><input aria-label={t("autoRepair")} type="checkbox" checked={!!settings.automaticMetadataRepair} onChange={e => onSave({ ...settings, automaticMetadataRepair: e.target.checked })} /></div>
    <div className="toggle-row"><SettingsHelp locale={settings.locale} title={t("strict")} text={t("strictHint")}/><input aria-label={t("strict")} type="checkbox" checked={!!settings.strictMemorySending} onChange={e => onSave({ ...settings, strictMemorySending: e.target.checked })} /></div>
  </div></section>;
}
