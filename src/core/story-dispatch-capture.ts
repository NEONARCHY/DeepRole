import { validStoryDispatchPacket, type StoryDispatchPacket, type StoryDispatchDelivery } from "./story-dispatch";
import { validNativeStoryStreamPacket, type NativeStoryStreamPacket } from "./story-native-stream";
import { validNativeStoryRequestLink, type NativeStoryRequestLink } from "./story-exchange";
import { validNativeStoryId, validStoryTransportIdentity, type StoryTransportIdentity } from "./story-transport";
import { sameStoryValue } from "./story-value";
import { validStoryDispatchReply, type StoryDispatchReply } from "./story-native-reply";

/** A durable outgoing-call journal, NOT a selected story request or event authority. */
export interface StoryDispatchCapture {
  format: "deeprole-story-dispatch";
  contractVersion: 1;
  id: string;
  worldId: string | null;
  bindingId: string;
  identity: StoryTransportIdentity;
  ownerTabId: number;
  origin: "local" | "restored";
  purpose: "user-turn" | "out-of-character";
  transport: "fetch" | "xhr";
  sceneRevision: string | null;
  originalDraft: string;
  proposedContext: string;
  /** Whole-string equality with the actual outgoing text, never marker-based stripping. */
  injection: "unconfirmed" | "none" | "context";
  started: boolean;
  delivery: StoryDispatchDelivery | null;
  wire: { phase: "waiting" | NativeStoryStreamPacket["phase"]; link: NativeStoryRequestLink | null; sawFinish: boolean; issue: NativeStoryStreamPacket["issue"] };
  createdAt: number;
  updatedAt: number;
  /** A completed source observation, not an approval or browser-branch selection. */
  reply?: StoryDispatchReply;
  /** Set only in the same pre-send transaction as the matching StoryRequest.
   * Absence on old captures cannot be repaired into retroactive send authority. */
  storyBranchId?: string;
}
export interface StoryDispatchCaptureInput {
  id: string; worldId: string; bindingId: string; identity: StoryTransportIdentity;
  transport: "fetch" | "xhr"; sceneRevision: string | null; originalDraft: string; proposedContext: string;
}
export interface StoryDispatchSource {
  requestId: string; identity: StoryTransportIdentity; transport: "fetch" | "xhr"; outgoingText: string;
}
const shape = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value === value.trim() && !["__proto__", "constructor", "prototype"].includes(value);
const transport = (value: unknown) => value === "fetch" || value === "xhr";
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.length <= limit;
export function validStoryDispatchCaptureInput(value: unknown): value is StoryDispatchCaptureInput {
  return shape(value, ["id", "worldId", "bindingId", "identity", "transport", "sceneRevision", "originalDraft", "proposedContext"])
    && validNativeStoryId(value.id) && id(value.worldId) && id(value.bindingId) && validStoryTransportIdentity(value.identity) && transport(value.transport)
    && (value.sceneRevision === null || id(value.sceneRevision)) && text(value.originalDraft, 100_000) && !!value.originalDraft.trim() && text(value.proposedContext, 500_000);
}
export function validStoryDispatchSource(value: unknown): value is StoryDispatchSource {
  return shape(value, ["requestId", "identity", "transport", "outgoingText"]) && validNativeStoryId(value.requestId)
    && validStoryTransportIdentity(value.identity) && transport(value.transport) && text(value.outgoingText, 600_020);
}
export function confirmedDispatchText(value: StoryDispatchCapture): string | null {
  return value.injection === "unconfirmed" ? null : value.injection === "none" ? value.originalDraft : `${value.proposedContext}\n\n[User message]\n${value.originalDraft}`;
}
export function validStoryDispatchCapture(value: unknown): value is StoryDispatchCapture {
  const hasReply = !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "reply");
  const hasBranch = !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "storyBranchId");
  if (!shape(value, ["format", "contractVersion", "id", "worldId", "bindingId", "identity", "ownerTabId", "origin", "purpose", "transport", "sceneRevision", "originalDraft", "proposedContext", "injection", "started", "delivery", "wire", "createdAt", "updatedAt", ...(hasReply ? ["reply"] : []), ...(hasBranch ? ["storyBranchId"] : [])])
    || value.format !== "deeprole-story-dispatch" || value.contractVersion !== 1 || !(value.worldId === null || id(value.worldId))
    || !validStoryDispatchCaptureInput({ id: value.id, worldId: value.worldId ?? "detached", bindingId: value.bindingId, identity: value.identity, transport: value.transport, sceneRevision: value.sceneRevision, originalDraft: value.originalDraft, proposedContext: value.proposedContext })
    || !Number.isSafeInteger(value.ownerTabId) || (value.ownerTabId as number) < 0 || !["local", "restored"].includes(value.origin as string) || !["user-turn", "out-of-character"].includes(value.purpose as string)
    || !["unconfirmed", "none", "context"].includes(value.injection as string) || typeof value.started !== "boolean"
    || !time(value.createdAt) || !time(value.updatedAt) || value.updatedAt < value.createdAt || hasBranch && (!id(value.storyBranchId) || value.transport !== "xhr")) return false;
  const route = { requestId: value.id, identity: value.identity, transport: value.transport };
  if (value.delivery !== null && (!value.started || !validStoryDispatchPacket({ ...route, phase: "settled", delivery: value.delivery }))) return false;
  if (value.injection === "unconfirmed" && value.started || value.injection === "context" && !(value.proposedContext as string).trim()) return false;
  if (!shape(value.wire, ["phase", "link", "sawFinish", "issue"])) return false;
  if (hasReply && (!validStoryDispatchReply(value.reply) || !validNativeStoryRequestLink(value.wire.link)
    || value.injection === "unconfirmed" || (value.delivery as StoryDispatchDelivery | null)?.status !== "accepted"
    || value.wire.phase !== "closed" || value.wire.sawFinish !== true
    || value.reply.observedAt < value.createdAt || value.reply.observedAt > value.updatedAt
    || value.reply.assistant.identity.nativeMessageKey !== value.wire.link.assistantMessageKey || value.reply.assistant.identity.nativeParentKey !== value.wire.link.userMessageKey)) return false;
  if (value.wire.phase === "waiting") return value.wire.link === null && value.wire.sawFinish === false && value.wire.issue === null;
  if (value.transport !== "xhr" || !value.started || !validNativeStoryStreamPacket({ ...route, ...value.wire })) return false;
  return value.wire.phase === "failed" || (value.delivery as StoryDispatchDelivery | null)?.status === "accepted";
}
export function captureDispatchSource(current: StoryDispatchCapture, source: StoryDispatchSource): StoryDispatchCapture {
  if (!validStoryDispatchSource(source) || source.requestId !== current.id || source.transport !== current.transport || !sameStoryValue(source.identity, current.identity)) throw Error("dispatch-source-conflict");
  const injection = source.outgoingText === current.originalDraft ? "none"
    : current.proposedContext.trim() && source.outgoingText === `${current.proposedContext}\n\n[User message]\n${current.originalDraft}` ? "context" : null;
  if (!injection || current.injection !== "unconfirmed" && current.injection !== injection) throw Error("dispatch-source-conflict");
  return { ...current, injection };
}
export function captureDispatchPacket(current: StoryDispatchCapture, packet: StoryDispatchPacket | NativeStoryStreamPacket): StoryDispatchCapture {
  const stream = "link" in packet;
  if (!(stream ? validNativeStoryStreamPacket(packet) : validStoryDispatchPacket(packet)) || packet.requestId !== current.id
    || packet.transport !== current.transport || !sameStoryValue(packet.identity, current.identity) || current.injection === "unconfirmed") throw Error("dispatch-packet-conflict");
  if (!stream) {
    if (packet.phase === "started") return { ...current, started: true };
    if (!current.started || current.delivery && !sameStoryValue(current.delivery, packet.delivery)) throw Error("dispatch-delivery-conflict");
    return { ...current, delivery: structuredClone(packet.delivery) };
  }
  if (!current.started || packet.phase !== "failed" && current.delivery?.status !== "accepted") throw Error("dispatch-delivery-conflict");
  if (current.wire.link && !sameStoryValue(current.wire.link, packet.link) || packet.link && !validNativeStoryRequestLink(packet.link)) throw Error("dispatch-link-conflict");
  if (sameStoryValue(current.wire, { phase: packet.phase, link: packet.link, sawFinish: packet.sawFinish, issue: packet.issue })) return current;
  if (current.wire.phase === "closed" || current.wire.phase === "failed") {
    // An earlier repeated packet cannot reopen a terminal wire state.
    if (packet.phase === "ready" || packet.phase === "finish") return current;
    throw Error("dispatch-wire-conflict");
  }
  if (current.wire.sawFinish && !packet.sawFinish && packet.phase !== "ready") throw Error("dispatch-wire-conflict");
  if (current.wire.phase === "finish" && packet.phase === "ready") return current;
  return { ...current, wire: { phase: packet.phase, link: structuredClone(packet.link), sawFinish: packet.sawFinish, issue: packet.issue } };
}
