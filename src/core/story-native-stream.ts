import { validNativeStoryRequestLink, type NativeStoryRequestLink } from "./story-exchange";
import { validStoryDispatchPacket, type StoryDispatchIdentity } from "./story-dispatch";
import { nativeStoryMessageKey } from "./story-transport";

export interface NativeStoryStreamPacket extends StoryDispatchIdentity {
  transport: "xhr";
  phase: "ready" | "finish" | "closed" | "failed";
  link: NativeStoryRequestLink | null;
  /** Wire markers only; none of them establishes successful story completion. */
  sawFinish: boolean;
  issue: "format" | "too-large" | "aborted" | "network" | "superseded" | "native-hint" | null;
}
const issues = ["format", "too-large", "aborted", "network", "superseded", "native-hint"];
export function validNativeStoryStreamPacket(value: unknown): value is NativeStoryStreamPacket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, keys = ["requestId", "identity", "transport", "phase", "link", "sawFinish", "issue"];
  if (Object.keys(v).length !== keys.length || !keys.every(key => Object.prototype.hasOwnProperty.call(v, key))
    || !validStoryDispatchPacket({ requestId: v.requestId, identity: v.identity, transport: v.transport, phase: "started" }) || v.transport !== "xhr"
    || !["ready", "finish", "closed", "failed"].includes(v.phase as string) || typeof v.sawFinish !== "boolean"
    || !(v.issue === null || issues.includes(v.issue as string)) || (v.phase === "failed") !== (v.issue !== null)
    || v.phase === "ready" && v.sawFinish || v.phase === "finish" && !v.sawFinish
    || v.phase !== "failed" && !validNativeStoryRequestLink(v.link)) return false;
  if (v.link !== null && (!validNativeStoryRequestLink(v.link) || v.link.requestId !== v.requestId || v.link.chatId !== (v.identity as StoryDispatchIdentity["identity"]).chatId
    || v.link.nativeParentKey !== (v.identity as StoryDispatchIdentity["identity"]).nativeParentKey)) return false;
  return true;
}

/** Incremental metadata-only observer of the verified web client's SSE ready/finish/close
 * events. Never returns content, reasoning, deltas, hint text or native tokens. Not a
 * receipt, successful-completion decoder or event-acceptance policy. Unknown protocol
 * pauses; HTTP/EOF alone never synthesize finish/close. One bounded parser per XHR.
 */
export function createNativeStoryStreamObserver(input: StoryDispatchIdentity | undefined, emit: (packet: NativeStoryStreamPacket) => void) {
  if (!input || !validStoryDispatchPacket({ ...input, transport: "xhr", phase: "started" })) return null;
  const route = structuredClone(input);
  let line = "", event = "", data: string[] = [], frameBytes = 0, total = 0, skipLF = false;
  let link: NativeStoryRequestLink | null = null, finished = false, stopped = false;
  const publish = (phase: NativeStoryStreamPacket["phase"], issue: NativeStoryStreamPacket["issue"] = null) => {
    const packet: NativeStoryStreamPacket = { ...route, identity: { ...route.identity }, transport: "xhr", phase, link: link ? { ...link } : null, sawFinish: finished, issue };
    try { emit(packet); } catch { /* Observation must never affect the website. */ }
  };
  const fail = (issue: Exclude<NativeStoryStreamPacket["issue"], null>) => { if (stopped) return; stopped = true; line = ""; data = []; publish("failed", issue); };
  const frame = () => {
    if (!data.length) { event = ""; frameBytes = 0; return; }
    const raw = data.join("\n"), name = event; event = ""; data = []; frameBytes = 0;
    if (name === "ready") {
      if (link || finished || raw.length > 2048) { fail("format"); return; }
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        const v = value as Record<string, unknown>;
        // The current client validates both IDs as numbers. String/model echoes are
        // unsupported here; no prompt IDs or similar-text association is permitted.
        const nativeId = (id: unknown) => { if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) throw Error(); return nativeStoryMessageKey(String(id)); };
        const next: NativeStoryRequestLink = { requestId: route.requestId, chatId: route.identity.chatId, nativeParentKey: route.identity.nativeParentKey,
          userMessageKey: nativeId(v.request_message_id), assistantMessageKey: nativeId(v.response_message_id) };
        if (!validNativeStoryRequestLink(next)) throw Error();
        link = next; publish("ready");
      } catch { fail("format"); }
    } else if (name === "finish") {
      if (!link || finished) { fail("format"); return; }
      finished = true; publish("finish");
    } else if (name === "close") {
      if (!link || raw.length > 2048) { fail("format"); return; }
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        const behavior = (value as Record<string, unknown>).click_behavior;
        if (behavior !== undefined && behavior !== "none" && behavior !== "retry") throw Error();
        stopped = true; publish("closed");
      } catch { fail("format"); }
    } else if (name === "hint" || name === "toast") fail("native-hint");
    else if (!["", "delta", "title", "update_session", "update_parent_message", "update_file"].includes(name)) fail("format");
  };
  const endLine = () => {
    const current = line; line = "";
    if (!current) { frame(); return; }
    if (current.startsWith(":")) return;
    const colon = current.indexOf(":"), field = colon < 0 ? current : current.slice(0, colon);
    let value = colon < 0 ? "" : current.slice(colon + 1); if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    // SSE id/retry are not message identities and are deliberately ignored.
  };
  return {
    feed(chunk: string) {
      if (stopped) return;
      if (typeof chunk !== "string") { fail("format"); return; }
      total += chunk.length;
      if (total > 30_000_000) { fail("too-large"); return; }
      for (const char of chunk) {
        if (stopped) break;
        if (skipLF) { skipLF = false; if (char === "\n") continue; }
        if (++frameBytes > 1_000_000) { fail("too-large"); break; }
        if (char === "\r") { endLine(); skipLF = true; }
        else if (char === "\n") endLine();
        else line += char;
      }
    },
    fail,
    end() { if (!stopped) fail("format"); },
  };
}
