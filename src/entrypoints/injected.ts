import { DEEPSEEK_PROMPT_CHAR_LIMIT, contextHandshakeTimeoutMs, deepRoleServiceRequestId, injectIntoJsonBody, isDeepRoleServiceBody, looksLikeChatUrl, outgoingUserText, outgoingChatId, outgoingParentMessageId, replaceOutgoingUserText } from "../core/request-injection";
import { estimateChatHistory, readStoryHistory } from "../core/chat-history";
import { readFieldHistory, validFieldHistoryQuery, type FieldHistoryQuery } from "../core/field-history";
import { readStoryTransportIdentity, validNativeStoryId, nativeStoryMessageKey, validStoryTransportIdentity, type StoryTransportIdentity } from "../core/story-transport";
import { probeNativeStoryHistory, readNativeHistoryPayload, type NativeStoryHistoryProbeResult } from "../adapters/story-native-history-probe";
import { readNativeStoryReply, validNativeStoryReplyQuery, type NativeStoryReplyQuery } from "../core/story-native-reply";
import { createStoryDispatchTracker, type StoryDispatchIdentity, type StoryDispatchPacket } from "../core/story-dispatch";
import { createNativeStoryStreamObserver, observeContinuationAcceptance, type ContinuationStreamProof, type NativeStoryStreamPacket } from "../core/story-native-stream";
import type { NativeStoryRequestLink } from "../core/story-exchange";
import { readStoryGameSnapshot } from "../core/story-game";
import { reportMemoryPreparationFailure } from "../core/memory-preparation-diagnostic";
import { installServiceBackgroundRender } from "../adapters/service-background-render";
import { isDeepSeekFirstChatRoute } from "../core/chat-scope";

type FreshContext = { context: string | null; timedOut: boolean; continuation?: boolean; url?: string; oversizedLength?: number; blockSend?: boolean };

export default defineUnlistedScript(() => {
  installServiceBackgroundRender();
  const originalFetch = window.fetch.bind(window);
  const SOURCE = "deeprole-page-bridge";
  const pending = new Map<string, (value: FreshContext) => void>();
  const captureRequests = new Set<string>();
  const editPreparations = new Map<string, { draft?: string; identity?: StoryTransportIdentity }>();
  const captureConfirmations = new Map<string, (ok: boolean) => void>();
  let metadataProbePending = false;
  let fieldHistoryPending = false;
  const replyProbes = new Set<string>();
  let gameProbePending = false;
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "deeprole-extension") return;
    if (event.data.type === "STORY_GAME_SNAPSHOT_REQUEST") {
      const { requestId, chatId } = event.data;
      if (event.origin === location.origin && validNativeStoryId(requestId) && validNativeStoryId(chatId) && !gameProbePending) {
        gameProbePending = true;
        void readGameSnapshot(requestId, chatId).finally(() => { gameProbePending = false; });
      }
      return;
    }
    if (event.data.type === "STORY_CAPTURE_CONFIRMED") {
      if (event.origin === location.origin) captureConfirmations.get(event.data.id)?.(event.data.ok === true);
      return;
    }
    if (event.data.type === "NATIVE_STORY_REPLY_REQUEST") {
      const query = event.data.query;
      if (event.origin === location.origin && validNativeStoryReplyQuery(query) && !replyProbes.has(query.requestId) && replyProbes.size < 4) {
        replyProbes.add(query.requestId);
        void readDispatchReply(query).finally(() => replyProbes.delete(query.requestId));
      }
      return;
    }
    if (event.data.type === "FIELD_HISTORY_REQUEST") {
      const { requestId, chatId, anchorId, query } = event.data;
      if (event.origin === location.origin && validNativeStoryId(requestId) && validNativeStoryId(chatId) && validNativeStoryId(anchorId) && validFieldHistoryQuery(query) && !fieldHistoryPending) {
        fieldHistoryPending = true;
        void readChatHistoryEstimate(requestId, chatId, false, undefined, false, { anchorId, query }).finally(() => { fieldHistoryPending = false; });
      }
      return;
    }
    if (event.data.type === "NATIVE_STORY_METADATA_REQUEST") {
      const { requestId, chatId, anchorId } = event.data;
      if (event.origin === location.origin && validNativeStoryId(requestId) && validNativeStoryId(chatId) && (anchorId === undefined || validNativeStoryId(anchorId)) && !metadataProbePending) {
        metadataProbePending = true;
        void readChatHistoryEstimate(requestId, chatId, false, undefined, true, undefined, anchorId).finally(() => { metadataProbePending = false; });
      }
      return;
    }
    if (event.data.type === "CHAT_HISTORY_ESTIMATE_REQUEST" || event.data.type === "STORY_HISTORY_REQUEST") {
      const { requestId, chatId } = event.data;
      if (typeof requestId === "string" && requestId.length <= 120 && typeof chatId === "string" && /^[\w-]{1,120}$/u.test(chatId)) {
        void readChatHistoryEstimate(requestId, chatId, event.data.type === "STORY_HISTORY_REQUEST", typeof event.data.latestId === "string" ? event.data.latestId.slice(0, 120) : undefined);
      }
      return;
    }
    if (event.data.type !== "CONTEXT_READY" || event.origin !== location.origin) return;
    if (pending.has(event.data.id) && event.data.ok) {
      const draft = typeof event.data.replacementDraft === "string" && event.data.replacementDraft.length <= 100_000 ? event.data.replacementDraft : undefined;
      const identity = validStoryTransportIdentity(event.data.preparedIdentity) ? structuredClone(event.data.preparedIdentity) : undefined;
      if (draft !== undefined || identity) editPreparations.set(event.data.id, { draft, identity });
    }
    if (pending.has(event.data.id) && event.data.ok && event.data.capture === true) captureRequests.add(event.data.id);
    pending.get(event.data.id)?.({
      context: event.data.ok && typeof event.data.context === "string" ? event.data.context : null,
      blockSend: event.data.ok === false && event.data.blockSend === true,
      timedOut: false, continuation: event.data.ok === true && event.data.continuation === true,
      url: typeof event.data.url === "string" ? event.data.url : undefined,
      oversizedLength: Number.isSafeInteger(event.data.oversizedLength) && event.data.oversizedLength > DEEPSEEK_PROMPT_CHAR_LIMIT ? event.data.oversizedLength : undefined,
    });
  });
  async function readGameSnapshot(requestId: string, chatId: string) {
    const url = location.href, current = () => location.pathname.match(/\/chat\/(?:s\/)?([^/?#]+)/i)?.[1];
    if (current() !== chatId) return;
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 8000);
    let snapshot = null, failure = "native-exception";
    try {
      let token = localStorage.getItem("userToken") ?? "";
      if (token.startsWith("{")) { const parsed = JSON.parse(token); token = typeof parsed?.value === "string" ? parsed.value : ""; }
      const response = await originalFetch(`/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(chatId)}`, { method: "GET", headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const payload = await readNativeHistoryPayload(response);
      if (payload.status === "read") { snapshot = readStoryGameSnapshot(payload.value, chatId); failure = "native-shape"; }
      else failure = `native-${payload.code}`;
    } catch { /* Pause rather than guessing the selected reply. */ }
    finally { window.clearTimeout(timer); }
    if (url === location.href && current() === chatId) window.postMessage({ source: SOURCE, type: "STORY_GAME_SNAPSHOT_RESULT", requestId, snapshot, ...(!snapshot ? { failure } : {}) }, location.origin);
  }
  async function readDispatchReply(query: NativeStoryReplyQuery): Promise<void> {
    query = structuredClone(query);
    const requestUrl = location.href, chatId = query.identity.chatId;
    const currentChat = () => location.pathname.match(/\/chat\/s\/([^/?#]+)/i)?.[1] ?? location.pathname.match(/\/chat\/([^/?#]+)/i)?.[1];
    if (currentChat() !== chatId) return;
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 8000);
    let result = null;
    try {
      let token = localStorage.getItem("userToken") ?? "";
      if (token.startsWith("{")) { const parsed: unknown = JSON.parse(token); token = parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.value === "string" ? parsed.value : ""; }
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await originalFetch(`/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(chatId)}`, { method: "GET", headers, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const payload = await readNativeHistoryPayload(response);
      if (payload.status === "read") { const read = readNativeStoryReply(payload.value, query); if (read.status === "read") result = read.result; }
    } catch { /* Source receipt stays pending; never retry or resend the model request. */ }
    finally { window.clearTimeout(timer); }
    if (location.href === requestUrl && currentChat() === chatId) window.postMessage({ source: SOURCE, type: "NATIVE_STORY_REPLY_RESULT", requestId: query.requestId, result }, location.origin);
  }
  async function readChatHistoryEstimate(requestId: string, chatId: string, story = false, latestId?: string, metadata = false, field?: { anchorId: string; query: FieldHistoryQuery }, metadataAnchorId?: string): Promise<void> {
    let estimate = null;
    let reference = null;
    let probe: NativeStoryHistoryProbeResult = { status: "unavailable", code: "unreadable" };
    const requestUrl = location.href;
    const currentId = location.pathname.match(/\/chat\/s\/([^/?#]+)/i)?.[1] ?? location.pathname.match(/\/chat\/([^/?#]+)/i)?.[1];
    if (currentId !== chatId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), story || metadata || field ? 5000 : 15_000);
    try {
      // The token stays in the page. Text is read only for an explicit transfer.
      let token = localStorage.getItem("userToken") ?? "";
      if (token.startsWith("{")) {
        const parsed: unknown = JSON.parse(token);
        token = parsed && typeof parsed === "object" && "value" in parsed && typeof parsed.value === "string" ? parsed.value : "";
      }
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await originalFetch(`/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(chatId)}`, {
        method: "GET", headers, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      if (metadata) probe = await probeNativeStoryHistory(response, chatId, metadataAnchorId);
      else {
        if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 30_000_000) throw new Error("history-unavailable");
        const payload = await response.text();
        if (payload.length > 30_000_000) throw new Error("history-too-large");
        if (field) reference = readFieldHistory(JSON.parse(payload), chatId, field.anchorId, field.query);
        else estimate = story ? readStoryHistory(JSON.parse(payload), latestId) : estimateChatHistory(JSON.parse(payload));
      }
    } catch { /* The page-only estimate remains available. */ }
    finally { window.clearTimeout(timer); }
    if (currentId === (location.pathname.match(/\/chat\/s\/([^/?#]+)/i)?.[1] ?? location.pathname.match(/\/chat\/([^/?#]+)/i)?.[1])) {
      if (field) {
        if (location.href === requestUrl) window.postMessage({ source: SOURCE, type: "FIELD_HISTORY_RESULT", requestId, chatId, anchorId: field.anchorId, reference }, location.origin);
        return;
      }
      if (metadata) {
        if (location.href === requestUrl) window.postMessage({ source: SOURCE, type: "NATIVE_STORY_METADATA_RESULT", requestId, chatId, ...(metadataAnchorId ? { anchorId: metadataAnchorId } : {}), probe }, location.origin);
        return;
      }
      window.postMessage({ source: SOURCE, type: story ? "STORY_HISTORY_RESULT" : "CHAT_HISTORY_ESTIMATE", requestId, chatId, estimate }, location.origin);
    }
  }
  function freshContext(id: string, draft: string, chatId: string | null, parentMessageId?: string, storyIdentity?: StoryTransportIdentity | null, captureTransport?: "fetch" | "xhr", editNativeKey?: string): Promise<FreshContext> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(id);
        captureRequests.delete(id);
        editPreparations.delete(id);
        resolve({ context: null, timedOut: true });
      // A live memory preview means the send is worth a fresh bounded read;
      // without one, keep ordinary chats' fail-open delay short. Never retry.
      }, contextHandshakeTimeoutMs(Boolean(document.documentElement.dataset.deeproleContext), document.documentElement.dataset.deeproleStoryGame === "active"));
      pending.set(id, (result) => { window.clearTimeout(timer); pending.delete(id); resolve(result); });
      window.postMessage({ source: SOURCE, type: "REQUEST_CONTEXT", id, draft, chatId, parentMessageId, storyIdentity: storyIdentity ?? null, ...(captureTransport ? { captureTransport } : {}), ...(editNativeKey ? { editNativeKey } : {}) }, "*");
    });
  }
  function status(ok: boolean, id?: string, url = location.href, httpStatus?: number, reason?: string, link?: NativeStoryRequestLink) {
    window.postMessage({ source: SOURCE, type: "INJECTION_STATUS", ok, id, url, ...(httpStatus !== undefined ? { httpStatus } : {}), ...(!ok && reason ? { reason } : {}), ...(link ? { link } : {}) }, location.origin);
  }
  function continuationStatus(link: NativeStoryRequestLink | null, id: string | undefined, url: string | undefined, httpStatus: number, proof?: ContinuationStreamProof) {
    console.debug("[DeepRole continuation]", proof ?? "missing-stream");
    status(!!link, id, url, httpStatus, "continuation-unconfirmed", link ?? undefined);
  }
  const isEventStream = (value: string | null) => value?.split(";", 1)[0]?.trim().toLowerCase() === "text/event-stream";

  async function watchContinuationResponse(response: Response, dispatch: StoryDispatchIdentity | undefined, signal: AbortSignal | null | undefined, settle: (link: NativeStoryRequestLink | null, proof?: ContinuationStreamProof) => void) {
    if (!response.ok || response.redirected || !isEventStream(response.headers.get("content-type")) || !response.body || !dispatch || signal?.aborted) { settle(null); return; }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let settled = false;
    const observer = observeContinuationAcceptance(dispatch, (link, proof) => {
      settled = true;
      settle(link, proof);
    });
    if (!observer) { settle(null); return; }
    const abort = () => {
      observer.fail("aborted");
      void reader?.cancel().catch(() => undefined);
    };
    const timeout = window.setTimeout(abort, 10 * 60 * 1000);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      reader = response.clone().body!.getReader();
      const decoder = new TextDecoder();
      while (!settled) {
        const { done, value } = await reader.read();
        if (done) break;
        observer.feed(decoder.decode(value, { stream: true }));
      }
      observer.end();
    } catch { observer.fail("network"); }
    finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      void reader?.cancel().catch(() => undefined);
    }
  }
  function serviceFailed(id?: string) { if (id) window.postMessage({ source: SOURCE, type: "SERVICE_REQUEST_FAILED", id }, "*"); }
  const continuationPaused = () => document.documentElement.dataset.deeproleTransferPending === "active";
  function supportedUrl(url: string) { try { return new URL(url, location.href).origin === location.origin && looksLikeChatUrl(url); } catch { return false; } }
  function reportDispatch(packet: StoryDispatchPacket) { window.postMessage({ source: SOURCE, type: "NATIVE_STORY_DISPATCH", ...packet }, location.origin); }
  function reportNativeStream(packet: NativeStoryStreamPacket) { window.postMessage({ source: SOURCE, type: "NATIVE_STORY_STREAM", ...packet }, location.origin); }
  function captureDispatch(body: string, requestId: string): StoryDispatchIdentity | undefined {
    const identity = isDeepRoleServiceBody(body) ? null : readStoryTransportIdentity(body);
    return identity ? { requestId, identity } : undefined;
  }
  function confirmCapture(dispatch: StoryDispatchIdentity, transport: "fetch" | "xhr", outgoingText: string): Promise<void> {
    return new Promise(resolve => {
      const finish = () => { window.clearTimeout(timer); captureConfirmations.delete(dispatch.requestId); resolve(); };
      // A journal failure never blocks or repeats the user's native request.
      const timer = window.setTimeout(finish, 2000);
      captureConfirmations.set(dispatch.requestId, finish);
      window.postMessage({ source: SOURCE, type: "STORY_CAPTURE_SOURCE", ...dispatch, transport, outgoingText }, location.origin);
    });
  }
  function memoryBlocked(body: string, url = location.href) {
    window.postMessage({ source: SOURCE, type: "STRICT_MEMORY_BLOCKED", url, chatId: outgoingChatId(body), draft: outgoingUserText(body) }, location.origin);
  }
  function rejectLongPrompt(body: string, length: number, url = location.href, id?: string, restoredDraft?: string) {
    const service = isDeepRoleServiceBody(body);
    window.postMessage({
      source: SOURCE, type: "PROMPT_LENGTH_BLOCKED", url, id, chatId: outgoingChatId(body), length,
      draft: service ? null : restoredDraft ?? outgoingUserText(body),
    }, location.origin);
    if (service) serviceFailed(deepRoleServiceRequestId(body) ?? undefined);
  }
  async function prepare(body: string, transport: "fetch" | "xhr", capture = false, editing = false): Promise<{ body: string; attached: boolean; blocked?: boolean; id?: string; url?: string; serviceId?: string; dispatch?: StoryDispatchIdentity; continuation?: boolean }> {
    const unchanged = { body, attached: false };
    const draft = outgoingUserText(body);
    if (draft !== null && draft.length > DEEPSEEK_PROMPT_CHAR_LIMIT && (!editing || draft.length > 100_000)) {
      rejectLongPrompt(body, draft.length);
      return { ...unchanged, blocked: true };
    }
    if (isDeepRoleServiceBody(body)) return { ...unchanged, serviceId: deepRoleServiceRequestId(body) ?? undefined };
    if (continuationPaused()) return { ...unchanged, blocked: true };
    const strict = document.documentElement.dataset.deeproleStrictMemory === "active";
    const id = crypto.randomUUID(); let url = location.href;
    const captured = { ...unchanged, id, url, dispatch: captureDispatch(body, id) };
    const failed = (reason: string, mustBlock = false) => {
      const blocked = mustBlock || strict || document.documentElement.dataset.deeproleStrictMemory === "active";
      if (blocked) memoryBlocked(body);
      else status(false, id, url, undefined, reason);
      return { ...captured, blocked };
    };
    if (draft === null) return document.documentElement.dataset.deeproleContext || strict ? failed("unsupported-request-shape") : captured;
    const value = JSON.parse(body), editedId = value?.message_id;
    const editNativeKey = editing && !readStoryTransportIdentity(body) && outgoingChatId(body) && validNativeStoryId(typeof editedId === "number" && Number.isSafeInteger(editedId) ? String(editedId) : editedId) && typeof value.prompt === "string" ? nativeStoryMessageKey(String(editedId)) : undefined;
    const contextStartedAt = Date.now();
    const contextResponse = await freshContext(id, draft, outgoingChatId(body), outgoingParentMessageId(body), readStoryTransportIdentity(body), capture || editing ? transport : undefined, editNativeKey);
    const context = contextResponse.context;
    if (contextResponse.blockSend || continuationPaused()) {
      captureRequests.delete(id); editPreparations.delete(id);
      return failed("context-unavailable", true);
    }
    const identity = captured.dispatch?.identity;
    if (contextResponse.continuation && identity?.nativeParentKey === null
      && (contextResponse.url === url || contextResponse.url === location.href)
      && isDeepSeekFirstChatRoute(url, location.href, identity.chatId)) captured.url = url = location.href;
    const edit = editPreparations.get(id); editPreparations.delete(id);
    if (editing && edit?.identity?.chatId === outgoingChatId(body)) captured.dispatch = { requestId: id, identity: edit.identity };
    if (contextResponse.oversizedLength !== undefined) {
      captureRequests.delete(id);
      rejectLongPrompt(body, contextResponse.oversizedLength, url, id, edit?.draft);
      return { ...captured, blocked: true };
    }
    if (context === null || location.href !== url) {
      captureRequests.delete(id);
      if (draft.length > DEEPSEEK_PROMPT_CHAR_LIMIT) {
        rejectLongPrompt(body, draft.length, url, id);
        return { ...captured, blocked: true };
      }
      const reason = location.href !== url ? "page-changed" : contextResponse.timedOut ? "context-timeout" : "context-unavailable";
      if (contextResponse.timedOut) reportMemoryPreparationFailure("handshake", "context-timeout", contextStartedAt);
      return failed(reason);
    }
    let result = { ...captured };
    try {
      if (context) {
        const cleanBody = editing && edit?.draft !== undefined ? replaceOutgoingUserText(body, edit.draft).body : body;
        const injected = injectIntoJsonBody(cleanBody, context);
        if (!injected.changed) status(false, id, url, undefined, injected.failure ?? "unsupported-request-shape");
        result = { ...captured, body: injected.body, attached: injected.changed };
      }
    } catch { status(false, id, url, undefined, "invalid-request"); }
    const finalPrompt = outgoingUserText(result.body);
    if (finalPrompt !== null && finalPrompt.length > DEEPSEEK_PROMPT_CHAR_LIMIT) {
      captureRequests.delete(id);
      rejectLongPrompt(body, finalPrompt.length, url, id, edit?.draft);
      return { ...result, blocked: true };
    }
    if (captureRequests.delete(id) && captured.dispatch && finalPrompt !== null) {
      await confirmCapture(captured.dispatch, transport, finalPrompt);
    }
    if (location.href !== url) return failed("page-changed");
    if (strict && !result.attached) { memoryBlocked(body, url); return { ...result, blocked: true }; }
    return { ...result, continuation: contextResponse.continuation };
  }
  window.fetch = async function deepRoleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!supportedUrl(url)) return originalFetch(input, init);
    const captureMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
    const capture = typeof captureMethod === "string" && captureMethod.toUpperCase() === "POST" && new URL(url, location.href).pathname === "/api/v0/chat/completion";
    const editing = typeof captureMethod === "string" && captureMethod.toUpperCase() === "POST" && new URL(url, location.href).pathname === "/api/v0/chat/edit_message";
    let nextInput = input; let nextInit = init; let attached = false, blocked = false, continuation = false;
    let requestId: string | undefined; let requestUrl: string | undefined; let originalBody: string | undefined;
    let serviceId: string | undefined;
    let dispatch: StoryDispatchIdentity | undefined;
    try {
      if (typeof init?.body === "string") {
        originalBody = init.body;
        const prepared = await prepare(init.body, "fetch", capture, editing);
        blocked = !!prepared.blocked;
        requestId = prepared.id; requestUrl = prepared.url;
        serviceId = prepared.serviceId;
        dispatch = prepared.dispatch;
        continuation = prepared.continuation === true;
        nextInit = { ...init, body: prepared.body }; attached = prepared.attached;
      } else if (input instanceof Request && !init?.body && input.method !== "GET") {
        originalBody = await input.clone().text();
        const prepared = await prepare(originalBody, "fetch", capture, editing);
        blocked = !!prepared.blocked;
        requestId = prepared.id; requestUrl = prepared.url;
        serviceId = prepared.serviceId;
        dispatch = prepared.dispatch;
        continuation = prepared.continuation === true;
        nextInput = new Request(input, { body: prepared.body }); attached = prepared.attached;
      }
    } catch { status(false, undefined, location.href, undefined, "preparation-failed"); blocked = continuationPaused() || document.documentElement.dataset.deeproleStrictMemory === "active"; if (blocked && originalBody !== undefined) memoryBlocked(originalBody); }
    if (blocked) throw new DOMException("DeepRole paused sending: memory unavailable", "AbortError");
    // Don't consume a queued handoff on an aborted or rejected network request.
    // The network call stays outside the preparation catch: a failure is not a retry.
    const signal = init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
    let failed = false;
    const failService = () => { if (!failed) { failed = true; serviceFailed(serviceId); } };
    // fetch resolves at headers, not at the end of a streaming reply. Keep the
    // cancellation hook without consuming or replacing the site's response.
    if (serviceId && signal) {
      signal.addEventListener("abort", failService, { once: true });
      if (signal.aborted) failService();
    }
    const stopTracking = () => signal?.removeEventListener("abort", failService);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const tracker = createStoryDispatchTracker(typeof method === "string" && method.toUpperCase() === "POST" ? dispatch : undefined, "fetch", reportDispatch);
    const abortDispatch = () => tracker?.fail("aborted");
    tracker?.start();
    if (tracker && signal) { signal.addEventListener("abort", abortDispatch, { once: true }); if (signal.aborted) abortDispatch(); }
    let response: Response;
    try { response = await originalFetch(nextInput, nextInit); }
    catch (error) {
      tracker?.fail(signal?.aborted ? "aborted" : "network");
      stopTracking();
      failService();
      if (attached && continuation) continuationStatus(null, requestId, requestUrl, 0);
      throw error;
    }
    finally { signal?.removeEventListener("abort", abortDispatch); }
    tracker?.headers(response.status, response.redirected);
    if (!response.ok) { stopTracking(); failService(); }
    if (attached && continuation) {
      void watchContinuationResponse(response, capture ? dispatch : undefined, signal, (link, proof) => continuationStatus(link, requestId, requestUrl, response.status, proof));
    } else if (attached && response.ok) status(true, requestId, requestUrl, response.status);
    return response;
  };
  const OriginalXHR = window.XMLHttpRequest;
  class DeepRoleXHR extends OriginalXHR {
    private deepRoleUrl = "";
    private asynchronous = true;
    private deepRoleMethod = "";
    private storyDispatch: ReturnType<typeof createStoryDispatchTracker> = null;
    private nativeStream: ReturnType<typeof createNativeStoryStreamObserver> = null;
    private continuationStream: ReturnType<typeof observeContinuationAcceptance> = null;
    private generation = 0;
    private serviceId?: string;
    private stopTracking?: () => void;
    private finishService(failed: boolean) {
      const id = this.serviceId;
      this.serviceId = undefined;
      this.stopTracking?.(); this.stopTracking = undefined;
      if (failed) this.continuationStream?.fail("network");
      this.continuationStream = null;
      if (failed) serviceFailed(id);
    }
    override abort() { this.continuationStream?.fail("aborted"); this.storyDispatch?.fail("aborted"); this.storyDispatch = null; this.nativeStream?.fail("aborted"); this.nativeStream = null; this.generation++; this.finishService(true); super.abort(); }
    override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
      this.storyDispatch?.fail("superseded"); this.storyDispatch = null;
      this.nativeStream?.fail("superseded"); this.nativeStream = null;
      this.continuationStream?.fail("superseded");
      this.generation++; this.finishService(true); this.deepRoleUrl = String(url); this.deepRoleMethod = typeof method === "string" ? method.toUpperCase() : ""; this.asynchronous = async ?? true;
      super.open(method, url, this.asynchronous, username ?? null, password ?? null);
    }
    override send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (typeof body !== "string" || !supportedUrl(this.deepRoleUrl)) { super.send(body); return; }
      // Synchronous XHR cannot wait for storage. Never send stale memory instead.
      if (!this.asynchronous) {
        const draft = outgoingUserText(body);
        if (draft !== null && draft.length > DEEPSEEK_PROMPT_CHAR_LIMIT) {
          rejectLongPrompt(body, draft.length);
          throw new DOMException("DeepRole paused sending: prompt too long", "AbortError");
        }
        if (!isDeepRoleServiceBody(body) && continuationPaused()) throw new DOMException("DeepRole transfer still needs saving", "InvalidStateError");
        if (!isDeepRoleServiceBody(body) && document.documentElement.dataset.deeproleStrictMemory === "active") { memoryBlocked(body); throw new DOMException("DeepRole paused synchronous sending", "InvalidStateError"); }
        if (document.documentElement.dataset.deeproleContext) status(false, undefined, location.href, undefined, "synchronous-request");
        const tracker = createStoryDispatchTracker(this.deepRoleMethod === "POST" ? captureDispatch(body, crypto.randomUUID()) : undefined, "xhr", reportDispatch);
        tracker?.start();
        try { super.send(body); tracker?.headers(this.status); } catch (error) { tracker?.fail("network"); throw error; }
        return;
      }
      const generation = this.generation;
      // Track synchronously: abort/open may happen before prepare's microtask.
      this.serviceId = deepRoleServiceRequestId(body) ?? undefined;
      void prepare(body, "xhr", this.deepRoleMethod === "POST" && new URL(this.deepRoleUrl, location.href).pathname === "/api/v0/chat/completion", this.deepRoleMethod === "POST" && new URL(this.deepRoleUrl, location.href).pathname === "/api/v0/chat/edit_message").then((prepared) => {
        if (generation !== this.generation) return;
        if (prepared.blocked) { this.finishService(false); this.dispatchEvent(new ProgressEvent("error")); this.dispatchEvent(new ProgressEvent("loadend")); return; }
        this.serviceId = deepRoleServiceRequestId(prepared.body) ?? undefined;
        const tracker = createStoryDispatchTracker(this.deepRoleMethod === "POST" ? prepared.dispatch : undefined, "xhr", reportDispatch);
        const stream = createNativeStoryStreamObserver(this.deepRoleMethod === "POST" ? prepared.dispatch : undefined, reportNativeStream);
        const confirmContinuation = prepared.attached && prepared.continuation;
        const continuationStream = confirmContinuation ? observeContinuationAcceptance(
          this.deepRoleMethod === "POST" && new URL(this.deepRoleUrl, location.href).pathname === "/api/v0/chat/completion" ? prepared.dispatch : undefined,
          (link, proof) => continuationStatus(link, prepared.id, prepared.url, this.status, proof),
        ) : null;
        const streams = [stream, continuationStream].filter(value => value !== null);
        let consumed = 0;
        const progress = () => {
          if (generation !== this.generation || !streams.length || this.readyState < 3) return;
          try {
            if (this.status < 200 || this.status >= 300 || !isEventStream(this.getResponseHeader("content-type"))
              || this.responseType !== "" && this.responseType !== "text") { streams.forEach(reader => reader.fail("format")); return; }
            const text = this.responseText;
            if (text.length < consumed) { streams.forEach(reader => reader.fail("format")); return; }
            const chunk = text.slice(consumed);
            streams.forEach(reader => reader.feed(chunk)); consumed = text.length;
          } catch { streams.forEach(reader => reader.fail("format")); }
        };
        const accepted = () => {
          if (generation !== this.generation || this.readyState < 2) return;
          this.removeEventListener("readystatechange", accepted);
          tracker?.headers(this.status);
          if (this.storyDispatch === tracker) this.storyDispatch = null;
          if (confirmContinuation) {
            if (!continuationStream) continuationStatus(null, prepared.id, prepared.url, this.status);
            else if (!isEventStream(this.getResponseHeader("content-type")) || new URL(this.deepRoleUrl, location.href).href !== this.responseURL) continuationStream.fail("format");
          } else if (prepared.attached && this.status >= 200 && this.status < 300) status(true, prepared.id, prepared.url, this.status);
          if (this.status < 200 || this.status >= 300) this.finishService(true);
        };
        const failed = (event: Event) => { if (generation === this.generation) { tracker?.fail(event.type === "abort" ? "aborted" : "network"); stream?.fail(event.type === "abort" ? "aborted" : "network"); if (this.storyDispatch === tracker) this.storyDispatch = null; this.finishService(true); } };
        const ended = () => { if (generation === this.generation) { progress(); streams.forEach(reader => reader.end()); if (this.nativeStream === stream) this.nativeStream = null; tracker?.headers(this.status); if (this.storyDispatch === tracker) this.storyDispatch = null; this.finishService(false); } };
        this.stopTracking = () => {
          this.removeEventListener("readystatechange", accepted);
          this.removeEventListener("progress", progress);
          for (const event of ["error", "timeout", "abort"]) this.removeEventListener(event, failed);
          this.removeEventListener("loadend", ended);
        };
        this.addEventListener("readystatechange", accepted);
        this.addEventListener("progress", progress);
        for (const event of ["error", "timeout", "abort"]) this.addEventListener(event, failed);
        this.addEventListener("loadend", ended);
        this.storyDispatch = tracker; this.nativeStream = stream; this.continuationStream = continuationStream; tracker?.start();
        try { super.send(prepared.body); } catch { tracker?.fail("network"); stream?.fail("network"); if (this.storyDispatch === tracker) this.storyDispatch = null; if (this.nativeStream === stream) this.nativeStream = null; this.finishService(true); status(false, prepared.id, prepared.url, undefined, "preparation-failed"); }
      }).catch(() => {
        if (generation !== this.generation) return;
        status(false, undefined, location.href, undefined, "preparation-failed"); this.finishService(true);
        if (document.documentElement.dataset.deeproleStrictMemory === "active" && !isDeepRoleServiceBody(body)) {
          memoryBlocked(body); this.dispatchEvent(new ProgressEvent("error")); this.dispatchEvent(new ProgressEvent("loadend")); return;
        }
        // Preparation failed before any native send. Legacy fail-open remains
        // one send of the original body, never a retry after a network send.
        try { super.send(body); } catch { this.dispatchEvent(new ProgressEvent("error")); this.dispatchEvent(new ProgressEvent("loadend")); }
      });
    }
  }
  window.XMLHttpRequest = DeepRoleXHR;
});
