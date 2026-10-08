import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Select } from "./Select";
import type { Locale, SceneEntity } from "../../core/types";
import type { CharacterImagePrompt, ImageSettings, Illustration, ImageResponseHeaders } from "../../core/image-generation";
import { validCharacterImagePrompt } from "../../core/image-generation";
import { buildImagePrompt, imageReferences } from "../../core/image-prompt";
import { imageText, imageErrorKey, type ImageCopyKey } from "../../core/image-i18n";
import type { ImageJobInput, ImageTarget } from "../../core/image-messages";
export interface IllustrationEditorProps {
  locale: Locale; target: ImageTarget; entities: SceneEntity[]; settings: ImageSettings; sceneText: string;
  onClose(): void; onGenerate(input: ImageJobInput): Promise<Illustration>;
  onSaveProfile(entityId: string, profile: CharacterImagePrompt, expected: CharacterImagePrompt | null): Promise<void>;
  onDelta?(canonical: string, scene: string, name: string): Promise<string>;
  onDownload?(ticketId: string): Promise<void>;
}
export function ImageHeaders({ headers, locale }: { headers?: ImageResponseHeaders; locale: Locale }) {
  if (!headers || !Object.keys(headers).length) return null;
  const messages = Object.entries(headers).flatMap(([name, value]) => {
    if (name === "x-venice-model-deprecation-warning" && value && value !== "false") return ["deprecation" as const];
    if (value === "true" || value === "1") return [name === "x-venice-is-blurred" ? "blurred" as const : "violation" as const]; return [];
  });
  return <div className="dr-image-diagnostics">{messages.map(key => <p role="status" key={key}>{imageText(locale, key)}</p>)}<details><summary>{imageText(locale, "headers")}</summary>{Object.entries(headers).map(([name, value]) => <p key={name}><code>{name}</code>: {value}</p>)}</details></div>;
}
export function IllustrationEditor(props: IllustrationEditorProps) {
  const t = (key: ImageCopyKey) => imageText(props.locale, key);
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ImageCopyKey | null>(null), [headers, setHeaders] = useState<ImageResponseHeaders>();
  const [downloadTicket, setDownloadTicket] = useState<string>();
  const [entityId, setEntityId] = useState(props.entities[0]?.id ?? "");
  const person = props.entities.find(e => e.id === entityId);
  const base = person?.characterSheet?.imageGeneration;
  const initial = (): CharacterImagePrompt => base ? structuredClone(base) : { canonical: person?.characterSheet?.appearance ?? "", sceneDelta: "", prefix: "", suffix: "", format: "prose" };
  const [profile, setProfile] = useState(initial); const [savedBaseline, setSavedBaseline] = useState<CharacterImagePrompt | null>(base ?? null);
  const [referenceKeys, setReferenceKeys] = useState<string[]>(base?.referenceKey ? [base.referenceKey] : []); const [providerId, setProviderId] = useState(props.settings.profileByLevel[props.settings.contentLevel] ?? "");
  const config = props.settings.profiles.find(p => p.id === providerId), references = imageReferences(person?.characterSheet);
  const prompt = buildImagePrompt(profile, props.settings); const [saved, setSaved] = useState(false);
  useLayoutEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLSelectElement>("select")?.focus(); return () => dialog.current?.close(); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setProfile(initial()); setReferenceKeys(base?.referenceKey ? [base.referenceKey] : []); setSaved(false); setSavedBaseline(base ?? null); }, [entityId]);
  async function act(task: () => Promise<void>) {
    if (pending.current) return; pending.current = true; setBusy(true); setError(null); setHeaders(undefined);
    try { await task(); } catch (cause) { if (alive.current) { const e = cause as { headers?: ImageResponseHeaders; ticketId?: string }; setError(imageErrorKey(cause)); setHeaders(e?.headers); setDownloadTicket(e?.ticketId); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <dialog className="dr-image-modal dr-root" ref={dialog} aria-labelledby="dr-image-editor-title" onCancel={event => { event.preventDefault(); props.onClose(); }}>
    <header><h2 id="dr-image-editor-title">{t("generate")}</h2><button type="button" className="button secondary" onClick={props.onClose}>{t("close")}</button></header>
    <div className="dr-illustration-editor">
      <p>{t("disclosure")}</p>
      <fieldset disabled={busy} className="dr-illustration-editor">
        <label className="field-label"><span>{t("selected")}</span><Select value={providerId} onChange={event => { setProviderId(event.target.value); setReferenceKeys(base?.referenceKey ? [base.referenceKey] : []); }}><option value="">{t("choose")}</option>{props.settings.profiles.filter(p => p.enabled).map(p => <option key={p.id} value={p.id}>{p.label} · {p.modelId}</option>)}</Select></label>
        <label className="field-label"><span>{t("person")}</span><Select value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">{t("none")}</option>{props.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></label>
        <label className="field-label"><span>{t("canonical")}</span><textarea rows={3} maxLength={1200} value={profile.canonical} onChange={event => { setProfile({ ...profile, canonical: event.target.value }); setSaved(false); }} /></label>
        <label className="field-label"><span>{t("delta")}</span><textarea rows={3} maxLength={1200} value={profile.sceneDelta} onChange={event => { setProfile({ ...profile, sceneDelta: event.target.value }); setSaved(false); }} /></label>
        {props.onDelta && <button type="button" className="button secondary" onClick={() => { const before = profile.sceneDelta; void act(async () => { const delta = await props.onDelta!(profile.canonical, props.sceneText, person?.name ?? t("none")); if (alive.current) setProfile(value => value.sceneDelta === before ? { ...value, sceneDelta: delta } : value); }); }}>{t("deltaAi")}</button>}
        <details><summary>{t("profileHint")}</summary><div className="dr-illustration-editor">
          {(["prefix", "suffix"] as const).map(key => <label className="field-label" key={key}><span>{t(key)}</span><textarea rows={2} maxLength={1200} value={profile[key]} onChange={event => { setProfile({ ...profile, [key]: event.target.value }); setSaved(false); }} /></label>)}
          <label className="field-label"><span>{t("format")}</span><Select value={profile.format} onChange={event => setProfile({ ...profile, format: event.target.value as CharacterImagePrompt["format"] })}><option value="prose">{t("prose")}</option><option value="tags">{t("tags")}</option></Select></label>
          <label className="field-label"><span>{t("seed")}</span><input type="number" min={0} step={1} value={profile.seed ?? ""} onChange={event => { setProfile({ ...profile, seed: event.target.value ? Number(event.target.value) : undefined }); setSaved(false); }} /></label>
          {person?.characterSheet && <button type="button" className="button secondary" onClick={() => { if (!validCharacterImagePrompt(profile)) { setError("invalid"); return; } void act(async () => { await props.onSaveProfile(entityId, profile, savedBaseline); if (alive.current) { setSavedBaseline(structuredClone(profile)); setSaved(true); } }); }}>{t("savedProfile")}</button>}
          {saved && <p role="status">{t("saved")}</p>}
        </div></details>
        {references.length > 0 && <section aria-label={t("referencePick")}><h3>{t("referencePick")} · {referenceKeys.length}/{config?.maxReferences ?? 1}</h3><div className="dr-image-references">{references.map((ref, index) => <button type="button" key={ref.key} aria-label={`${t("referencePick")} ${index + 1}`} aria-pressed={referenceKeys.includes(ref.key)} disabled={!referenceKeys.includes(ref.key) && referenceKeys.length >= (config?.maxReferences ?? 1)} onClick={() => setReferenceKeys(current => current.includes(ref.key) ? current.filter(key => key !== ref.key) : [...current, ref.key])}><img src={ref.image} alt="" /></button>)}</div></section>}
      </fieldset>
      <details open><summary>{t("preview")}</summary><div className="dr-image-preview">{prompt || t("prompt")}</div></details>
      {error && <p className="error-text" role="alert">{t(error)}</p>}<ImageHeaders headers={headers} locale={props.locale} />
      {downloadTicket && props.onDownload && <button type="button" className="button secondary" onClick={() => void act(() => props.onDownload!(downloadTicket))}>{t("downloadResult")}</button>}
      <footer><p role="status" aria-live="polite">{busy ? t("generating") : ""}</p><button type="button" className="button primary" disabled={busy || !props.settings.enabled || !config?.enabled || !config.modelId || !profile.sceneDelta.trim()} onClick={() => { if (!validCharacterImagePrompt(profile) || prompt.length > 12_000) { setError("invalid"); return; } void act(async () => { await props.onGenerate({ ...props.target, providerId, ...(entityId ? { entityId } : {}), prompt, referenceKeys, ...(profile.seed === undefined ? {} : { seed: profile.seed }) }); if (alive.current) props.onClose(); }); }}>{busy ? t("generating") : t("generate")}</button></footer>
    </div>
  </dialog>;
}
