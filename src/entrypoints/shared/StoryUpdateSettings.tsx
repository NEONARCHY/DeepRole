import type { DeepRoleSettings } from "../../core/types";
import { storyUpdateText } from "../../core/story-update-i18n";
export function StoryUpdateSettings({ settings, onSave }: { settings: DeepRoleSettings; onSave: (settings: DeepRoleSettings) => void }) {
  const t = (key: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(settings.locale, key);
  return <section className="settings-card"><header><h2>{t("settings")}</h2></header><div>
    <label className="toggle-row"><span>{t("autoRepair")}</span><input type="checkbox" checked={!!settings.automaticMetadataRepair} onChange={e => onSave({ ...settings, automaticMetadataRepair: e.target.checked })} /></label><p className="setting-copy">{t("autoRepairHint")}</p>
    <label className="toggle-row"><span>{t("strict")}</span><input type="checkbox" checked={!!settings.strictMemorySending} onChange={e => onSave({ ...settings, strictMemorySending: e.target.checked })} /></label><p className="setting-copy">{t("strictHint")}</p>
  </div></section>;
}
