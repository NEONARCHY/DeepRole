import { browser } from "wxt/browser";
import { DeepSeekDomAdapter } from "./deepseek-dom";
import { isUserMessage, nativeMessageRows } from "./deepseek-message-dom";
import type { CastMessage } from "./cast-coordinator";
import { CastReplyCapture } from "./cast-reply-capture";
import { castText } from "../core/cast-i18n";
import type { Locale } from "../core/types";
import { castChatId, castChatReference } from "../core/cast-chat";
import { enableCastThinking, restoreCastThinking } from "./cast-thinking";
import { bootstrapCastServiceScreen, createCastServiceScreen, rememberCastServiceScreen, finishCastServiceScreenMarker } from "./field-service-screen";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const DELETE = /^(?:delete(?: chat| conversation)?|удалить(?: чат| диалог)?|删除(?:对话)?)$/iu;
const MORE = /more|options|menu|ещё|еще|меню|действия|更多/iu;
const visible = (node: HTMLElement) => !!node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
function showRecoveredCastReply(raw: string, marker: string, locale: Locale) {
  const rows = nativeMessageRows(document), user = rows.findLastIndex(row => isUserMessage(row) && (row.textContent ?? "").includes(marker));
  const row = user >= 0 ? rows[user + 1] : undefined;
  if (!row || isUserMessage(row) || row.querySelector("[data-deeprole-cast-recovery]")) return;
  const card = document.createElement("details"); card.dataset.deeproleCastRecovery = "true";
  card.style.cssText = "margin:12px 0;padding:12px;border:1px solid #39434c;border-radius:12px;background:#20272d;color:#e3e8ed;font:13px/1.5 system-ui;";
  const summary = document.createElement("summary"); summary.textContent = castText(locale, "recovered"); summary.style.cursor = "pointer";
  const pre = document.createElement("pre"); pre.setAttribute("aria-label", castText(locale, "recoveredCode")); pre.textContent = raw; pre.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;scrollbar-width:thin;";
  card.append(summary, pre); row.append(card);
}
function currentChat(): string | undefined { return castChatId(location.pathname); }
/** Only opens controls belonging to the exact owned chat, never a global delete action. */
export async function deleteOwnedChat(chatId: string, doc: Document = document, wait = pause, authorize = async () => true): Promise<boolean> {
  if (currentChat() !== chatId || !await authorize() || currentChat() !== chatId) return false;
  const anchor = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].find(a => {
    return castChatReference(a.href)?.id === chatId;
  });
  if (!anchor) return false;
  let row: HTMLElement | null = anchor, more: HTMLElement | undefined;
  for (let depth = 0; row && depth < 4; depth++, row = row.parentElement) {
    const chatLinks = [...row.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(a => /\/chat\/(?:s\/)?/u.test(a.href));
    if (chatLinks.length > 1) break;
    const buttons = [...row.querySelectorAll<HTMLElement>("button,[role=button]")];
    more = buttons.find(b => MORE.test((b.getAttribute("aria-label") ?? "") + " " + (b.title ?? "")) || b.hasAttribute("aria-haspopup"));
    if (!more && buttons.length === 1) more = buttons[0];
    if (more) break;
  }
  if (!more) return false;
  const menuSelector = "[role=menu],.ds-dropdown-menu,[data-radix-menu-content]";
  const oldMenus = new Set([...doc.querySelectorAll<HTMLElement>(menuSelector)].filter(visible));
  more.click(); await wait(250);
  const menus = [...doc.querySelectorAll<HTMLElement>(menuSelector)].filter(m => visible(m) && !oldMenus.has(m));
  // Native DeepSeek menu options are divs without role=menuitem/button.
  // Only inspect a freshly opened menu belonging to the exact owned chat.
  const remove = menus.flatMap(m => [...m.querySelectorAll<HTMLElement>("[role=menuitem],button,[role=button],.ds-dropdown-menu-option")]).find(b => visible(b) && DELETE.test((b.textContent ?? "").trim()));
  if (!remove || currentChat() !== chatId || !await authorize() || currentChat() !== chatId) return false;
  remove.click(); await wait(250);
  const dialog = [...doc.querySelectorAll<HTMLElement>("[role=dialog],[aria-modal=true]")].find(d => visible(d) && /delete|удал|删除/iu.test(d.textContent ?? ""));
  if (!dialog) return false;
  const confirm = [...dialog.querySelectorAll<HTMLElement>("button,[role=button]")].find(b => visible(b) && DELETE.test((b.textContent ?? "").trim()));
  if (!confirm || currentChat() !== chatId || !await authorize() || currentChat() !== chatId) return false;
  confirm.click();
  for (let i = 0; i < 30; i++) {
    await wait(300);
    if (currentChat() !== chatId && !anchor.isConnected) return true;
  }
  return false;
}
export async function startCastWorker(): Promise<boolean> {
  const earlyScreen = bootstrapCastServiceScreen();
  const wanted = new URL(location.href).searchParams.get("deeprole_cast_job") ?? undefined;
  const claim = await browser.runtime.sendMessage({ type: "DR_CAST_WORKER", action: "claim", id: wanted } satisfies CastMessage).catch(() => null);
  if (!claim?.ok) { earlyScreen?.update("failed"); return !!wanted || !!earlyScreen; } // No ordinary UI in a stale service page.
  const id: string = claim.id, adapter = new DeepSeekDomAdapter();
  const locale: Locale = claim.locale === "en" || !claim.locale && earlyScreen?.host.lang === "en" ? "en" : "ru";
  const screen = earlyScreen ?? createCastServiceScreen(locale);
  rememberCastServiceScreen(id, locale);
  let touched = false, cleaning = false, stopped = false, failedRequest = false;
  let failed = !["opening", "reading", "analyzing", "ready"].includes(claim.phase);
  let capture: CastReplyCapture | undefined, activeRequestMarker = "";
  let nativeOwned: string | undefined = claim.chatId;
  let restoreThinking: (() => void) | undefined = claim.reasoningChanged ? () => restoreCastThinking(adapter.findComposer()) : undefined;
  document.addEventListener("click", e => { if (!screen.owns(e) && e.isTrusted && (e.target as Element)?.closest("a[href]")) touched = true; }, true);
  document.addEventListener("input", e => { if (!screen.owns(e) && e.isTrusted) touched = true; }, true);
  window.addEventListener("message", e => {
    if (e.source === window && e.data?.source === "deeprole-page-bridge" && e.data.type === "SERVICE_REQUEST_FAILED" && "[Request ID: " + e.data.id + "]" === activeRequestMarker) failedRequest = true;
  });
  const call = async (message: CastMessage) => {
    const result = await browser.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error ?? "preparation-failed");
    return result;
  };
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true; stopped = true; capture?.stop();
    screen.update("cleanup");
    const chatId = currentChat();
    let ok = !chatId;
    const authorize = async () => {
      if (touched || currentChat() !== nativeOwned) return false;
      const result = await call({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id, chatId: nativeOwned }).catch(() => null);
      return !!result?.ok && result.chatId === nativeOwned && !touched && currentChat() === nativeOwned;
    };
    try {
      if (await authorize()) {
        restoreThinking?.();
        if (chatId && nativeOwned === chatId) {
          if (adapter.isGenerating()) {
            [...document.querySelectorAll<HTMLElement>("[data-testid=stop-generation],button[aria-label*='Stop' i],button[aria-label*='Останов' i]")].find(visible)?.click();
            for (let i = 0; i < 40 && adapter.isGenerating(); i++) await pause(250);
          }
          if (!adapter.isGenerating()) ok = await deleteOwnedChat(chatId, document, pause, authorize);
        }
      }
      // Never report the foreign current ID as a service binding.
      const confirmed = await call({ type: "DR_CAST_WORKER", action: "cleaned", id, chatId: nativeOwned, ok: ok && !touched }).then(() => ok && !touched, () => false);
      if (confirmed) finishCastServiceScreenMarker();
      screen.update(confirmed ? failed ? "failed" : "done" : "cleanup-failed");
    } finally { cleaning = false; }
  };
  browser.runtime.onMessage.addListener(message => {
    if (message.type === "DR_CAST_RETRY_CLEANUP") { void cleanup(); return Promise.resolve({ ok: true }); }
    if (message.type === "DR_CAST_REVEAL" && stopped && !cleaning) { screen.dispose(); return Promise.resolve({ ok: true }); }
  });
  screen.configure(undefined, () => {
    if (cleaning || stopped) return;
    stopped = true; failed = true; capture?.stop();
    void call({ type: "DR_CAST", action: "cancel", id }).catch(() => undefined).then(cleanup);
  });
  void (async () => {
    try {
      if (claim.cleanupOnly) { await cleanup(); return; }
      for (let ready = 0; !adapter.getStatus().compatible && ready < 60; ready++) await pause(500);
      if (!adapter.getStatus().compatible) throw new Error("login-required");
      screen.update("preparing");
      for (;;) {
        const step = await call({ type: "DR_CAST_WORKER", action: "claim", id });
        if (!["opening", "reading", "analyzing"].includes(step.phase)) { failed = step.phase !== "ready"; break; }
        const reading = step.phase === "opening" || step.phase === "reading";
        screen.update(step.repair ? "repairing" : reading ? "reading" : "preparing");
        if (touched || stopped) throw new Error("user-interrupted");
        const requestMarker = "[Request ID: " + id + "-" + step.step + (step.repair ? "-repair" : "") + "]";
        activeRequestMarker = requestMarker; failedRequest = false;
        let bound = !!step.chatId, pendingCheckpoint: { raw: string; identity: string } | undefined;
        let writes = Promise.resolve();
        const checkpoint = () => {
          const pending = pendingCheckpoint; if (!pending || !bound || stopped || touched) return;
          pendingCheckpoint = undefined; const chatId = currentChat(); if (!chatId) return;
          writes = writes.then(async () => {
            if (stopped || touched || currentChat() !== chatId) return;
            // Failed/invalid checkpoints never weaken validation or stop the normal reply parser.
            await call({ type: "DR_CAST_WORKER", action: "checkpoint", id, step: step.step, repair: !!step.repair, chatId, replyIdentity: pending.identity, raw: pending.raw }).catch(() => undefined);
          });
        };
        capture?.stop();
        capture = new CastReplyCapture(id, requestMarker, step.prompt.includes("Return ONLY <deeprole_cast>JSON"), document, (raw, identity) => { pendingCheckpoint = { raw, identity }; checkpoint(); }, step.replyCheckpoint);
        capture.start();
        if (!step.awaiting) {
          if (step.step === 0 && !step.repair && (currentChat() || nativeMessageRows(document).length)) throw new Error("not-empty-chat");
          if (adapter.getDraft().trim()) throw new Error("draft-not-empty");
          if (step.prompt.includes("Return ONLY <deeprole_cast>JSON") && !restoreThinking) {
            const thinking = await enableCastThinking(adapter.findComposer()); restoreThinking = thinking.restore;
            await call({ type: "DR_CAST_WORKER", action: "reasoning", id, status: thinking.status, changed:thinking.changed });
            await pause(150);
            if (touched || stopped) throw new Error("user-interrupted");
          }
          // Persist before sending. A reload never automatically duplicates a request.
          await call({ type: "DR_CAST_WORKER", action: "sent", id, step: step.step });
          if (touched || stopped || step.chatId && currentChat() !== step.chatId) throw new Error("user-interrupted");
          if (step.step === 0 && (currentChat() || nativeMessageRows(document).length)) throw new Error("not-empty-chat");
          if (!adapter.setDraft(step.prompt)) throw new Error("composer-unavailable");
          screen.update("sending");
          await pause(150);
          if (touched || stopped || step.chatId && currentChat() !== step.chatId) throw new Error("user-interrupted");
          if (step.step === 0 && (currentChat() || nativeMessageRows(document).length)) throw new Error("not-empty-chat");
          if (!adapter.submitDraft()) { adapter.setDraft(""); throw new Error("composer-unavailable"); }
          screen.focus();
        }
        for (let i = 0; !currentChat() && i < 30; i++) await pause(200);
        if (currentChat() && !touched && (step.chatId || nativeMessageRows(document).some(row => isUserMessage(row) && (row.textContent ?? "").includes(requestMarker)))) {
          const chatId = currentChat()!;
          await call({ type: "DR_CAST_WORKER", action: "bound", id, chatId }); nativeOwned = chatId;
          bound = true; checkpoint();
        }
        const started = Date.now(); let last = "", stable = Date.now(), response = "", recovered = false;
        while (Date.now() - started < 7 * 60 * 1000) {
          if (stopped || touched) throw new Error("user-interrupted");
          if (failedRequest) { const saved = capture.resolve(""); if (saved.raw) { response = saved.raw; recovered = true; break; } throw new Error("request-failed"); }
          if (nativeOwned && currentChat() !== nativeOwned) throw new Error("chat-changed");
          const raw = capture.scan();
          const generating = adapter.isGenerating();
          const rows = nativeMessageRows(document), requestIndex = rows.findLastIndex(row => isUserMessage(row) && (row.textContent ?? "").includes(requestMarker));
          const replyRow = requestIndex >= 0 ? rows[requestIndex + 1] : undefined;
          const thinking = generating && !raw && !!replyRow && !isUserMessage(replyRow) && !!replyRow.querySelector(".ds-think-content,.ds-think-content-wrapper,[data-testid*=thinking],[data-testid*=reasoning]")?.textContent?.trim();
          screen.update(thinking ? "thinking" : step.repair ? "repairing" : reading ? "reading" : raw ? "generating" : "waiting");
          if (raw !== last) { last = raw; stable = Date.now(); }
          const resolved = capture.resolve(raw);
          if (resolved.raw && !generating && Date.now() - stable >= 1500) { response = resolved.raw; recovered = resolved.recovered; break; }
          await pause(500);
        }
        if (!response) { const saved = capture.resolve(""); response = saved.raw; recovered = !!saved.raw; }
        if (!response || !currentChat()) throw new Error("reply-timeout");
        await writes;
        if (stopped || touched) throw new Error("user-interrupted");
        if (nativeOwned && currentChat() !== nativeOwned) throw new Error("chat-changed");
        if (recovered) showRecoveredCastReply(response, requestMarker, step.locale ?? "ru");
        capture.stop(); capture = undefined;
        const chatId = currentChat()!;
        screen.update("validating");
        await call({ type: "DR_CAST_WORKER", action: "reply", id, step: step.step, repair: !!step.repair, chatId, raw: response }); nativeOwned = chatId;
      }
    } catch (e) {
      failed = true;
      await call({ type: "DR_CAST_WORKER", action: "error", id, error: e instanceof Error ? e.message : "preparation-failed", chatId: nativeOwned } as CastMessage).catch(() => undefined);
    }
    capture?.stop();
    await cleanup();
  })();
  return true;
}
