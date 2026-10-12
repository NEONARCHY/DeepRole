import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { storyIdentityText } from "../../core/story-identity-i18n";
import { validIdentityPage, identityKey, type IdentityAction, type IdentityPage, type IdentityRow } from "../../core/story-identity-management";
export function StoryIdentities({ locale, scope, onAction, onChanged, disabled }: { locale: Locale; scope: { worldId: string; chatId: string }; onAction: (action: IdentityAction) => Promise<IdentityPage>; onChanged: () => void; disabled: boolean }) {
 const t = (key: Parameters<typeof storyIdentityText>[1]) => storyIdentityText(locale, key);
 const [page, setPage] = useState<IdentityPage | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState<"saved" | "error" | null>(null);
 const mounted = useRef(false), running = useRef(false);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 async function run(action: IdentityAction) {
  if (running.current || disabled && action.action !== "read") return;
  running.current = true; setBusy(true); setNotice(null);
  try { const next = await onAction(action); if (!validIdentityPage(next) || next.worldId !== scope.worldId || next.chatId !== scope.chatId) throw Error("story-review-invalid"); if (mounted.current) { setPage(next); if (action.action === "approve") { setNotice("saved"); onChanged(); } } }
  catch { if (mounted.current) { setPage(null); setNotice("error"); } }
  finally { running.current = false; if (mounted.current) setBusy(false); }
 }
 const read = (offset = 0) => void run({ action: "read", input: { ...scope, offset } });
 const change = (row: IdentityRow) => page && void run({ action: "approve", input: { ...scope, offset: page.offset, guard: page.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: row.status === "disabled" } });
 return <section className="dr-story-review-preview"><p className="setting-copy">{t("hint")}</p><button className="button secondary" type="button" disabled={busy} onClick={() => read(page?.offset ?? 0)}>{t(busy ? "busy" : page ? "refresh" : "read")}</button><p role="status" aria-live="polite">{notice ? t(notice) : null}</p>
  {page && <>{page.paused && <p>{t("paused")}</p>}<p className="setting-copy">{t("scope")}</p>{!page.rows.length && <p>{t("empty")}</p>}
   {page.rows.map(row => <article className="dr-story-review-entry" key={identityKey(row.reference.entityId, row.reference.alias)}><h4>{row.reference.alias} → {row.name}</h4><p className="setting-copy">{t(row.inherited ? "inherited" : "current")}</p><p>{t(row.status)}</p>{row.status !== "canonical" && <button type="button" className="button secondary" disabled={busy || disabled || page.paused} onClick={() => change(row)}>{t(row.status === "disabled" ? "enable" : "disable")}</button>}</article>)}
   <div className="dr-story-review-actions">{page.offset > 0 && <button className="button secondary" type="button" disabled={busy} onClick={() => read(Math.max(0, page.offset - 40))}>{t("prev")}</button>}{page.next !== null && <button className="button secondary" type="button" disabled={busy} onClick={() => read(page.next!)}>{t("next")}</button>}</div>
  </>}
 </section>;
}
