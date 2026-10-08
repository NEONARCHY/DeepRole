import { useState } from "react";
import { Camera } from "lucide-react";
import type { CharacterScene, Locale, SceneEntity } from "../../core/types";
import { selfieText, type SelfieCopyKey } from "../../core/selfie-i18n";
import { SelfieStatus } from "./SelfieAccess";
import { selfieCategories } from "../../core/selfies";
export function SelfieRequest({ person, hero, scene, locale, tracking, disabled, onRequest }: { person: SceneEntity; hero?: SceneEntity; scene?: CharacterScene; locale: Locale; tracking?: boolean; disabled?: boolean; onRequest(id: string): Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<SelfieCopyKey | null>(null);
  return <div className="dr-selfie-request"><SelfieStatus category={selfieCategories(person.characterSheet).find(c => c.default && c.images.length)} person={person} hero={hero} scene={scene} locale={locale} tracking={tracking} />
    <button type="button" disabled={disabled || busy} onClick={() => { setBusy(true); setError(null); void onRequest(person.id).catch(cause => { const reason = cause instanceof Error ? cause.message : ""; setError(reason === "draft-not-empty" ? "draftBusy" : reason === "busy" ? "busy" : "failed"); }).finally(() => setBusy(false)); }}><Camera size={16} />{selfieText(locale, busy ? "asking" : "ask")}</button>
    {error && <small role="alert">{selfieText(locale, error)}</small>}
  </div>;
}
