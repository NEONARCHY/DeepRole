import type { CharacterScene, Locale, SceneEntity, SelfieCategory } from "../../core/types";
import { selfieGate, generatedSelfieCategory, SELFIE_ACCESS_PRESETS } from "../../core/selfies";
import { relationshipState, relationshipStage } from "../../core/relationships";
import { relationshipText } from "../../core/relationship-i18n";
import { selfieText } from "../../core/selfie-i18n";
import { Select } from "./Select";

export function SelfieAccess({ value, locale, disabled, onChange }: { value: Pick<SelfieCategory, "minTrust" | "minAffinity">; locale: Locale; disabled?: boolean; onChange(value: Pick<SelfieCategory, "minTrust" | "minAffinity">): void }) {
  const t = (key: Parameters<typeof selfieText>[1]) => selfieText(locale, key);
  const preset = Object.entries(SELFIE_ACCESS_PRESETS).find(([, v]) => v.minTrust === value.minTrust && v.minAffinity === value.minAffinity)?.[0] ?? "custom";
  return <div className="dr-selfie-access"><label><span>{t("access")}</span><Select aria-label={t("access")} disabled={disabled} value={preset} onChange={e => { const next = SELFIE_ACCESS_PRESETS[e.target.value as keyof typeof SELFIE_ACCESS_PRESETS]; if (next) onChange({ ...next }); }}>
    <option value="story">{t("storyPreset")}</option><option value="comfortable">{t("comfortablePreset")}</option><option value="close">{t("closePreset")}</option><option value="custom" disabled>{t("custom")}</option>
  </Select></label><small className="dr-character-hint">{t("consent")}</small><details><summary>{t("exact")}</summary><div className="dr-selfie-scores">{(["minTrust", "minAffinity"] as const).map(key => <label key={key}>{t(key === "minTrust" ? "trust" : "affinity")}<input type="number" aria-label={t(key === "minTrust" ? "trust" : "affinity")} min={0} max={100} step={1} disabled={disabled} required value={value[key]} onChange={e => { const n = e.currentTarget.valueAsNumber; if (Number.isInteger(n) && n >= 0 && n <= 100) onChange({ ...value, [key]: n }); }} /></label>)}</div></details></div>;
}
export function SelfieStatus({ person, hero, scene, locale, tracking = true, category, compact = false }: { person: SceneEntity; hero?: SceneEntity; scene?: CharacterScene; locale: Locale; tracking?: boolean; category?: SelfieCategory; compact?: boolean }) {
  const t = (key: Parameters<typeof selfieText>[1]) => selfieText(locale, key);
  const access = category ?? generatedSelfieCategory(person.characterSheet), gate = selfieGate(person, access, hero, scene, tracking);
  const policy = person.characterSheet?.relationships;
  const bond = policy?.enabled && hero && tracking ? relationshipState(policy, scene?.states[person.id]?.bonds?.[hero.id]) : undefined;
  if (gate === "unavailable") return null;
  const text = t(gate === "allowed" ? "ready" : gate === "trust" ? "trustNeeded" : gate === "affinity" ? "affinityNeeded" : "story");
  const progress = bond ? Math.min(access.minTrust ? bond.trust / access.minTrust : 1, access.minAffinity ? bond.affinity / access.minAffinity : 1, 1) : undefined;
  return <div className="dr-selfie-status" data-state={gate}><small>{bond && !compact ? relationshipText(locale, relationshipStage(bond)) + " · " : ""}{text}</small>
    {!compact && <>{progress !== undefined && <progress aria-label={t("status")} value={progress} max={1} />}<details><summary>{t("how")}</summary><p className="dr-character-hint">{t("howHint")}</p>{policy?.reactions && <p>{policy.reactions}</p>}{policy?.boundaries && <p>{policy.boundaries}</p>}{bond?.history.at(-1)?.reason && <p><strong>{t("lastChange")}: </strong>{bond.history.at(-1)!.reason}</p>}{bond && <p className="dr-character-hint">{t("trust")} {bond.trust}/100 · {t("needed")} {access.minTrust}<br />{t("affinity")} {bond.affinity}/100 · {t("needed")} {access.minAffinity}</p>}</details></>}
  </div>;
}

