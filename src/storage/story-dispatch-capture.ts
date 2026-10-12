import { captureDispatchPacket, captureDispatchSource, validStoryDispatchCapture, validStoryDispatchCaptureInput, type StoryDispatchCapture, type StoryDispatchCaptureInput, type StoryDispatchSource } from "../core/story-dispatch-capture";
import type { StoryDispatchPacket } from "../core/story-dispatch";
import type { NativeStoryStreamPacket } from "../core/story-native-stream";
import { automationMarker } from "../core/story-automation";
import { oldChatNotice, oldChatNoticePrompt } from "../core/old-chat-notice";
import { sameStoryValue } from "../core/story-value";
import type { ChatBinding, DataRecord } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { dispatchStoryRequest, planDispatchStoryRequest } from "./story-dispatch-ingestion";
import { planStoryRequestSettlement } from "./story-requests";

function liveScope(all: DataRecord[], capture: Pick<StoryDispatchCapture, "worldId" | "bindingId" | "identity">) {
  const binding = all.find(row => row.kind === "binding" && row.id === capture.bindingId)?.data as ChatBinding | undefined;
  if (!capture.worldId || !all.some(row => row.kind === "world" && row.id === capture.worldId) || !binding || binding.worldId !== capture.worldId || binding.chatId !== capture.identity.chatId) throw Error("dispatch-scope-conflict");
  return binding;
}
/** Saves source and, for an already selected anchored route, its pre-send story receipt.
 * Never creates a baseline, selects an observed reply or applies game effects. */
export async function prepareDispatchCapture(input: StoryDispatchCaptureInput, ownerTabId: number, repo: DeepRoleRepository = repository): Promise<void> {
  input = structuredClone(input);
  if (!validStoryDispatchCaptureInput(input) || !Number.isSafeInteger(ownerTabId) || ownerTabId < 0) throw Error("dispatch-input-invalid");
  await repo.updateRecords(all => {
    const binding = liveScope(all, input);
    if ((binding.characterScenes?.[input.worldId]?.revision ?? null) !== input.sceneRevision) throw Error("dispatch-scene-conflict");
    const previous = all.find(row => row.kind === "dispatch" && row.id === input.id)?.data as StoryDispatchCapture | undefined;
    const now = Date.now();
    const notice = oldChatNotice(binding, all.filter(r => r.kind === "snapshot").map(r => r.data as import("../core/types").HandoffSnapshot), all.filter(r => r.kind === "book").map(r => r.data as import("../core/types").MemoryBook), all.filter(r => r.kind === "world").map(r => r.data as import("../core/types").WorldProfile));
    const navigation = notice && !notice.sent && !notice.dismissed && ["ru", "en"].some(locale => input.proposedContext === oldChatNoticePrompt(notice, locale as "ru" | "en"));
    const capture: StoryDispatchCapture = { ...input, format: "deeprole-story-dispatch", contractVersion: 1, ownerTabId, origin: "local", purpose: navigation || binding.nextStoryMessageMode === "out-of-character" ? "out-of-character" : "user-turn", injection: "unconfirmed", started: false, delivery: null, wire: { phase: "waiting", link: null, sawFinish: false, issue: null }, createdAt: now, updatedAt: now };
    const world = all.find(r => r.kind === "world" && r.id === input.worldId)?.data as import("../core/types").WorldProfile | undefined;
     if (world?.storyAutomation && world.storyAutomation.mode !== "off" && input.proposedContext.includes(automationMarker(world))) capture.accompaniment = { mode: world.storyAutomation.mode, revision: world.storyAutomation.revision, profileLocks: Object.fromEntries(all.filter(r => r.kind === "entity" && (r.data as import("../core/types").SceneEntity).worldId === world.id && (r.data as import("../core/types").SceneEntity).kind === "character").map(r => [r.id, [...(r.data as import("../core/types").SceneEntity).characterSheet?.protectedProfileFields ?? []]])), profileVersions: Object.fromEntries(all.filter(r => r.kind === "entity" && (r.data as import("../core/types").SceneEntity).worldId === world.id && (r.data as import("../core/types").SceneEntity).kind === "character").map(r => [r.id, { ...(r.data as import("../core/types").SceneEntity).profileFieldRevisions }])) };
     if (previous) {
      const route = (v: StoryDispatchCapture) => ({ id: v.id, worldId: v.worldId, bindingId: v.bindingId, identity: v.identity, transport: v.transport, sceneRevision: v.sceneRevision, originalDraft: v.originalDraft, proposedContext: v.proposedContext, ownerTabId: v.ownerTabId, origin: v.origin });
      if (!validStoryDispatchCapture(previous) || !sameStoryValue(route(previous), route(capture))) throw Error("dispatch-input-conflict");
      return { records: [], removed: [], result: undefined };
    }
    const story = planDispatchStoryRequest(all, capture);
    if (story.length) capture.storyBranchId = (story[0]!.data as import("../core/story-records").StoryRequest).branchId;
    if (!validStoryDispatchCapture(capture)) throw Error("dispatch-input-invalid");
    const consumed = !navigation && capture.purpose === "out-of-character" ? [{ kind: "binding" as const, id: binding.id, data: { ...binding, nextStoryMessageMode: undefined } }] : [];
    return { records: [{ kind: "dispatch" as const, id: capture.id, data: capture }, ...story, ...consumed], removed: [], result: undefined };
  }, undefined, ["dispatch", "world", "binding", "story", "entity", "snapshot", "book"]);
}
async function update(id: string, ownerTabId: number, change: (capture: StoryDispatchCapture) => StoryDispatchCapture, repo: DeepRoleRepository) {
  await repo.updateRecords(all => {
    const current = all.find(row => row.kind === "dispatch" && row.id === id)?.data as StoryDispatchCapture | undefined;
    if (!current || !validStoryDispatchCapture(current) || current.origin !== "local" || current.ownerTabId !== ownerTabId) throw Error("dispatch-owner-conflict");
    liveScope(all, current);
    const next = change(structuredClone(current));
    if (sameStoryValue(current, next)) return { records: [], removed: [], result: undefined };
    next.updatedAt = Math.max(Date.now(), current.updatedAt);
    if (!validStoryDispatchCapture(next)) throw Error("dispatch-update-invalid");
    const request = dispatchStoryRequest(all, current);
    const delivery = next.delivery;
    const settlement = delivery?.status === "accepted" ? delivery : delivery?.status === "failed" && (delivery.code === "network" || delivery.code === "aborted" || delivery.code === "http")
      ? { status: "failed" as const, reason: delivery.code, httpStatus: delivery.httpStatus ?? null } : null;
    // Unknown/redirected/superseded delivery remains unaccepted, not fabricated
    // into one of the chronicle's narrower failure categories.
    const story = request && settlement ? planStoryRequestSettlement(all, id, settlement).records : [];
    return { records: [{ kind: "dispatch" as const, id, data: next }, ...story], removed: [], result: undefined };
  }, undefined, ["dispatch", "world", "binding", "story", "entity"]);
}
export async function confirmDispatchCapture(source: StoryDispatchSource, ownerTabId: number, repo: DeepRoleRepository = repository) {
  source = structuredClone(source);
  await update(source?.requestId, ownerTabId, current => captureDispatchSource(current, source), repo);
}
export async function advanceDispatchCapture(packet: StoryDispatchPacket | NativeStoryStreamPacket, ownerTabId: number, repo: DeepRoleRepository = repository) {
  packet = structuredClone(packet);
  await update(packet?.requestId, ownerTabId, current => captureDispatchPacket(current, packet), repo);
}
/** Full backups are historical data. Even a copied local receipt may not resume live work. */
export function assertDispatchCaptureGraph(records: DataRecord[]) {
  for (const row of records.filter(row => row.kind === "dispatch")) {
    const capture = row.data;
    if (!validStoryDispatchCapture(capture) || capture.worldId !== null && !records.some(world => world.kind === "world" && world.id === capture.worldId)) throw Error("dispatch-backup-invalid");
    dispatchStoryRequest(records, capture);
  }
}
