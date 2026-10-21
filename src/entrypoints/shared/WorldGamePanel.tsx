import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../core/types";
import type { WorldGame } from "../../core/world-game";
import { worldGameText } from "../../core/world-game";
import { worldResetText } from "../../core/world-reset-i18n";
import { currentChatUrl } from "../../core/old-chat-notice";
import { WorldResetSetup } from "./WorldResetSetup";
import { WorldRestartDialog } from "./WorldRestartDialog";
import { worldRestartCopy } from "../../core/world-restart-copy";
import type { WorldRestartPreview } from "../../core/world-restart-preview";
export function WorldGamePanel({ locale, game, chatId, blocked = false, archives = 0, onResume, onReset, onUndoReset,worldId,worldName,onFullReset,restartPreview }: { locale: Locale; game: WorldGame; chatId: string; blocked?: boolean; archives?: number; onResume: () => Promise<void>; onReset: (base: string) => Promise<void>; onUndoReset?: () => Promise<void>;worldId?:string;worldName?:string;onFullReset?:()=>void;restartPreview?:WorldRestartPreview }) {
 const t = worldGameText(locale), full = worldResetText(locale), copy = worldRestartCopy(locale), active = game.activeChatId === chatId;
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [review, setReview] = useState<WorldRestartPreview | null>(null);
 const root = useRef<HTMLElement>(null), running = useRef(false);
 useEffect(() => { setReview(null); setError(""); }, [worldId, chatId]);
 const run = async (action: () => Promise<void>) => { if (running.current || blocked) return false; running.current = true; setBusy(true); setError(""); try { await action(); return true; } catch (e) { setError(e instanceof Error && ["story-review-stale", "story-game-reset-changed"].includes(e.message) ? copy.stale : copy.failed); return false; } finally { running.current = false; setBusy(false); } };
  return <section ref={root} className="settings-card dr-world-game-panel" aria-label={active ? copy.title : t.title}>
  <h2>{active ? copy.title : t.title}</h2>
  {active&&worldId&&<div className="dr-restart-main">
   <p>{copy.hint}</p>
    {onFullReset?<button type="button" className="button primary" disabled={blocked||busy} onClick={onFullReset}>{full.launch}</button>:<WorldResetSetup worldId={worldId} worldName={worldName??worldId} locale={locale} game={game} chatId={chatId} blocked={blocked||busy}/>}
   <p className="setting-copy">{copy.plan}</p><p className="setting-copy">{copy.keep}</p>
  </div>}
  {!active && <><p className="setting-copy">{t.body}</p><div className="button-row"><a className="button secondary" href={currentChatUrl(game.activeChatId)} target="_blank" rel="noopener noreferrer">{t.open}</a><button type="button" className="button" disabled={blocked || busy} onClick={() => void run(onResume)}>{t.resume}</button></div></>}
  {active && <details className="dr-restart-quick"><summary>{copy.quick}</summary><p className="setting-copy">{copy.quickHint}</p><button className="button secondary" type="button" disabled={busy || blocked || !restartPreview} onClick={() => { if (restartPreview) { setError(""); setReview(structuredClone(restartPreview)); } }}>{copy.preview}</button>{!restartPreview && <p className="setting-copy">{copy.unavailable}</p>}</details>}
   {active && game.restartPending && !Object.keys(game.scene?.states ?? {}).length && !game.scene?.presentIds.length && archives > 0 && onUndoReset && <button type="button" className="button secondary" disabled={blocked || busy} onClick={() => void run(onUndoReset)}>{locale === "ru" ? "Отменить перезапуск" : "Undo restart"}</button>}
   {archives > 0 && <p className="setting-copy">{locale === "ru" ? `Игр в архиве: ${archives}` : `Archived games: ${archives}`}</p>}
  {error && <p role="alert">{error}</p>}
  {review && createPortal(<WorldRestartDialog locale={locale} review={review} current={active ? restartPreview : undefined} busy={busy} error={error} blocked={blocked || !active} onClose={() => setReview(null)} onRefresh={() => { if (restartPreview) { setReview(structuredClone(restartPreview)); setError(""); } }} onApply={async base => { if (await run(() => onReset(base))) setReview(null); }}/>, (root.current?.getRootNode() instanceof ShadowRoot ? root.current.getRootNode() : document.body) as Element)}
 </section>;
}
