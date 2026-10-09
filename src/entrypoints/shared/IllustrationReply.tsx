import { useEffect, useRef, useState } from "react";
import { Image, RotateCcw, Trash2, LoaderCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { ImageReferenceReview } from "./ImageReferenceReview";
import type { ImageSettings } from "../../core/image-generation";
import type { ImageReferenceOverrides } from "../../core/image-references";
import type { SceneEntity } from "../../core/types";
import type { Illustration } from "../../core/image-generation";
import type { ImageAttempt } from "../../core/image-plan";
import type { ImageTarget } from "../../core/image-messages";
import type { Locale } from "../../core/types";
import { imageText } from "../../core/image-i18n";
import { ImageHeaders } from "./IllustrationEditor";
import { ImageErrorDetails } from "./ImageErrorDetails";
export interface IllustrationReplyProps {
  target: ImageTarget; sceneText: string; records: Illustration[]; attempts: ImageAttempt[]; locale: Locale; generating: boolean;
  entityNames?: Record<string, string>;
  entities?: SceneEntity[]; settings?: ImageSettings;
  onCreate(target: ImageTarget, sceneText: string, review?: boolean): Promise<void>;
  onConfirmReferences?(target: ImageTarget, id: string, overrides: ImageReferenceOverrides): Promise<void>;
  onCancelReferences?(target: ImageTarget, id: string): Promise<void>;
  onRepeat(target: ImageTarget, id: string, attempt?: boolean): Promise<void>;
  onRemove(target: ImageTarget, id: string): Promise<void>;
  onDownload(ticket: string): Promise<void>;
  onView(record: Illustration): void;
}
export function IllustrationReply(p: IllustrationReplyProps) {
  const [busy, setBusy] = useState<"generation" | "delete" | null>(null), pending = useRef(false);
  const [error, setError] = useState<{ operation: "generation" | "delete"; value: unknown }>();
  const baseline = useRef<string | undefined>(undefined), [selected, setSelected] = useState<string>();
  const [pixels, setPixels] = useState<{ key: string; width: number; height: number }>();
  const [generationPhase, setGenerationPhase] = useState<"prepareImage" | "generating" | "downloadResult">("prepareImage");
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const t = (key: Parameters<typeof imageText>[1]) => imageText(p.locale, key);
  const inReply = (row: ImageTarget | Illustration) => row.worldId === p.target.worldId && row.chatId === p.target.chatId && row.messageKey === p.target.messageKey;
  const records = p.records.filter(row => inReply(row) && !removed.has(row.id)).sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
  const attempt = p.attempts.filter(inReply).sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt).at(-1);
  const [, tick] = useState(0);
  useEffect(() => { if (!attempt || attempt.status === "failed" || attempt.status === "review") return; const timer = setTimeout(() => tick(n => n + 1), Math.max(1, attempt.updatedAt + 5 * 60_000 - Date.now() + 1)); return () => clearTimeout(timer); }, [attempt?.id, attempt?.updatedAt, attempt?.status]);
  const stale = !!attempt && attempt.status !== "review" && attempt.status !== "failed" && attempt.updatedAt + 5 * 60_000 < Date.now();
  const working = busy === "generation" && records.at(-1)?.id === baseline.current || !!attempt && attempt.status !== "review" && attempt.status !== "failed" && !stale;
  const failed = !working && (error?.operation === "generation" ? error.value : attempt?.error ? { code: attempt.error, diagnostic: attempt.diagnostic, headers: attempt.headers } : stale ? "timeout" : undefined);
  const reviewing = attempt?.status === "review" && attempt.review;
  const hasAttempt = !!working || !!failed || !!reviewing;
  const keys = [...records.map(record => "image:" + record.id), ...(hasAttempt ? ["attempt"] : [])];
  const latest = keys.at(-1), scope = JSON.stringify([p.target.worldId, p.target.chatId, p.target.messageKey]);
  useEffect(() => { setSelected(latest); }, [latest, scope]);
  useEffect(() => { setRemoved(new Set()); }, [scope]);
  const index = Math.max(0, selected && keys.includes(selected) ? keys.indexOf(selected) : keys.length - 1);
  const showingAttempt = keys[index] === "attempt", record = showingAttempt ? undefined : records[index];
  const pixelKey = record && record.id + ":" + record.updatedAt;
  function move(delta: number) { const next = keys[index + delta]; if (next) setSelected(next); }
  async function act(operation: "generation" | "delete", task: () => Promise<void>, phase: typeof generationPhase = "prepareImage") {
    if (pending.current || working) return;
    pending.current = true; baseline.current = records.at(-1)?.id; setBusy(operation); setError(undefined);
    if (operation === "generation") { setSelected("attempt"); setGenerationPhase(phase); }
    try { await task(); } catch (value) { setError({ operation, value }); } finally { pending.current = false; setBusy(null); }
  }
  const retryFailure = () => void act("generation", () => attempt?.ticketId ? p.onDownload(attempt.ticketId) : attempt?.request ? p.onRepeat(p.target, attempt.id, true) : p.onCreate(p.target, p.sceneText, !!attempt?.review), attempt?.ticketId ? "downloadResult" : attempt?.request ? "generating" : "prepareImage");
  return <section className="dr-illustration-reply" aria-label={t("generate")}>
    <button type="button" className="button secondary dr-image-generate" disabled={working || !!busy || !!reviewing || p.generating} onClick={() => void act("generation", () => p.onCreate(p.target, p.sceneText))}><Image size={16} />{t("generate")}</button>
    {!!keys.length && <div className="dr-image-gallery"><figure>
      <div className="dr-image-frame" style={{ aspectRatio: (record?.aspectRatio ?? attempt?.request?.input.aspectRatio ?? records.at(-1)?.aspectRatio ?? "16:9").replace(":", " / ") }}>
        {showingAttempt && reviewing && p.entities && p.settings && p.onConfirmReferences && p.onCancelReferences ? <ImageReferenceReview key={attempt!.id} review={reviewing} worldId={p.target.worldId} sceneText={p.sceneText} entities={p.entities} settings={p.settings} locale={p.locale} disabled={p.generating || !!busy} onConfirm={overrides => void act("generation", () => p.onConfirmReferences!(p.target, attempt!.id, overrides))} onCancel={() => void act("delete", () => p.onCancelReferences!(p.target, attempt!.id))} />
          : showingAttempt && working ? <div className="dr-image-loading" role="status" aria-live="polite"><LoaderCircle size={20} /><span>{t(attempt?.status === "generating" ? "generating" : busy === "generation" ? generationPhase : "prepareImage")}</span></div>
          : showingAttempt ? <div className="dr-image-error"><ImageErrorDetails error={failed} locale={p.locale} /><button type="button" className="button secondary" disabled={p.generating || !!busy} title={t("retryHint")} onClick={retryFailure}><RotateCcw size={15} />{t(attempt?.ticketId ? "downloadResult" : "retrySame")}</button></div>
          : record && <button className="dr-image-open" type="button" aria-label={t("view")} onClick={() => p.onView(record)}><img key={pixelKey} src={record.image} alt={record.prompt.slice(0, 200)} loading="lazy" onLoad={event => { const img = event.currentTarget; setPixels({ key: pixelKey!, width: img.naturalWidth, height: img.naturalHeight }); }} /></button>}
      </div>
      <div className="dr-image-history" role="group" tabIndex={0} aria-label={t("generationHistory")} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.currentTarget.focus(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
        <button type="button" className="button secondary" aria-label={t("previousGeneration")} title={t("previousGeneration")} disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <span aria-live="polite" aria-atomic="true">{imageText(p.locale, "generationCounter", { current: String(index + 1), total: String(keys.length) })}</span>
        <button type="button" className="button secondary" aria-label={t("nextGeneration")} title={t("nextGeneration")} disabled={index === keys.length - 1} onClick={() => move(1)}><ChevronRight size={18} /></button>
      </div>
      {record && <>
        {pixels && pixels.key === pixelKey && <small className="dr-image-pixels">{imageText(p.locale, "actualPixels", { width: String(pixels.width), height: String(pixels.height) })}</small>}
        <div className="dr-image-actions"><button type="button" className="button secondary" disabled={working || !!busy || !!reviewing || p.generating || !record.request} title={t(record.request ? "retryHint" : "oldRetry")} onClick={() => void act("generation", () => p.onRepeat(p.target, record.id), "generating")}><RotateCcw size={15} />{t("retrySame")}</button><button type="button" className="button secondary dr-image-delete" aria-label={t("deleteImage")} disabled={working || !!busy} onClick={() => void act("delete", async () => { await p.onRemove(p.target, record.id); setRemoved(previous => new Set(previous).add(record.id)); })}><Trash2 size={15} /></button></div>
        {!!record.request?.input.referenceChoices?.length && <ul className="dr-image-reference-result" aria-label={t("referenceResult")}>{record.request.input.referenceChoices.map(c => <li key={c.entityId}><span>{p.entityNames?.[c.entityId] ?? c.entityId}</span><small>{t(c.reference === "neutral" ? "referenceNeutral" : c.reference === "suggestive" ? "referenceSuggestive" : "referenceText")}</small></li>)}</ul>}
        <button type="button" className="button secondary dr-image-reference-edit" disabled={working || !!busy || !!reviewing || p.generating} onClick={() => void act("generation", () => p.onCreate(p.target, p.sceneText, true))}>{t("referenceEdit")}</button>
        <details className="dr-image-info"><summary>{t("details")} · {record.aspectRatio ?? "16:9"}</summary>
          {!!record.request?.input.entityIds?.length && <div className="dr-image-cast-summary">
            <strong>{imageText(p.locale, "frameCoverage", { attached: String(record.request.input.references?.length ?? 0), total: String(record.request.input.entityIds.length) })}</strong>
            <ul aria-label={t("frameCast")}>{record.request.input.entityIds.map(id => {
              const refIndex = record.request!.input.references?.findIndex(r => r.entityId === id) ?? -1;
              return <li key={id}><span>{p.entityNames?.[id] ?? id}</span><small>{refIndex >= 0 ? imageText(p.locale, "frameReference", { number: String(refIndex + 1) }) : t("frameTextOnly")}</small></li>;
            })}</ul>
            {(record.request.input.references?.length ?? 0) < record.request.input.entityIds.length && <small>{t("frameCoverageHint")}</small>}
          </div>}
          <p>{record.prompt}</p><small>{record.modelId}</small></details>
        <ImageHeaders headers={record.headers} locale={p.locale} />
      </>}
    </figure></div>}
    {reviewing && error?.operation === "generation" && <div className="dr-image-error"><ImageErrorDetails error={error.value} locale={p.locale} /></div>}
    {error?.operation === "delete" && <div className="dr-image-error"><ImageErrorDetails error={error.value} locale={p.locale} /></div>}
  </section>;
}
