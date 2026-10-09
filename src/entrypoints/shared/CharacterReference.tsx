import { useRef, useState } from "react";
import { imageText } from "../../core/image-i18n";
import { IMAGE_REFERENCE_POLICIES, type ImageReferencePolicy } from "../../core/image-references";
import { Select } from "./Select";
import { Pin, Upload, X } from "lucide-react";
import type { CharacterSheet, Locale } from "../../core/types";
import { imageReferences } from "../../core/image-prompt";
import { withPortraitLibrary } from "../../core/portrait-library";
import { selfieImageKey } from "../../core/selfies";
import { selfieText } from "../../core/selfie-i18n";
import { readPortrait } from "./portrait-file";
import { portraitUploadError } from "../../core/portrait-upload-i18n";
import { openPortraitViewer } from "../../adapters/portrait-viewer";
import { usePortraitUploadChoice } from "./PortraitUploadChoice";
import { ReferencePreviewSize } from "./ReferencePreviewSize";

export function CharacterReference({ sheet, name, locale, disabled, onChange, onBusy }: { sheet: CharacterSheet; name: string; locale: Locale; disabled: boolean; onChange(sheet: CharacterSheet): void; onBusy(busy: boolean): void }) {
  const file = useRef<HTMLInputElement>(null), [error, setError] = useState(""), [limit, setLimit] = useState(24);
  const [variant, setVariant] = useState<"neutral" | "suggestive">("neutral");
  const uploadChoice = usePortraitUploadChoice(locale);
  const [previewSize, setPreviewSize] = useState(128);
  const slot = variant === "neutral" ? "referenceKey" : "suggestiveReferenceKey";
  const contextSlot = variant === "neutral" ? "referenceContext" : "suggestiveReferenceContext";
  const images = imageReferences(sheet), referenceKey = sheet.imageGeneration?.[slot], pinned = images.find(image => image.key === referenceKey);
  const t = (key: Parameters<typeof selfieText>[1]) => selfieText(locale, key);
  const pin = (next: CharacterSheet, key?: string) => {
    const profile = { canonical: next.appearance, sceneDelta: "", prefix: "", suffix: "", format: "prose" as const, ...next.imageGeneration };
    if (key) profile[slot] = key; else delete profile[slot];
    onChange({ ...next, imageGeneration: profile }); setError("");
  };
  return <section className="dr-character-reference" style={{ "--dr-reference-size": `${previewSize}px` } as import("react").CSSProperties} aria-label={t("referenceFor") + " " + name}>
    {uploadChoice.dialog}
    <h3><Pin size={16} />{t("reference")}</h3><p className="dr-character-hint">{t("referenceHint")}</p>
    <div className="field-label dr-reference-policy"><span>{imageText(locale, "referencePolicy")}</span><Select aria-label={imageText(locale, "referencePolicy")} value={sheet.imageGeneration?.referencePolicy ?? "auto"} disabled={disabled} onChange={event => onChange({ ...sheet, imageGeneration: { canonical: sheet.appearance, sceneDelta: "", prefix: "", suffix: "", format: "prose", ...sheet.imageGeneration, referencePolicy: event.target.value as ImageReferencePolicy } })}>{IMAGE_REFERENCE_POLICIES.map(value => <option key={value} value={value}>{imageText(locale, value === "auto" ? "referenceAuto" : value === "neutral" ? "referenceNeutral" : "referenceSuggestive")}</option>)}</Select></div>
    <p className="dr-character-hint">{imageText(locale, "referencePolicyHint")}</p>
    <ReferencePreviewSize locale={locale} onSize={setPreviewSize} />
    <p className="dr-character-hint">{t("twoReferences")}</p><div className="dr-reference-slots" role="group" aria-label={t("reference")}>{(["neutral", "suggestive"] as const).map(value => <button type="button" key={value} disabled={disabled} aria-pressed={variant === value} onClick={() => { setVariant(value); setError(""); }}>{t(value)}{sheet.imageGeneration?.[value === "neutral" ? "referenceKey" : "suggestiveReferenceKey"] ? " · ✓" : ""}</button>)}</div>
    {pinned ? <div className="dr-pinned-reference"><button type="button" aria-label={t("referenceFor") + " " + name} onClick={e => openPortraitViewer(e.currentTarget.ownerDocument, pinned.image, name, locale)}><img src={pinned.image} alt={name} /></button><div><strong>{name || t("pinned")}</strong><small>{t("pinned")}</small><button type="button" disabled={disabled} onClick={() => pin(sheet)}><X size={14} />{t("unpin")}</button></div></div> : <p role={referenceKey ? "status" : undefined} className="dr-character-hint">{t(referenceKey ? "missing" : "noReference")}</p>}
    <button type="button" disabled={disabled} onClick={() => file.current?.click()}><Upload size={16} />{t("upload")}</button>
    {images.length > 0 && <details className="dr-reference-picker"><summary>{t("pick")} · {images.length}</summary><div className="dr-reference-grid">{images.slice(0, limit).map((image, index) => <button type="button" key={image.key} disabled={disabled} aria-label={t("referenceFor") + " " + name + " " + (index + 1)} aria-pressed={image.key === referenceKey} onClick={() => pin(sheet, image.key)}><img src={image.image} alt={name} loading="lazy" /></button>)}</div>{images.length > limit && <button type="button" onClick={() => setLimit(n => n + 24)}>{t("more")}</button>}</details>}
    <div className="dr-reference-context"><span>{t("referenceContext")}</span><textarea aria-label={t("referenceContext")} rows={2} maxLength={600} disabled={disabled} value={sheet.imageGeneration?.[contextSlot] ?? ""} onChange={e => onChange({ ...sheet, imageGeneration: { canonical: sheet.appearance, sceneDelta: "", prefix: "", suffix: "", format: "prose", ...sheet.imageGeneration, [contextSlot]: e.target.value } })} /></div>
    <small className="dr-character-hint">{t("private")}</small>{error && <p role="alert">{error}</p>}
    <input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
      const selected = e.target.files?.[0]; e.target.value = ""; if (!selected) return;
      onBusy(true); setError(""); void uploadChoice.choose([selected]).then(async mode => { if (!mode) return; const image = await readPortrait(selected, mode); pin(withPortraitLibrary(sheet, [...(sheet.portraitLibrary ?? []), image]), selfieImageKey(image)); }).catch(cause => setError(portraitUploadError(locale, cause, t("uploadError")))).finally(() => onBusy(false));
    }} />
  </section>;
}
