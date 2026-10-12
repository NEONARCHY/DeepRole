import { useState } from "react";
import { currentChatUrl, oldChatNoticeText, type OldChatNotice } from "../../core/old-chat-notice";
import type { Locale } from "../../core/types";
export function OldChatNoticeCard({ locale, notice, onStay }: { locale: Locale; notice: OldChatNotice; onStay: () => Promise<void> }) {
 const t = oldChatNoticeText(locale), [busy, setBusy] = useState(false), [error, setError] = useState(false);
 return <section className="dr-old-chat-notice" aria-label={t.title}><strong>{t.title}</strong><p>{t.body}</p><div><a className="button primary" href={currentChatUrl(notice.targetChatId)} target="_blank" rel="noopener noreferrer">{t.open}</a><button type="button" className="button secondary" disabled={busy} onClick={() => { setBusy(true); setError(false); void onStay().catch(() => setError(true)).finally(() => setBusy(false)); }}>{t.stay}</button></div>{error && <p role="status">{t.failed}</p>}</section>;
}
