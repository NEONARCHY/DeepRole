import { useState } from "react";
import { Image, Check, X } from "lucide-react";
import type { ImageSettings } from "../../core/image-generation";
import type { ImagePlanReview } from "../../core/image-plan";
import type { Locale, SceneEntity } from "../../core/types";
import { IMAGE_REFERENCE_POLICIES, imageReviewContextKey, resolveImageReferences, type ImageReferenceOverrides } from "../../core/image-references";
import { imageText } from "../../core/image-i18n";
import { openPortraitViewer } from "../../adapters/portrait-viewer";

export function ImageReferenceReview(p: { review: ImagePlanReview; worldId: string; sceneText: string; entities: SceneEntity[]; settings: ImageSettings; locale: Locale; disabled: boolean; onConfirm(overrides: ImageReferenceOverrides): void; onCancel(): void }) {
  const t = (key: Parameters<typeof imageText>[1]) => imageText(p.locale, key);
  const [overrides, setOverrides] = useState<ImageReferenceOverrides>(() => p.review.overrides ?? Object.fromEntries(p.review.plan.characters.map(c => [c.id, p.entities.find(e => e.id === c.id)?.characterSheet?.imageGeneration?.referencePolicy ?? "auto"])));
  let cast: ReturnType<typeof resolveImageReferences> = [], changed = p.sceneText !== p.review.sceneText;
  try {
    cast = resolveImageReferences(p.review.plan, p.worldId, p.entities, p.settings, overrides);
    changed ||= imageReviewContextKey(p.review.plan, p.worldId, p.entities, p.settings) !== p.review.contextKey;
  } catch { changed = true; }
  return <section className="dr-image-review" aria-label={t("reviewTitle")}>
    <header><strong>{t("reviewTitle")}</strong><span>16:9</span></header>
    <p>{t("reviewHint")}</p>
    {changed && <p className="error-text" role="alert">{t("reviewChanged")}</p>}
    {!changed && !cast.length && <p>{t("reviewLandscape")}</p>}
    <div className="dr-image-review-cast">{cast.map(c => <article key={c.person.id} className="dr-image-review-person">
      <div className="dr-image-review-identity">
        {c.attached && c.selected ? <button type="button" className="dr-image-review-photo" aria-label={c.person.name + " · " + t("view")} onClick={event => openPortraitViewer(event.currentTarget.ownerDocument, c.selected!.image, c.person.name, p.locale)}><img src={c.selected.image} alt={c.person.name} /></button> : <div className="dr-image-review-photo dr-image-review-empty"><Image size={20} aria-hidden="true" /></div>}
        <div><strong>{c.person.name}</strong><small>{t(c.reference === "neutral" ? "referenceNeutral" : c.reference === "suggestive" ? "referenceSuggestive" : "referenceText")}</small></div>
      </div>
      <div className="dr-image-reference-options" role="group" aria-label={c.person.name + " · " + t("referencePolicy")}>
        {IMAGE_REFERENCE_POLICIES.map(policy => <button type="button" key={policy} aria-pressed={c.policy === policy} disabled={p.disabled || changed || policy === "neutral" && !c.neutral || policy === "suggestive" && (!c.suggestive || p.settings.contentLevel === "off")} onClick={() => setOverrides(previous => ({ ...previous, [c.person.id]: policy }))}>{t(policy === "auto" ? "referenceAuto" : policy === "neutral" ? "referenceNeutral" : "referenceSuggestive")}</button>)}
      </div>
      {c.reason && <small>{t(c.reason)}</small>}
      {c.policy === "auto" && c.chosen.referenceReason && <small className="dr-image-review-reason">{c.chosen.referenceReason}</small>}
    </article>)}</div>
    <details><summary>{t("reviewDescription")}</summary><p>{p.review.plan.scene}</p></details>
    <footer><button type="button" className="button secondary" disabled={p.disabled} onClick={p.onCancel}><X size={15} />{t("reviewCancel")}</button><button type="button" className="button primary" disabled={p.disabled || changed} onClick={() => p.onConfirm(overrides)}><Check size={15} />{t("reviewGenerate")}</button></footer>
  </section>;
}
