import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { DeepRoleMessage } from "../../core/messages";
import type { Locale } from "../../core/types";
import type { MemoryBatchInput, MemoryBatchPolicy, MemoryBatchStatus } from "../../core/story-memory-batch";
import { memoryBatchText } from "../../core/story-memory-batch-i18n";
const activeSend = async (message: DeepRoleMessage) => {
 const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
 if (!tab?.id) throw Error("scene-changed"); return browser.tabs.sendMessage(tab.id, message);
};
export function StoryMemoryBatchPanel({ locale, scope, recording, blocked, revision, send = activeSend }: { locale: Locale; scope: { worldId: string; chatId: string }; recording: boolean; blocked: boolean; revision?: string; send?: typeof activeSend }) {
 const t = memoryBatchText(locale), [status, setStatus] = useState<MemoryBatchStatus>(), [busy, setBusy] = useState(false), [error, setError] = useState(false), [saved, setSaved] = useState(false);
 const input: MemoryBatchInput = { ...scope, force: false };
 useEffect(() => {
  let active = true;
  const read = async () => { if (!recording || blocked) return; try { const r = await send({ type: "DR_MEMORY_BATCH", action: "status", input }); if (r?.ok && active) setStatus(r.data); } catch { /* Preserve the last status until a safe refresh. */ } };
  void read(); const timer = window.setInterval(() => void read(), 4000);
  return () => { active = false; window.clearInterval(timer); };
 }, [scope.worldId, scope.chatId, recording, blocked, revision, send]);
 const action = async (mode?: MemoryBatchPolicy["mode"], run = false, cancel = false) => {
  if (busy && !cancel || blocked) return; setBusy(!cancel); setError(false); setSaved(false);
  try {
   if (mode) { const r = await send({ type: "DR_MEMORY_BATCH", action: "policy", input, mode }); if (!r?.ok) throw Error("failed"); }
   if (run || cancel) { const r = await send({ type: "DR_MEMORY_BATCH", action: cancel ? "cancel" : "run", input: { ...input, force: true } }); if (!r?.ok) throw Error("failed"); }
   const r = await send({ type: "DR_MEMORY_BATCH", action: "status", input }); if (r?.ok) setStatus(r.data); setSaved(true);
  } catch { setError(true); } finally { setBusy(false); }
 };
 const mode = status?.mode ?? "off", running = status?.reason === "running";
 return <section className="settings-card dr-memory-batch" aria-label={t.title}><h2>{t.title}</h2><p className="setting-copy">{t.intro}</p><p className="setting-copy">{t.cost}</p>
 {!recording ? <p>{t.start}</p> : <><strong>{mode === "automatic" ? t.enabled : mode === "paused" ? t.paused : t.disabled}</strong>
 {status && <><p>{t.pending}: {new Intl.NumberFormat(locale).format(status.pendingTurns)} · {t.processed}: {new Intl.NumberFormat(locale).format(status.processedSources)}</p>{!["disabled","paused"].includes(status.reason) && <p role="status">{t[status.reason as "waiting" | "running" | "failed" | "ready" | "inactive" | "service-busy"]}</p>}</>}
 <div className="button-row">{mode !== "automatic" ? <button className="button secondary" type="button" disabled={busy || blocked} onClick={() => void action("automatic")}>{mode === "paused" ? t.resume : t.enable}</button> : <button className="button secondary" type="button" disabled={busy || blocked} onClick={() => void action("paused")}>{t.pause}</button>}
 {mode !== "off" && <button className="button secondary" type="button" disabled={busy || blocked} onClick={() => void action("off")}>{t.disable}</button>}
 {mode === "automatic" && !!status?.pendingTurns && !running && <button className="button secondary" type="button" disabled={busy || blocked || status.reason === "inactive" || status.reason === "service-busy"} onClick={() => void action(status.reason === "failed" ? "automatic" : undefined, true)}>{status.reason === "failed" ? t.retry : t.run}</button>}
 {(running || busy) && <button className="button secondary" type="button" disabled={blocked} onClick={() => void action(undefined, false, true)}>{t.cancel}</button>}</div></>}
 {error && <p role="alert">{t.error}</p>}{saved && <p role="status">{t.saved}</p>}
 </section>;
}
