import { useState } from "react";
import { oldChatNoticeText, type OldChatNotice } from "../../core/old-chat-notice";
import type { Locale } from "../../core/types";
import { GameChatLink } from "./GameChatLink";
export function OldChatNoticeCard({ locale, notice, onStay }: { locale: Locale; notice: OldChatNotice; onStay: () => Promise<void> }) {
 const t = oldChatNoticeText(locale), [busy, setBusy] = useState(false), [error, setError] = useState(false);
 return <section className="dr-old-chat-notice" aria-label={t.title}>
  <strong>{t.title}</strong><p>{t.body}</p>
  <div>
   <GameChatLink key={notice.targetChatId} chatId={notice.targetChatId} locale={locale}>{t.open}</GameChatLink>
   <button type="button" className="button secondary" disabled={busy} onClick={() => { setBusy(true); setError(false); void onStay().catch(() => setError(true)).finally(() => setBusy(false)); }}>{t.stay}</button>
  </div>
  {error && <p role="status">{t.failed}</p>}
 </section>;
}
