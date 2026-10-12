import { browser } from "wxt/browser";
import { DeepSeekDomAdapter } from "./deepseek-dom";
import { nativeMessageRows, isUserMessage } from "./deepseek-message-dom";
import { CastReplyCapture } from "./cast-reply-capture";
import { deleteOwnedChat } from "./cast-worker";
import { castChatId } from "../core/cast-chat";
import type { FieldMessage } from "./isolated-field-coordinator";
import type { FieldWorkerStage } from "../core/field-runtime";
import { bootstrapFieldServiceScreen, createFieldServiceScreen, rememberFieldServiceScreen, finishFieldServiceScreenMarker } from "./field-service-screen";

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const chat = () => castChatId(location.pathname);
export async function startIsolatedFieldWorker(): Promise<boolean> {
 const earlyScreen = bootstrapFieldServiceScreen();
 const wanted = new URL(location.href).searchParams.get("deeprole_field_job") ?? undefined;
 const first = await browser.runtime.sendMessage({ type: "DR_FIELD_WORKER", action: "claim", id: wanted } satisfies FieldMessage).catch(() => null);
 if (!first?.ok) { earlyScreen?.update("failed"); return !!wanted || !!earlyScreen; }
 const screen = earlyScreen ?? createFieldServiceScreen(first.presentation?.locale === "en" ? "en" : "ru");
 rememberFieldServiceScreen(first.id, first.presentation?.locale === "en" || earlyScreen?.host.lang === "en" ? "en" : "ru");
 const id: string = first.id, adapter = new DeepSeekDomAdapter(), marker = `[Request ID: ${id}]`;
 let touched = false, stopped = false, cleaning = false, failedRequest = false, error = first.phase === "error", ownedChat: string | undefined = first.chatId;
 const capture = new CastReplyCapture(id, marker, false);
 const touch = (e: Event) => { if (!screen.owns(e) && e.isTrusted && (e.type === "input" || (e.target as Element)?.closest("a[href],button,[role=button]"))) touched = true; };
 document.addEventListener("click", touch, true); document.addEventListener("input", touch, true);
 const failure = (e: MessageEvent) => { if (e.source === window && e.data?.source === "deeprole-page-bridge" && e.data.type === "SERVICE_REQUEST_FAILED" && e.data.id === id) failedRequest = true; };
 window.addEventListener("message", failure);
 const call = async (m: FieldMessage) => { const r = await browser.runtime.sendMessage(m); if (!r?.ok) throw new Error(r?.error ?? "request-failed"); return r; };
 let stage: FieldWorkerStage = "opening";
 const progress = async (next: FieldWorkerStage) => {
  stage = next;
  if (!cleaning) screen.update(({ opening: "opening", ready: "preparing", sending: "sending", "waiting-reply": "waiting", "reply-received": "validating", cleanup: "cleanup", finished: "done" } as const)[next]);
  await call({ type: "DR_FIELD_WORKER", action: "progress", id, stage, visibility: document.visibilityState === "visible" ? "visible" : "hidden" }).catch(() => undefined);
 };
 const visibility = () => { void progress(stage); };
 document.addEventListener("visibilitychange", visibility);
 const cleanup = async () => {
  if (cleaning || stopped) return;
  cleaning = true; stopped = true; capture.stop(); let ok = false;
  screen.update("cleanup");
  try {
   if (!touched) {
    await call({ type: "DR_FIELD_WORKER", action: "authorize-cleanup", id });
    if (chat() && ownedChat === chat()) {
     if (adapter.isGenerating()) {
      const stop = [...document.querySelectorAll<HTMLElement>("[data-testid=stop-generation],button[aria-label*='Stop' i],button[aria-label*='Останов' i]")].find(n => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden"); stop?.click();
      for (let i = 0; adapter.isGenerating() && i < 40; i++) await pause(250);
     }
     if (!touched && !adapter.isGenerating()) ok = await deleteOwnedChat(ownedChat!, document, async ms => { if (touched) throw new Error("user-interrupted"); await pause(ms); if (touched) throw new Error("user-interrupted"); });
    } else if (!chat() && location.pathname === "/") ok = true;
   }
  } catch { /* Unknown ownership never authorizes deletion. */ }
  // Keep the last working step in diagnostics; phase/cleanup already describe
  // the outcome. A cancelled wait must not become generic "finished".
  try { await call({ type: "DR_FIELD_WORKER", action: "cleaned", id, chatId: ownedChat, ok }); }
  catch { if (ok) await call({ type: "DR_FIELD_WORKER", action: "cleaned", id, chatId: ownedChat, ok: false }).catch(() => undefined); }
  document.removeEventListener("click", touch, true); document.removeEventListener("input", touch, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("message", failure); browser.runtime.onMessage.removeListener(onMessage);
  if (ok) finishFieldServiceScreenMarker();
  screen.update(ok ? error ? "failed" : "done" : "cleanup-failed");
 };
 const onMessage = (m: any) => { if (m.type === "DR_FIELD_CLEANUP") { void cleanup(); return Promise.resolve({ ok: true }); } };
 browser.runtime.onMessage.addListener(onMessage);
 screen.configure(first.presentation, () => { if (cleaning || stopped) return; error = true; void call({ type: "DR_FIELD_WORKER", action: "error", id, error: "cancelled" }).catch(() => undefined).then(cleanup); });
 void (async () => {
  try {
   if (first.phase !== "running") { await cleanup(); return; }
   for (let i = 0; !adapter.getStatus().compatible && i < 60 && !stopped; i++) await pause(500);
   if (stopped) return;
   if (!adapter.getStatus().compatible) throw new Error("login-required");
   await progress("ready");
   const step = await call({ type: "DR_FIELD_WORKER", action: "claim", id });
   if (step.phase !== "running") { await cleanup(); return; }
   if (touched) throw new Error("user-interrupted");
   if (!step.awaiting) {
    if (chat() || nativeMessageRows(document).length) throw new Error("not-empty-chat");
    if (adapter.getDraft().trim()) throw new Error("draft-not-empty");
    if (!step.prompt || !step.prompt.includes(marker)) throw new Error("invalid-brief");
    // Record sent BEFORE clicking; reloads/suspension never duplicate this request.
    await call({ type: "DR_FIELD_WORKER", action: "sent", id });
    await progress("sending");
    if (stopped || touched) throw new Error("user-interrupted");
    if (!adapter.setDraft(step.prompt)) throw new Error("composer-unavailable");
    await pause(150);
    if (stopped || touched) throw new Error("user-interrupted");
    if (!adapter.submitDraft()) { adapter.setDraft(""); throw new Error("composer-unavailable"); }
    // Keep the native composer's normal focus lifecycle through submission.
    // Once sent, keyboard focus returns to the visible cancel control.
    screen.focus();
   }
   await progress("waiting-reply");
   const started = Date.now(); let last = "", stable = Date.now(), response = "", heartbeat = Date.now();
   while (Date.now() - started < 7 * 60_000) {
    if (stopped) return;
    if (Date.now() - heartbeat >= 20000) { heartbeat = Date.now(); await call({ type: "DR_FIELD_WORKER", action: "progress", id, stage, visibility: document.visibilityState === "visible" ? "visible" : "hidden" }); }
    if (touched) throw new Error("user-interrupted");
    if (ownedChat && chat() !== ownedChat) throw new Error("chat-changed");
    const raw = capture.scan();
    const generating = adapter.isGenerating();
    screen.update(raw ? "generating" : generating && document.querySelector(".ds-think-content,.ds-think-content-wrapper,[data-testid*=thinking],[data-testid*=reasoning]")?.textContent?.trim() ? "thinking" : "waiting");
    if (!ownedChat && chat() && nativeMessageRows(document).some(row => isUserMessage(row) && (row.textContent ?? "").includes(marker))) {
     const current = chat()!; await call({ type: "DR_FIELD_WORKER", action: "bound", id, chatId: current }); ownedChat = current;
    }
    if (failedRequest) throw new Error("request-failed");
    if (raw !== last) { last = raw; stable = Date.now(); }
    if (raw && ownedChat && !generating && Date.now() - stable >= 1500) { response = raw; break; }
    await pause(500);
   }
   if (!response || !ownedChat) throw new Error("reply-timeout");
   if (stopped || touched || chat() !== ownedChat) throw new Error("user-interrupted");
   await progress("reply-received");
   await call({ type: "DR_FIELD_WORKER", action: "reply", id, chatId: ownedChat, raw: response });
  } catch (e) { error = true; await call({ type: "DR_FIELD_WORKER", action: "error", id, error: e instanceof Error ? e.message : "request-failed" }).catch(() => undefined); }
  await cleanup();
 })();
 return true;
}
