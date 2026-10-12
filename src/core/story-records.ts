import { validCharacterStatus, EMPTY_STATUS } from "./characters";
import type { CharacterStatus, DataRecord } from "./types";
import { projectStoryBranch, replayStoryEvents } from "./story-projection";
import { sameStoryValue } from "./story-value";
import { validNativeStoryKey } from "./story-transport";
import { indexStoryLineage, type StoryLineagePosition } from "./story-lineage";
import { validStoryBaselineEffects, type StoryBaselineEffects } from "./story-baseline-effects";
import { validStoryTurnEffects, type StoryTurnEffects } from "./story-turn-effects";
import { validStoryFact, validStoryUpdateDiagnostic, storyReplyProse } from "./story-update";
import { validCharacterCandidate, validCharacterDiscoveryProgress, type CharacterCandidate, type CharacterDiscoveryProgress } from "./story-character-discovery";
import { validDiscoveryProfile, type DiscoveryProfile } from "./discovery-profile";
import { validProfileSupplement, validProfileAdditions, type ProfileSupplement } from "./profile-supplements";
import type { ProfileValues } from "./character-profile";
import { validProfileSeeds, type ProfileSeeds } from "./story-profile-view";
export { canonicalStoryValue } from "./story-value";

interface StoryScope {
  format: "deeprole-story";
  contractVersion: 1;
  id: string;
  worldId: string | null;
  playthroughId: string;
  branchId: string;
  createdAt: number;
  updatedAt: number;
}
export interface StorySnapshot {
  presentIds: string[];
  partnerIds: string[];
  states: Record<string, CharacterStatus>;
  /** Historical labels, not a replacement for the editable world profiles. */
  names: Record<string, string>;
}
export interface StoryBaseline extends StoryScope {
  profileSeeds?: ProfileSeeds;
  type: "baseline";
  historyBeforeBaseline: "unknown";
  legacyEntryScope: "unclassified";
  origin: { bindingId: string; chatId: string; worldId: string; sceneRevision: string | null;
    /** Explicit checkpoint choice, not reconstruction of preceding events. */
    nativeAnchor?: { nativeMessageKey: string | null; role: "assistant" | null } };
  snapshot: StorySnapshot;
  /** Optional on older checkpoints. Never infer this from effects appearing later. */
  legacyEffects?: StoryBaselineEffects;
}
export interface StoryBranch extends StoryScope {
  type: "branch";
  baselineId: string;
  parentBranchId: string | null;
  forkRevisionId: string | null;
  headRevisionId: string | null;
  selectionVersion: number;
  /** Absent on the first RP-01 foundation records until an explicit selection. */
  projectionId?: string;
  gameManaged?: boolean;
  pausedAtRevisionId?: string | null;
}
export interface StoryRevision extends StoryScope {
  type: "revision";
  messageId: string;
  nativeMessageKey: string;
  requestId: string | null;
  parentRevisionId: string | null;
  role: "user" | "assistant";
  completion: "complete" | "partial" | "interrupted";
  content: string;
  /** Explicitly checked local receipt; an echoed requestId alone is legacy/unproven. */
  requestProof?: { nativeParentKey: string | null };
  storyPurpose?: "game" | "out-of-character";
  updateDiagnostic?: import("./story-update").StoryUpdateDiagnostic;
  repairDiagnostic?: import("./story-update").StoryUpdateDiagnostic;
  metadataRepair?: { id: string; status: "requested" | "done" | "failed" | "cancelled"; at: number };
  characterDiscovery?: CharacterDiscoveryProgress;
}
export type StoryRequestDelivery = { status: "prepared" }
  | { status: "accepted"; at: number; httpStatus: number }
  | { status: "failed"; at: number; reason: "network" | "aborted" | "http"; httpStatus: number | null };
export interface StoryRequest extends StoryScope {
  type: "request";
  purpose: "user-turn" | "assistant-retry";
  bindingId: string;
  chatId: string;
  nativeParentKey: string | null;
  parentRevisionId: string | null;
  selectedHeadRevisionId: string | null;
  selectionVersion: number;
  sceneRevision: string | null;
  delivery: StoryRequestDelivery;
  /** Frozen approvals at preparation, not a copy of the mutable latest scene. Older receipts lack it. */
  context?: { algorithmVersion: 1; acceptedEventIds: string[] };
}
export interface StoryStateChange { entityId: string; before: CharacterStatus | null; after: CharacterStatus | null }
export interface StorySceneMembership { presentIds: string[]; partnerIds: string[] }
export interface StoryEvent extends StoryScope {
  type: "event";
  revisionId: string;
  ordinal: number;
  /** Not selected, applied or promoted to world canon merely by being stored. */
  disposition: "candidate";
  label: string;
  quote: string;
  participantIds: string[];
  changes: StoryStateChange[];
  sceneChange?: { before: StorySceneMembership; after: StorySceneMembership };
  effects?: StoryTurnEffects;
  memory?: import("./story-update").StoryFact & { edited?: boolean };
  characterCandidate?: CharacterCandidate;
  characterProfile?: DiscoveryProfile;
  /** Original quote source when the approved full profile belongs to a later turn. */
  characterSourceRevisionId?: string;
  profileSupplement?: ProfileSupplement;
  /** Approved full field values for this story only; never a raw entity-row write. */
  profileUpdate?: Partial<ProfileValues>;
}
export interface StoryProjection extends StoryScope {
  type: "projection";
  algorithmVersion: 1;
  baselineId: string;
  headRevisionId: string | null;
  selectionVersion: number;
  /** Explicit local approvals, including accepted but currently unselected alternatives. */
  acceptedEventIds: string[];
  revisionIds: string[];
  appliedEventIds: string[];
  snapshot: StorySnapshot;
  bindingId: string;
  chatId: string;
  bindingRevision: string;
  /** Receipt for an idempotent retry of the immediately preceding selection. */
  previousHeadRevisionId: string | null;
}
export type StoryRecord = StoryBaseline | StoryBranch | StoryRevision | StoryEvent | StoryProjection | StoryRequest;
export const storyRow = (data: StoryRecord): DataRecord => ({ kind: "story", id: data.id, data });

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const id = (value: unknown): value is string => text(value, 160) && !!value && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const optionalId = (value: unknown) => value === null || id(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => time(value) && Number.isSafeInteger(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const common = ["format", "contractVersion", "id", "worldId", "playthroughId", "branchId", "createdAt", "updatedAt", "type"];
const state = (value: unknown) => value === null || validCharacterStatus(value);
const membership = (value: unknown): value is StorySceneMembership => object(value) && keys(value, ["presentIds", "partnerIds"]) && ids(value.presentIds) && ids(value.partnerIds) && value.partnerIds.every(person => (value.presentIds as string[]).includes(person));
const snapshot = (value: unknown): value is StorySnapshot => object(value) && keys(value, ["presentIds", "partnerIds", "states", "names"]) && ids(value.presentIds) && ids(value.partnerIds) && value.partnerIds.every(person => (value.presentIds as string[]).includes(person))
  && object(value.states) && Object.entries(value.states).every(([key, status]) => id(key) && validCharacterStatus(status))
  && object(value.names) && Object.entries(value.names).every(([key, name]) => id(key) && typeof name === "string");
export const validStorySnapshot = snapshot;
export function validStoryRequestDelivery(value: unknown): value is StoryRequestDelivery {
  if (!object(value)) return false;
  if (value.status === "prepared") return keys(value, ["status"]);
  if (!time(value.at)) return false;
  if (value.status === "accepted") return keys(value, ["status", "at", "httpStatus"]) && integer(value.httpStatus) && value.httpStatus >= 200 && value.httpStatus < 300;
  return value.status === "failed" && keys(value, ["status", "at", "reason", "httpStatus"]) && (value.reason === "http" ? integer(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 && (value.httpStatus < 200 || value.httpStatus >= 300) : ["network", "aborted"].includes(String(value.reason)) && value.httpStatus === null);
}

export function validStoryRecord(value: unknown): value is StoryRecord {
  if (!object(value) || value.format !== "deeprole-story" || value.contractVersion !== 1 || !id(value.id) || !optionalId(value.worldId) || !id(value.playthroughId) || !id(value.branchId) || !time(value.createdAt) || !time(value.updatedAt) || value.updatedAt < value.createdAt) return false;
  switch (value.type) {
    case "baseline": {
      const origin = value.origin;
      return keys(value, [...common, "historyBeforeBaseline", "legacyEntryScope", "origin", "snapshot", "legacyEffects", "profileSeeds"])
        && value.historyBeforeBaseline === "unknown" && value.legacyEntryScope === "unclassified"
        && object(origin) && keys(origin, ["bindingId", "chatId", "worldId", "sceneRevision", "nativeAnchor"]) && id(origin.bindingId) && id(origin.chatId) && id(origin.worldId) && optionalId(origin.sceneRevision)
        && (origin.nativeAnchor === undefined || object(origin.nativeAnchor) && keys(origin.nativeAnchor, ["nativeMessageKey", "role"])
          && (origin.nativeAnchor.nativeMessageKey === null ? origin.nativeAnchor.role === null : validNativeStoryKey(origin.nativeAnchor.nativeMessageKey) && origin.nativeAnchor.role === "assistant"))
        && snapshot(value.snapshot) && (value.legacyEffects === undefined || validStoryBaselineEffects(value.legacyEffects, origin.worldId)) && (value.profileSeeds === undefined || validProfileSeeds(value.profileSeeds));
    }
    case "branch": return keys(value, [...common, "baselineId", "parentBranchId", "forkRevisionId", "headRevisionId", "selectionVersion", "projectionId", "gameManaged", "pausedAtRevisionId"])
      && value.branchId === value.id && id(value.baselineId) && optionalId(value.parentBranchId) && optionalId(value.forkRevisionId) && optionalId(value.headRevisionId) && integer(value.selectionVersion)
      && (value.parentBranchId === null) === (value.forkRevisionId === null) && (value.projectionId === undefined || id(value.projectionId)) && (value.gameManaged === undefined || typeof value.gameManaged === "boolean") && (value.pausedAtRevisionId === undefined || value.gameManaged === true && optionalId(value.pausedAtRevisionId) && value.pausedAtRevisionId === value.headRevisionId);
    case "revision": return keys(value, [...common, "messageId", "nativeMessageKey", "requestId", "parentRevisionId", "role", "completion", "content", "requestProof", "storyPurpose", "updateDiagnostic", "metadataRepair", "repairDiagnostic", "characterDiscovery"])
      && id(value.messageId) && id(value.nativeMessageKey) && optionalId(value.requestId) && optionalId(value.parentRevisionId) && ["user", "assistant"].includes(String(value.role)) && ["complete", "partial", "interrupted"].includes(String(value.completion)) && text(value.content, 250_000) && (value.storyPurpose === undefined || ["game", "out-of-character"].includes(String(value.storyPurpose)))
      && (value.requestProof === undefined || id(value.requestId) && validNativeStoryKey(value.nativeMessageKey) && object(value.requestProof) && keys(value.requestProof, ["nativeParentKey"]) && (value.requestProof.nativeParentKey === null || validNativeStoryKey(value.requestProof.nativeParentKey)))
      && (value.updateDiagnostic === undefined || value.role === "assistant" && validStoryUpdateDiagnostic(value.updateDiagnostic))
      && (value.repairDiagnostic === undefined || value.role === "assistant" && validStoryUpdateDiagnostic(value.repairDiagnostic))
      && (value.metadataRepair === undefined || value.role === "assistant" && object(value.metadataRepair) && Object.keys(value.metadataRepair).length === 3 && keys(value.metadataRepair, ["id", "status", "at"]) && id(value.metadataRepair.id) && ["requested", "done", "failed", "cancelled"].includes(String(value.metadataRepair.status)) && time(value.metadataRepair.at))
      && (value.characterDiscovery === undefined || value.completion === "complete" && value.storyPurpose !== "out-of-character" && validCharacterDiscoveryProgress(value.characterDiscovery) && value.characterDiscovery.request.end <= storyReplyProse(value.content as string).length);
    case "request": return keys(value, [...common, "purpose", "bindingId", "chatId", "nativeParentKey", "parentRevisionId", "selectedHeadRevisionId", "selectionVersion", "sceneRevision", "delivery", "context"])
      && ["user-turn", "assistant-retry"].includes(String(value.purpose)) && id(value.bindingId) && id(value.chatId) && (value.nativeParentKey === null || validNativeStoryKey(value.nativeParentKey))
      && optionalId(value.parentRevisionId) && optionalId(value.selectedHeadRevisionId) && integer(value.selectionVersion) && optionalId(value.sceneRevision) && validStoryRequestDelivery(value.delivery)
      && (value.delivery.status === "prepared" || value.delivery.at >= value.createdAt && value.delivery.at <= value.updatedAt)
      && (value.context === undefined || object(value.context) && keys(value.context, ["algorithmVersion", "acceptedEventIds"]) && value.context.algorithmVersion === 1 && ids(value.context.acceptedEventIds)
        && value.context.acceptedEventIds.every((item, index, list) => index === 0 || list[index - 1]! < item));
    case "event": return keys(value, [...common, "revisionId", "ordinal", "disposition", "label", "quote", "participantIds", "changes", "sceneChange", "effects", "memory", "characterCandidate", "characterProfile", "characterSourceRevisionId", "profileSupplement", "profileUpdate"])
      && id(value.revisionId) && integer(value.ordinal) && value.disposition === "candidate" && text(value.label, 240) && !!value.label.trim() && text(value.quote, 4000) && !!value.quote.trim() && ids(value.participantIds)
      && Array.isArray(value.changes) && value.changes.every(change => object(change) && keys(change, ["entityId", "before", "after"]) && id(change.entityId) && (value.participantIds as string[]).includes(change.entityId) && state(change.before) && state(change.after))
      && new Set(value.changes.map(change => change.entityId)).size === value.changes.length
      && (value.effects === undefined || validStoryTurnEffects(value.effects, value.worldId as string | null))
      && (value.memory === undefined || object(value.memory) && keys(value.memory, ["text", "kind", "quote", "edited"]) && validStoryFact({ text: value.memory.text, kind: value.memory.kind, quote: value.memory.quote }) && value.memory.quote === value.quote && (value.memory.edited === undefined || typeof value.memory.edited === "boolean") && value.changes.length === 0 && value.effects === undefined && value.sceneChange === undefined)
      && (value.characterCandidate === undefined || validCharacterCandidate(value.characterCandidate) && value.characterCandidate.quote === value.quote && value.memory === undefined && value.sceneChange === undefined && (value.effects === undefined ? value.changes.length === 0 && (value.participantIds as string[]).length === 0 : validDiscoveryEffect(value.effects as import("./story-turn-effects").StoryTurnEffects, value.changes)))
      && (value.characterProfile === undefined || value.characterCandidate !== undefined && validDiscoveryProfile(value.characterProfile))
      && (value.characterSourceRevisionId === undefined || id(value.characterSourceRevisionId) && value.characterCandidate !== undefined && value.characterProfile !== undefined && value.effects !== undefined && (value.characterProfile as DiscoveryProfile).headRevisionId === value.revisionId)
      && (value.profileSupplement === undefined || validProfileSupplement(value.profileSupplement) && value.profileSupplement.profile.headRevisionId === value.revisionId && value.changes.length === 0 && (value.participantIds as string[]).length === 1 && value.participantIds[0] === value.profileSupplement.entityId && value.effects === undefined && value.sceneChange === undefined && value.memory === undefined && value.characterCandidate === undefined && value.characterProfile === undefined)
      && (value.profileUpdate === undefined || value.profileSupplement !== undefined && validProfileAdditions(value.profileUpdate) && Object.entries(value.profileUpdate).every(([k, text]) => {
        const profile = (value.profileSupplement as ProfileSupplement).profile, before = profile.values[k as keyof ProfileValues];
        return profile.proposal[k as keyof ProfileValues]?.status === "found" && (!before.trim() || (text as string).startsWith(before + "\n"));
      }))
      && (value.sceneChange === undefined || object(value.sceneChange) && keys(value.sceneChange, ["before", "after"]) && membership(value.sceneChange.before) && membership(value.sceneChange.after)
        && [...value.sceneChange.before.presentIds, ...value.sceneChange.after.presentIds].every(person => (value.participantIds as string[]).includes(person)));
    case "projection": return keys(value, [...common, "algorithmVersion", "baselineId", "headRevisionId", "selectionVersion", "acceptedEventIds", "revisionIds", "appliedEventIds", "snapshot", "bindingId", "chatId", "bindingRevision", "previousHeadRevisionId"])
      && value.algorithmVersion === 1 && id(value.baselineId) && optionalId(value.headRevisionId) && optionalId(value.previousHeadRevisionId) && integer(value.selectionVersion) && value.selectionVersion > 0 && ids(value.acceptedEventIds) && ids(value.revisionIds) && ids(value.appliedEventIds)
      && snapshot(value.snapshot) && id(value.bindingId) && id(value.chatId) && id(value.bindingRevision);
    default: return false;
  }
}
function validDiscoveryEffect(effects: import("./story-turn-effects").StoryTurnEffects, changes: StoryStateChange[]) {
  return effects.createdEntities.length === 1 && effects.createdPhotos.length === 0 && sameStoryValue(effects.before, effects.after) && effects.createdEntities[0]!.characterSheet?.protagonist === false
    && changes.length === 1 && changes[0]!.entityId === effects.createdEntities[0]!.id && changes[0]!.before === null && sameStoryValue(changes[0]!.after, EMPTY_STATUS);
}

/** Graph validation is separate from single-record validation; backups need both. */
export function assertStoryGraph(records: DataRecord[]): void {
  const rows = records.filter(row => row.kind === "story");
  if (!rows.length) return;
  if (rows.some(row => !validStoryRecord(row.data) || row.data.id !== row.id)) throw new Error("story-record-invalid");
  const all = new Map(rows.map(row => [row.id, row.data as StoryRecord]));
  if (all.size !== rows.length) throw new Error("story-id-conflict");
  const worlds = new Set(records.filter(row => row.kind === "world").map(row => row.id));
  const entityProfiles = new Map(records.filter(r => r.kind === "entity").map(r => [r.id, r.data as import("./types").SceneEntity]));
  for (const e of all.values()) if (e.type === "event") for (const p of e.effects?.createdEntities ?? []) if (!entityProfiles.has(p.id)) entityProfiles.set(p.id, p);
  const compatible = (a: StoryRecord, b: StoryRecord | undefined) => !!b && a.worldId === b.worldId && a.playthroughId === b.playthroughId;
  const branch = (item: StoryRecord): StoryBranch => {
    const target = all.get(item.branchId);
    if (target?.type !== "branch" || !compatible(item, target)) throw new Error("story-link-invalid");
    return target;
  };
  const eventSlots = new Set<string>(), legacyRoots = new Set<string>();
  const messages = new Map<string, string>();
  for (const item of all.values()) {
    if (item.worldId !== null && !worlds.has(item.worldId)) throw new Error("story-world-missing");
    const owner = branch(item);
    if (item.type === "baseline") {
      if (owner.baselineId !== item.id || owner.parentBranchId !== null || item.worldId !== null && item.origin.worldId !== item.worldId) throw new Error("story-link-invalid");
      const key = JSON.stringify([item.origin.bindingId, item.origin.worldId]);
      if (legacyRoots.has(key)) throw new Error("story-baseline-conflict");
      legacyRoots.add(key);
      for (const id of Object.keys(item.profileSeeds ?? {})) {
        const p = entityProfiles.get(id);
        if (!p || p.worldId !== item.worldId || p.kind !== "character" || p.playthroughChatId && p.playthroughChatId !== item.origin.chatId) throw Error("story-evidence-invalid");
      }
    }
    if (item.type === "branch") {
      const baseline = all.get(item.baselineId);
      if (baseline?.type !== "baseline" || !compatible(item, baseline) || item.parentBranchId === null && baseline.branchId !== item.id) throw new Error("story-link-invalid");
      if (item.parentBranchId !== null) {
        const parent = all.get(item.parentBranchId), fork = all.get(item.forkRevisionId!);
        if (parent?.type !== "branch" || fork?.type !== "revision" || !compatible(item, parent) || !compatible(item, fork) || fork.branchId !== parent.id || item.baselineId !== parent.baselineId) throw new Error("story-link-invalid");
      }
      if (item.headRevisionId !== null) {
        const head = all.get(item.headRevisionId);
        if (head?.type !== "revision" || !compatible(item, head) || head.branchId !== item.id && head.id !== item.forkRevisionId) throw new Error("story-link-invalid");
      }
      if (item.projectionId !== undefined) {
        const projection = all.get(item.projectionId);
        if (projection?.type !== "projection" || !compatible(item, projection) || projection.branchId !== item.id || projection.headRevisionId !== item.headRevisionId || projection.selectionVersion !== item.selectionVersion) throw new Error("story-projection-invalid");
      }
    }
    if (item.type === "revision") {
      if (item.parentRevisionId !== null) {
        const parent = all.get(item.parentRevisionId);
        if (parent?.type !== "revision" || !compatible(item, parent) || parent.branchId !== item.branchId && parent.id !== owner.forkRevisionId) throw new Error("story-link-invalid");
      }
      const key = JSON.stringify([item.playthroughId, item.messageId]), signature = JSON.stringify([item.role, item.nativeMessageKey]);
      if (messages.has(key) && messages.get(key) !== signature) throw new Error("story-message-conflict");
      messages.set(key, signature);
    }
    if (item.type === "event") {
      const revision = all.get(item.revisionId);
      if (revision?.type !== "revision" || !compatible(item, revision) || item.branchId !== revision.branchId) throw new Error("story-link-invalid");
      const quoteSource = item.characterSourceRevisionId ? all.get(item.characterSourceRevisionId) : revision;
      if (quoteSource?.type !== "revision" || !compatible(item, quoteSource) || !quoteSource.content.includes(item.quote)) throw new Error("story-evidence-invalid");
      const candidateBaseline = item.characterCandidate ? all.get(owner.baselineId) : undefined;
      if (item.characterCandidate && (candidateBaseline?.type !== "baseline" || revision.completion !== "complete" || revision.storyPurpose === "out-of-character" || quoteSource.completion !== "complete" || quoteSource.storyPurpose === "out-of-character" || !storyReplyProse(quoteSource.content).includes(item.quote) || item.effects?.createdEntities.some(e => e.playthroughChatId !== candidateBaseline.origin.chatId))) throw new Error("story-evidence-invalid");
      const profile = item.characterProfile ?? item.profileSupplement?.profile;
      if (profile) {
        const head = all.get(profile.headRevisionId), ancestors = new Set<string>();
        let cursor = head;
        while (cursor?.type === "revision" && !ancestors.has(cursor.id)) { ancestors.add(cursor.id); cursor = all.get(cursor.parentRevisionId ?? ""); }
        if (head?.type !== "revision" || !compatible(item, head) || head.branchId !== item.branchId || head.completion !== "complete" || head.storyPurpose === "out-of-character" || !ancestors.has(quoteSource.id)
          || profile.proofs.some(p => { const source = all.get(p.revisionId); return source?.type !== "revision" || !compatible(item, source) || source.completion !== "complete" || source.storyPurpose === "out-of-character" || !ancestors.has(source.id) || !storyReplyProse(source.content).includes(p.quote); })) throw Error("story-evidence-invalid");
        if (item.profileSupplement) {
          const person = entityProfiles.get(item.profileSupplement.entityId);
          const baseline = all.get(owner.baselineId);
          if (!person || person.kind !== "character" || person.worldId !== item.worldId || person.playthroughChatId && (baseline?.type !== "baseline" || person.playthroughChatId !== baseline.origin.chatId) || !storyReplyProse(revision.content).includes(item.quote)) throw Error("story-evidence-invalid");
        }
      }
      const slot = JSON.stringify([item.revisionId, item.ordinal]);
      if (eventSlots.has(slot)) throw new Error("story-order-conflict");
      eventSlots.add(slot);
    }
  }
  // Iterative, linear traversal: a long history must not overflow the JS stack.
  for (const type of ["branch", "revision"] as const) {
    const finished = new Set<string>();
    for (const item of all.values()) {
      if (item.type !== type || finished.has(item.id)) continue;
      const path = new Set<string>(); let current: StoryRecord | undefined = item;
      while (current?.type === type && !finished.has(current.id)) {
        if (path.has(current.id)) throw new Error("story-cycle");
        path.add(current.id);
        current = all.get(current.type === "branch" ? current.parentBranchId ?? "" : current.type === "revision" ? current.parentRevisionId ?? "" : "");
      }
      for (const id of path) finished.add(id);
    }
  }
  for (const item of all.values()) if (item.type === "projection") {
    const owner = branch(item), baseline = all.get(owner.baselineId) as StoryBaseline;
    if (owner.projectionId !== item.id || item.baselineId !== owner.baselineId || item.bindingId !== baseline.origin.bindingId || item.chatId !== baseline.origin.chatId) throw new Error("story-projection-invalid");
    if (item.previousHeadRevisionId !== null) {
      const previous = all.get(item.previousHeadRevisionId);
      if (previous?.type !== "revision" || !compatible(item, previous) || previous.branchId !== owner.id && previous.id !== owner.forkRevisionId) throw new Error("story-projection-invalid");
    }
    const expected = projectStoryBranch([...all.values()], owner.id, owner.headRevisionId, item.acceptedEventIds);
    if (!sameStoryValue(expected, { headRevisionId: item.headRevisionId, acceptedEventIds: item.acceptedEventIds, revisionIds: item.revisionIds, appliedEventIds: item.appliedEventIds, snapshot: item.snapshot })) throw new Error("story-projection-invalid");
  }
  const ancestry = [...all.values()].some(item => item.type === "request") ? indexStoryLineage(all.values()) : undefined;
  const checkedContexts = new Set<string>();
  for (const item of all.values()) if (item.type === "request") {
    const owner = branch(item);
    assertStoryRequestLinks(item, owner, all, ancestry);
    if (!item.context) continue;
    const parentPosition = ancestry!.get(item.parentRevisionId ?? "");
    const events = item.context.acceptedEventIds.map(id => {
      const event = all.get(id), source = event?.type === "event" ? all.get(event.revisionId) : undefined, position = source && ancestry!.get(source.id);
      if (event?.type !== "event" || !compatible(item, event) || event.branchId !== owner.id || source?.type !== "revision" || source.completion !== "complete"
        || !parentPosition || !position || position.start > parentPosition.start || parentPosition.start >= position.end) throw new Error("story-request-context-invalid");
      return { event, position };
    }).sort((a, b) => a.position.start - b.position.start || a.event.ordinal - b.event.ordinal);
    // Same approvals + baseline imply the same replay, even when later replies add no effects.
    // Reference/ancestry checks above still run separately for every receipt.
    const cacheKey = JSON.stringify([owner.baselineId, item.context.acceptedEventIds]);
    if (!checkedContexts.has(cacheKey)) {
      replayStoryEvents((all.get(owner.baselineId) as StoryBaseline).snapshot, events.map(item => item.event));
      checkedContexts.add(cacheKey);
    }
  }
  const sourceSlots = new Map<string, string>();
  for (const item of all.values()) if (item.type === "revision" && item.requestProof) {
    const request = all.get(item.requestId!), parent = all.get(item.parentRevisionId ?? "");
    const baseline = all.get(branch(item).baselineId) as StoryBaseline;
    if (request?.type !== "request" || !compatible(item, request) || item.branchId !== request.branchId || request.delivery.status !== "accepted") throw new Error("story-request-unaccepted");
    if (item.nativeMessageKey === item.requestProof.nativeParentKey || item.nativeMessageKey === baseline.origin.nativeAnchor?.nativeMessageKey || item.requestProof.nativeParentKey !== (parent?.type === "revision" ? parent.nativeMessageKey : baseline.origin.nativeAnchor?.nativeMessageKey ?? null) || parent?.type === "revision" && parent.completion !== "complete") throw new Error("story-request-link-invalid");
    if (request.purpose === "assistant-retry") {
      if (item.role !== "assistant" || item.parentRevisionId !== request.parentRevisionId) throw new Error("story-request-link-invalid");
    } else if (item.role === "user") {
      if (item.parentRevisionId !== request.parentRevisionId) throw new Error("story-request-link-invalid");
    } else if (parent?.type !== "revision" || parent.role !== "user" || !parent.requestProof || parent.requestId !== request.id) throw new Error("story-request-link-invalid");
    const slot = JSON.stringify([request.id, item.role]);
    const identity = JSON.stringify([item.messageId, item.nativeMessageKey, item.role === "user" ? item.id : null]);
    if (sourceSlots.has(slot) && sourceSlots.get(slot) !== identity) throw new Error("story-request-source-conflict");
    sourceSlots.set(slot, identity);
  }
}

/** The caller must validate the graph first. No text or model field chooses ancestry. */
export function assertStoryRequestLinks(request: StoryRequest, owner: StoryBranch, all: Map<string, StoryRecord>, ancestry: Map<string, StoryLineagePosition> = indexStoryLineage(all.values())): void {
  const baseline = all.get(owner.baselineId) as StoryBaseline;
  if (owner.parentBranchId !== null || request.bindingId !== baseline.origin.bindingId || request.chatId !== baseline.origin.chatId) throw new Error("story-request-link-invalid");
  if (request.parentRevisionId === null) {
    if (request.nativeParentKey !== (baseline.origin.nativeAnchor?.nativeMessageKey ?? null) || request.purpose !== "user-turn") throw new Error("story-request-link-invalid");
    if (request.selectedHeadRevisionId !== null) {
      // Editing the first post-checkpoint user turn is safe only after an explicit checkpoint
      // choice. An old unanchored scene must never be retroactively declared the chat root.
      const head = all.get(request.selectedHeadRevisionId), position = ancestry.get(request.selectedHeadRevisionId);
      if (!baseline.origin.nativeAnchor || head?.type !== "revision" || head.branchId !== owner.id || !position?.complete || !position.distinct) throw new Error("story-request-link-invalid");
    }
    return;
  }
  const parent = all.get(request.parentRevisionId);
  if (parent?.type !== "revision" || parent.nativeMessageKey !== request.nativeParentKey || parent.worldId !== request.worldId || parent.playthroughId !== request.playthroughId || parent.completion !== "complete" || parent.role !== (request.purpose === "user-turn" ? "assistant" : "user")) throw new Error("story-request-link-invalid");
  const head = all.get(request.selectedHeadRevisionId ?? ""), headPosition = ancestry.get(request.selectedHeadRevisionId ?? ""), parentPosition = ancestry.get(parent.id);
  if (head?.type !== "revision" || head.branchId !== owner.id || !headPosition?.complete || !headPosition.distinct) throw new Error("story-request-link-invalid");
  if (!parentPosition || parentPosition.start > headPosition.start || headPosition.start >= parentPosition.end) throw new Error("story-request-parent-unselected");
}
