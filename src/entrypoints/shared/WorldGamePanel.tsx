import { useState } from "react";
import type { Locale } from "../../core/types";
import type { WorldGame } from "../../core/world-game";
import { worldGameText } from "../../core/world-game";
import { currentChatUrl } from "../../core/old-chat-notice";
import { WorldResetSetup } from "./WorldResetSetup";
export function WorldGamePanel({ locale, game, chatId, blocked = false, archives = 0, onResume, onReset, onUndoReset,worldId,worldName,onFullReset }: { locale: Locale; game: WorldGame; chatId: string; blocked?: boolean; archives?: number; onResume: () => Promise<void>; onReset: () => Promise<void>; onUndoReset?: () => Promise<void>;worldId?:string;worldName?:string;onFullReset?:()=>void }) {
 const t = worldGameText(locale), active = game.activeChatId === chatId;
 const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
 const run = async (action: () => Promise<void>) => { if (busy || blocked) return; setBusy(true); setError(""); try { await action(); setConfirmed(false); } catch { setError(t.failed); } finally { setBusy(false); } };
 return <section className="settings-card dr-world-game-panel" aria-label={t.active}>
  <h2>{active ? t.active : t.title}</h2>
  {active&&worldId&&<><p className="setting-copy">{locale==="ru"?"Полный сброс сверяет начало с лором. Обычный «Начать игру заново» ниже использует уже сохранённые начальные значения.":"Full reset reviews the opening against lore. Start over below uses already saved initial values."}</p>{onFullReset?<button type="button" className="button secondary" disabled={blocked||busy} onClick={onFullReset}>{locale==="ru"?"Полный сброс мира по лору":"Full world reset from lore"}</button>:<WorldResetSetup worldId={worldId} worldName={worldName??worldId} locale={locale} game={game} chatId={chatId} blocked={blocked}/>}</>}
  {!active && <><p className="setting-copy">{t.body}</p><div className="button-row"><a className="button secondary" href={currentChatUrl(game.activeChatId)} target="_blank" rel="noopener noreferrer">{t.open}</a><button type="button" className="button" disabled={blocked || busy} onClick={() => void run(onResume)}>{t.resume}</button></div></>}
  {active && <details><summary>{t.restart}</summary><p className="setting-copy">{t.reset}</p><label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={blocked || busy} onChange={e => setConfirmed(e.target.checked)}/><span>{locale === "ru" ? "Сбросить прогресс и сохранить предыдущую игру" : "Reset progress and archive the previous game"}</span></label><button type="button" className="button danger" disabled={!confirmed || blocked || busy} onClick={() => void run(onReset)}>{t.restart}</button></details>}
  {active && game.restartPending && !Object.keys(game.scene?.states ?? {}).length && !game.scene?.presentIds.length && archives > 0 && onUndoReset && <button type="button" className="button secondary" disabled={blocked || busy} onClick={() => void run(onUndoReset)}>{locale === "ru" ? "Отменить начало новой игры" : "Undo starting over"}</button>}
  {archives > 0 && <p className="setting-copy">{locale === "ru" ? `В истории сохранено игр: ${archives}. Они входят в полную резервную копию.` : `${archives} games archived in history. They are included in full backups.`}</p>}
  {error && <p role="alert">{error}</p>}
 </section>;
}
