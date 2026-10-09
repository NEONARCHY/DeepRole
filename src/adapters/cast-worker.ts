import { browser } from "wxt/browser";
import { DeepSeekDomAdapter } from "./deepseek-dom";
import { isUserMessage, nativeMessageRows } from "./deepseek-message-dom";
import type { CastMessage } from "./cast-coordinator";
import { CastReplyCapture } from "./cast-reply-capture";
import { castText } from "../core/cast-i18n";
import type { Locale } from "../core/types";
import { castChatId, castChatReference } from "../core/cast-chat";

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
export async function deleteOwnedChat(chatId: string, doc: Document = document, wait = pause): Promise<boolean> {
  if (currentChat() !== chatId) return false;
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
  const remove = menus.flatMap(m => [...m.querySelectorAll<HTMLElement>("[role=menuitem],button,[role=button]")]).find(b => visible(b) && DELETE.test((b.textContent ?? "").trim()));
  if (!remove || currentChat() !== chatId) return false;
  remove.click(); await wait(250);
  const dialog = [...doc.querySelectorAll<HTMLElement>("[role=dialog],[aria-modal=true]")].find(d => visible(d) && /delete|удал|删除/iu.test(d.textContent ?? ""));
  if (!dialog) return false;
  const confirm = [...dialog.querySelectorAll<HTMLElement>("button,[role=button]")].find(b => visible(b) && DELETE.test((b.textContent ?? "").trim()));
  if (!confirm || currentChat() !== chatId) return false;
  confirm.click();
  for (let i = 0; i < 30; i++) {
    await wait(300);
    if (currentChat() !== chatId && !anchor.isConnected) return true;
  }
  return false;
}
export async function startCastWorker(): Promise<boolean> {
  const wanted = new URL(location.href).searchParams.get("deeprole_cast_job") ?? undefined;
  const claim = await browser.runtime.sendMessage({ type: "DR_CAST_WORKER", action: "claim", id: wanted } satisfies CastMessage).catch(() => null);
  if (!claim?.ok) return !!wanted; // Never inject ordinary roleplay UI into a stale service URL.
  const id: string = claim.id, adapter = new DeepSeekDomAdapter();
  let touched = false, cleaning = false, stopped = false, failedRequest = false;
  let capture: CastReplyCapture | undefined, activeRequestMarker = "";
  let nativeOwned = !!claim.chatId;
  document.addEventListener("click", e => { if (e.isTrusted && (e.target as Element)?.closest("a[href]")) touched = true; }, true);
  document.addEventListener("input", e => { if (e.isTrusted) touched = true; }, true);
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
    const chatId = currentChat();
    let ok = !chatId;
    if (chatId && nativeOwned && !touched) {
      if (adapter.isGenerating()) {
        [...document.querySelectorAll<HTMLElement>("[data-testid=stop-generation],button[aria-label*='Stop' i],button[aria-label*='Останов' i]")].find(visible)?.click();
        for (let i = 0; i < 40 && adapter.isGenerating(); i++) await pause(250);
      }
      if (!adapter.isGenerating()) ok = await deleteOwnedChat(chatId);
    }
    await call({ type: "DR_CAST_WORKER", action: "cleaned", id, chatId, ok }).catch(() => undefined);
    cleaning = false;
  };
  browser.runtime.onMessage.addListener(message => { if (message.type === "DR_CAST_RETRY_CLEANUP") { void cleanup(); return Promise.resolve({ ok: true }); } });
  void (async () => {
    try {
      for (let ready = 0; !adapter.getStatus().compatible && ready < 60; ready++) await pause(500);
      if (!adapter.getStatus().compatible) throw new Error("login-required");
      for (;;) {
        const step = await call({ type: "DR_CAST_WORKER", action: "claim", id });
        if (!["opening", "reading", "analyzing"].includes(step.phase)) break;
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
          // Persist before sending. A reload never automatically duplicates a request.
          await call({ type: "DR_CAST_WORKER", action: "sent", id, step: step.step });
          if (!adapter.setDraft(step.prompt)) throw new Error("composer-unavailable");
          await pause(150);
          if (!adapter.submitDraft()) { adapter.setDraft(""); throw new Error("composer-unavailable"); }
        }
        for (let i = 0; !currentChat() && i < 30; i++) await pause(200);
        if (currentChat() && !touched && (step.chatId || nativeMessageRows(document).some(row => isUserMessage(row) && (row.textContent ?? "").includes(requestMarker)))) {
          await call({ type: "DR_CAST_WORKER", action: "bound", id, chatId: currentChat()! }); nativeOwned = true;
          bound = true; checkpoint();
        }
        const started = Date.now(); let last = "", stable = Date.now(), response = "", recovered = false;
        while (Date.now() - started < 7 * 60 * 1000) {
          if (stopped || touched) throw new Error("user-interrupted");
          if (failedRequest) { const saved = capture.resolve(""); if (saved.raw) { response = saved.raw; recovered = true; break; } throw new Error("request-failed"); }
          if (step.chatId && currentChat() !== step.chatId) throw new Error("chat-changed");
          const raw = capture.scan();
          if (raw !== last) { last = raw; stable = Date.now(); }
          const resolved = capture.resolve(raw);
          if (resolved.raw && !adapter.isGenerating() && Date.now() - stable >= 1500) { response = resolved.raw; recovered = resolved.recovered; break; }
          await pause(500);
        }
        if (!response) { const saved = capture.resolve(""); response = saved.raw; recovered = !!saved.raw; }
        if (!response || !currentChat()) throw new Error("reply-timeout");
        await writes;
        if (stopped || touched) throw new Error("user-interrupted");
        if (recovered) showRecoveredCastReply(response, requestMarker, step.locale ?? "ru");
        capture.stop(); capture = undefined;
        await call({ type: "DR_CAST_WORKER", action: "reply", id, step: step.step, repair: !!step.repair, chatId: currentChat()!, raw: response }); nativeOwned = true;
      }
    } catch (e) {
      await call({ type: "DR_CAST_WORKER", action: "error", id, error: e instanceof Error ? e.message : "preparation-failed", chatId: nativeOwned ? currentChat() : undefined } as CastMessage).catch(() => undefined);
    }
    capture?.stop();
    await cleanup();
  })();
  return true;
}
