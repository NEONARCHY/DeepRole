import { useEffect, useRef, useState } from "react";
import { Image, RotateCcw, Trash2, LoaderCircle } from "lucide-react";
import type { Illustration } from "../../core/image-generation";
import type { ImageAttempt } from "../../core/image-plan";
import type { ImageTarget } from "../../core/image-messages";
import type { Locale } from "../../core/types";
import { imageText, imageErrorKey } from "../../core/image-i18n";
import { ImageHeaders } from "./IllustrationEditor";
export interface IllustrationReplyProps {
  target: ImageTarget; sceneText: string; records: Illustration[]; attempts: ImageAttempt[]; locale: Locale; generating: boolean;
  onCreate(target: ImageTarget, sceneText: string): Promise<void>;
  onRepeat(target: ImageTarget, id: string, attempt?: boolean): Promise<void>;
  onRemove(target: ImageTarget, id: string): Promise<void>;
  onDownload(ticket: string): Promise<void>;
  onView(record: Illustration): void;
}
export function IllustrationReply(p: IllustrationReplyProps) {
  const [busy, setBusy] = useState(false), pending = useRef(false), [error, setError] = useState<unknown>();
  const t = (key: Parameters<typeof imageText>[1]) => imageText(p.locale, key);
  const [, tick] = useState(0);
  useEffect(() => { const latest = p.attempts.at(-1); if (!latest || latest.status === "failed") return; const timer = setTimeout(() => tick(n => n + 1), Math.max(1, latest.updatedAt + 5 * 60_000 - Date.now() + 1)); return () => clearTimeout(timer); }, [p.attempts]);
  const attempt = p.attempts.at(-1), stale = !!attempt && attempt.status !== "failed" && attempt.updatedAt + 5 * 60_000 < Date.now();
  const working = busy || !!attempt && attempt.status !== "failed" && !stale;
  const failed = !working && (error || attempt?.error || stale && "timeout");
  async function act(task: () => Promise<void>) {
    if (pending.current) return; pending.current = true; setBusy(true); setError(undefined);
    try { await task(); } catch (error) { setError(error); } finally { pending.current = false; setBusy(false); }
  }
  return <section className="dr-illustration-reply" aria-label={t("generate")}>
    <button type="button" className="button secondary dr-image-generate" disabled={working || p.generating} onClick={() => void act(() => p.onCreate(p.target, p.sceneText))}><Image size={16} />{t("generate")}</button>
    {working && <div className="dr-image-loading" role="status" aria-live="polite"><LoaderCircle size={20} /><span>{t(attempt?.status === "generating" ? "generating" : "prepareImage")}</span></div>}
    {failed && <div className="dr-image-error"><p role="alert">{t(imageErrorKey(typeof failed === "string" ? { code: failed } : failed))}</p>{attempt?.ticketId ? <button type="button" className="button secondary" onClick={() => void act(() => p.onDownload(attempt.ticketId!))}>{t("downloadResult")}</button> : <button type="button" className="button secondary" disabled={p.generating || working} title={t("retryHint")} onClick={() => void act(() => attempt?.request ? p.onRepeat(p.target, attempt.id, true) : p.onCreate(p.target, p.sceneText))}><RotateCcw size={15} />{t("retrySame")}</button>}</div>}
    <div className="dr-image-gallery">{p.records.map(record => <figure key={record.id}>
      <button className="dr-image-open" type="button" aria-label={t("view")} onClick={() => p.onView(record)}><img src={record.image} alt={record.prompt.slice(0, 200)} loading="lazy" /></button>
      <div className="dr-image-actions"><button type="button" className="button secondary" disabled={working || p.generating || !record.request} title={t(record.request ? "retryHint" : "oldRetry")} onClick={() => void act(() => p.onRepeat(p.target, record.id))}><RotateCcw size={15} />{t("retrySame")}</button><button type="button" className="button secondary dr-image-delete" aria-label={t("deleteImage")} disabled={working} onClick={() => void act(() => p.onRemove(p.target, record.id))}><Trash2 size={15} /></button></div>
      <details className="dr-image-info"><summary>{t("details")} · {record.aspectRatio ?? "16:9"}</summary><p>{record.prompt}</p><small>{record.modelId}</small></details>
      <ImageHeaders headers={record.headers} locale={p.locale} />
    </figure>)}</div>
  </section>;
}
