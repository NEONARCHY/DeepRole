import { useState } from "react";
import { castPreparationReady } from "../../core/cast-progress";
import { worldResetText } from "../../core/world-reset-i18n";
import type { Locale } from "../../core/types";
import type { WorldGame } from "../../core/world-game";
import type { CastMessage } from "../../adapters/cast-coordinator";
import { sendCastMessage, useWorldResetJob } from "./useWorldResetJob";

/** The page can reveal the extension review, but cannot confirm or apply it. */
export function WorldResetNotice({ worldId, chatId, locale, game,onReview,send=sendCastMessage }: { worldId: string; chatId: string; locale: Locale; game?:WorldGame;onReview: (id: string) => void;send?:(message:CastMessage)=>Promise<any> }) {
  const { job, setJob } = useWorldResetJob(worldId,send), [dismissing, setDismissing] = useState(false), t = worldResetText(locale);
  if (!job || !job.reset || job.reset.chatId !== chatId || job.statusHidden || !castPreparationReady(job) || !["done", "none"].includes(job.cleanup)) return null;
  if(game&&(game.activeChatId!==chatId||game.id!==job.reset.gameId||game.revision!==job.reset.revision))return null;
  return <section className="dr-reset-ready-notice" aria-label={t.title}>
    <strong role="status">{t.readyTitle}</strong><p>{t.readyHint}</p>
    <button type="button" className="dr-meter-transfer" onClick={() => onReview(job.id)}>{t.review}</button>
    <button type="button" disabled={dismissing} onClick={async () => {
      setDismissing(true);
      try { const result = await send({ type: "DR_CAST", action: "hide", id: job.id }); if (result?.ok) setJob(result.job ?? { ...job, statusHidden: true }); }
      catch { /* Keep the notice available when dismissal could not be saved. */ }
      finally { setDismissing(false); }
    }}>{t.later}</button>
  </section>;
}
