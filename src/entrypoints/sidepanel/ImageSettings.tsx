import { useEffect, useId, useState } from "react";
import { ADULT_CONTENT_LEVEL, IMAGE_CONTENT_LEVELS, DEFAULT_IMAGE_SETTINGS, validImageProviderConfig, type ImageModelInfo, type ImageProviderConfig, type ImageSettings as Settings } from "../../core/image-generation";
import { imageText, imageErrorKey, type ImageCopyKey } from "../../core/image-i18n";
import type { Locale } from "../../core/types";
import { getImageSettings, saveImageSettings } from "../../storage/image-settings";
import { providerKeyHint, removeProviderKey, saveProviderKey } from "../../storage/image-keys";
import { Select } from "../shared/Select";
import "../shared/image-generation.css";

export function ImageSettings({ locale, onModels, onPermission }: { locale: Locale; onModels?: (profile: ImageProviderConfig) => Promise<ImageModelInfo[]>; onPermission?: (profile: ImageProviderConfig) => Promise<boolean> }) {
  const t = (key: ImageCopyKey, vars?: Record<string, string>) => imageText(locale, key, vars);
  const [settings, setSettings] = useState<Settings>(structuredClone(DEFAULT_IMAGE_SETTINGS));
  const [draft, setDraft] = useState<ImageProviderConfig | null>(null);
  const [extra, setExtra] = useState("{}");
  const [keyDraft, setKeyDraft] = useState(""); const [hint, setHint] = useState<string | null>(null);
  const [models, setModels] = useState<ImageModelInfo[]>([]); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ImageCopyKey | null>(null); const [error, setError] = useState<ImageCopyKey | null>(null);
  const [gate, setGate] = useState(false);
  const id = useId();
  useEffect(() => { let alive = true; void getImageSettings().then(value => { if (alive) setSettings(value); }).catch(() => { if (alive) setError("invalid"); }); return () => { alive = false; }; }, []);
  async function commit(next: Settings) { setError(null); await saveImageSettings(next); setSettings(next); setNotice("saved"); }
  async function act(task: () => Promise<void>) { if (busy) return; setBusy(true); setError(null); setNotice(null); try { await task(); } catch (cause) { setError(imageErrorKey(cause)); } finally { setBusy(false); } }
  function edit(profile: ImageProviderConfig) { setDraft(structuredClone(profile)); setExtra(JSON.stringify(profile.extraParams ?? {}, null, 2)); setKeyDraft(""); setHint(null); setModels([]); setNotice(null); setError(null); void providerKeyHint(profile.id).then(setHint).catch(() => setError("failed")); }
  function parsed(): ImageProviderConfig | null { try { const value = { ...draft, extraParams: JSON.parse(extra) }; return validImageProviderConfig(value) ? value : null; } catch { return null; } }
  function pickModel(profile: ImageProviderConfig, name: "modelId" | "editModelId", id: string): ImageProviderConfig {
    const limit = models.find(m => m.id === id)?.maxInputImages;
    // The API-reported limit replaces the manual value; the manual value stays as typed when the
    // chosen model belongs to generation only and references still use the main model.
    const applies = name === "editModelId" || !profile.editModelId;
    return { ...profile, [name]: id, ...(applies && limit ? { maxReferences: limit } : {}) };
  }
  async function saveProfile() {
    const value = parsed(); if (!value) { setError("invalid"); return; }
    await act(async () => { await commit({ ...settings, profiles: [...settings.profiles.filter(p => p.id !== value.id), value] }); setDraft(value); });
  }
  const selected = settings.profileByLevel[settings.contentLevel] ?? "";
  return <section className="settings-card dr-image-settings" aria-label={t("title")}>
    <header><h2>{t("title")}</h2></header><div>
      <label className="toggle-row"><span>{t("enabled")}</span><input type="checkbox" role="switch" checked={settings.enabled} disabled={busy} onChange={event => void act(() => commit({ ...settings, enabled: event.target.checked }))} /></label>
      <p className="setting-copy">{t("disclosure")}</p>
      <label className="field-label"><span>{t("level")}</span><Select value={settings.contentLevel} disabled={busy} onChange={event => { const level = event.target.value as Settings["contentLevel"]; if (level === ADULT_CONTENT_LEVEL && settings.adultConfirmed !== true) { setError(null); setNotice(null); setGate(true); return; } setGate(false); void act(() => commit({ ...settings, contentLevel: level })); }}>{IMAGE_CONTENT_LEVELS.map(level => <option key={level.id} value={level.id}>{level[locale]}</option>)}</Select></label>
      {(settings.contentLevel === ADULT_CONTENT_LEVEL || gate) && <label className="toggle-row"><span>{t("adultToggle")}</span><input type="checkbox" role="switch" checked={settings.adultConfirmed === true} disabled={busy} onChange={event => { const adultConfirmed = event.target.checked; if (!adultConfirmed && settings.contentLevel === ADULT_CONTENT_LEVEL) { setGate(true); void act(() => commit({ ...settings, contentLevel: "off", adultConfirmed: false })); return; } setGate(false); void act(() => commit({ ...settings, adultConfirmed, ...(adultConfirmed && gate ? { contentLevel: ADULT_CONTENT_LEVEL } : {}) })); }} /></label>}
      <p className="setting-copy">{t("adultHint")}</p>
      {gate && settings.contentLevel !== ADULT_CONTENT_LEVEL && <p role="alert" className="error-text">{t("adultGate")}</p>}
      <label className="field-label"><span>{t("selected")}</span><Select value={selected} disabled={busy} onChange={event => { const profiles = { ...settings.profileByLevel }; if (event.target.value) profiles[settings.contentLevel] = event.target.value; else delete profiles[settings.contentLevel]; void act(() => commit({ ...settings, profileByLevel: profiles })); }}><option value="">{t("choose")}</option>{settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</Select></label>
      <p className="setting-copy">{t("oneClickHint")} {t("formats")}</p>
      <div className="field-label"><span>{t("style")}</span><textarea aria-label={t("style")} rows={3} maxLength={1200} defaultValue={settings.stylePrefix} key={settings.stylePrefix} onBlur={event => { if (event.target.value !== settings.stylePrefix) void act(() => commit({ ...settings, stylePrefix: event.target.value })); }} /></div><p className="setting-copy">{t("styleHint")}</p>
      <details><summary>{t("suffix")}</summary>{(["styleSuffix"] as const).map((name) => <div className="field-label" key={name}><span>{t("suffix")}</span><textarea aria-label={t("suffix")} maxLength={1200} defaultValue={settings[name]} key={settings[name]} onBlur={event => { if (event.target.value !== settings[name]) void act(() => commit({ ...settings, [name]: event.target.value })); }} /></div>)}
      </details><h3>{t("profiles")}</h3>
      {!settings.profiles.length && <p className="setting-copy">{t("empty")}</p>}
      <div className="dr-image-connections">{settings.profiles.map(profile => <button type="button" className="button secondary" key={profile.id} disabled={busy} aria-pressed={draft?.id === profile.id} onClick={() => edit(profile)}>{profile.label}</button>)}</div>
      <button type="button" className="button secondary" disabled={busy || settings.profiles.length >= 8} onClick={() => edit({ id: crypto.randomUUID(), label: "", kind: "openai-images", baseUrl: "", modelId: "", maxReferences: 1, enabled: false })}>{t("add")}</button>
      {draft && <fieldset className="dr-image-form" disabled={busy}>
        <label className="field-label"><span>{t("label")}</span><input maxLength={80} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
        <label className="field-label"><span>{t("protocol")}</span><Select value={draft.kind} onChange={event => { setDraft({ ...draft, kind: event.target.value as ImageProviderConfig["kind"], modelId: "", editModelId: "" }); setModels([]); }}><option value="openai-images">{t("openai")}</option><option value="venice-native">{t("venice")}</option></Select></label>
        <label className="field-label"><span>{t("baseUrl")}</span><input type="url" spellCheck={false} autoComplete="off" maxLength={2048} value={draft.baseUrl} onChange={event => { setDraft({ ...draft, baseUrl: event.target.value, modelId: "", editModelId: "" }); setModels([]); }} /></label>
        <label className="toggle-row"><span>{t("active")}</span><input type="checkbox" role="switch" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} /></label>
        <button type="button" className="button secondary" disabled={!onPermission} onClick={() => { const profile = parsed(); if (!profile) { setError("invalid"); return; } void act(async () => { if (!await onPermission!(profile)) throw new Error("permission"); setNotice("saved"); }); }}>{t("allow")}</button>
        <label className="field-label" htmlFor={id + "key"}><span>{t("key")}</span><input id={id + "key"} type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} value={keyDraft} onChange={event => setKeyDraft(event.target.value)} /></label>
        {hint && <p className="setting-copy">{t("keySaved", { last: hint })}</p>}<p className="setting-copy">{t("keyHint")}</p>
        <div className="button-row"><button type="button" className="button secondary" disabled={!keyDraft} onClick={() => void act(async () => { await saveProviderKey(draft.id, keyDraft); setHint(await providerKeyHint(draft.id)); setKeyDraft(""); setNotice("saved"); })}>{t("keySave")}</button><button type="button" className="button secondary danger" disabled={!hint} onClick={() => void act(async () => { await removeProviderKey(draft.id); setHint(null); })}>{t("keyRemove")}</button></div>
        <button type="button" className="button secondary" disabled={!onModels || !draft.enabled} onClick={() => { const profile = parsed(); if (!profile) { setError("invalid"); return; } void act(async () => { const values = await onModels!(profile); setModels(values); }); }}>{t("models")}</button>
        {(["modelId", "editModelId"] as const).map((name, i) => <label className="field-label" key={name}><span>{t(i ? "editModel" : "model")}</span><Select value={draft[name] ?? ""} onChange={event => setDraft(pickModel(draft, name, event.target.value))}><option value="">{t("choose")}</option>{draft[name] && !models.some(m => m.id === draft[name]) && <option value={draft[name]}>{draft[name]}</option>}{models.map(model => <option key={model.id} value={model.id}>{model.label}{model.uncensored ? ` · ${t("uncensored")}` : ""}{model.priceUsd !== undefined ? ` · ${new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(model.priceUsd)}` : ""}</option>)}</Select></label>)}
        <p className="setting-copy">{t("modelHint")}</p>
        <label className="field-label"><span>{t("references")}</span><input type="number" min={1} max={128} value={draft.maxReferences} onChange={event => setDraft({ ...draft, maxReferences: Number(event.target.value) })} /></label><p className="setting-copy">{t("fallback")}</p>
        <label className="field-label"><span>{t("extra")}</span><textarea spellCheck={false} maxLength={32000} value={extra} onChange={event => setExtra(event.target.value)} aria-invalid={error === "invalid"} aria-describedby={error ? id + "error" : undefined} /></label><p className="setting-copy">{t("extraHint")}</p>
        <button type="button" className="button primary" onClick={() => void saveProfile()}>{t("save")}</button>
        {settings.profiles.some(p => p.id === draft.id) && <button type="button" className="button secondary danger" onClick={() => void act(async () => { await commit({ ...settings, profiles: settings.profiles.filter(p => p.id !== draft.id), profileByLevel: Object.fromEntries(Object.entries(settings.profileByLevel).filter(([, value]) => value !== draft.id)) }); await removeProviderKey(draft.id); setDraft(null); })}>{t("remove")}</button>}
      </fieldset>}
      {!onModels && <p className="setting-copy">{t("pending")}</p>}
      {error && <p id={id + "error"} role="alert" className="error-text">{t(error)}</p>}
      <p role="status" aria-live="polite" className="setting-copy">{busy ? t("busy") : notice ? t(notice) : ""}</p>
    </div>
  </section>;
}
