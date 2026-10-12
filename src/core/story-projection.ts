import type { StoryBaseline, StoryBranch, StoryEvent, StoryRecord, StoryRevision, StorySnapshot } from "./story-records";
import { sameStoryValue } from "./story-value";

export interface StoryProjectionValue {
  headRevisionId: string | null;
  acceptedEventIds: string[];
  revisionIds: string[];
  appliedEventIds: string[];
  snapshot: StorySnapshot;
}

export class StoryProjectionError extends Error {
  constructor(code: string, readonly details?: { eventId?: string; entityId?: string; path: string }) {
    super(code); this.name = "StoryProjectionError";
  }
}

/** Pure replay of a validated graph. Exact evidence alone is NOT approval.
 * No profiles, world canon, image jobs or current bindings are changed here.
 */
export function projectStoryBranch(records: StoryRecord[], branchId: string, headRevisionId: string | null, acceptedEventIds: string[]): StoryProjectionValue {
  const all = new Map(records.map(record => [record.id, record]));
  if (all.size !== records.length) throw new StoryProjectionError("story-id-conflict");
  const candidate = all.get(branchId);
  if (candidate?.type !== "branch") throw new StoryProjectionError("story-scope-invalid");
  const branch: StoryBranch = candidate;
  const compatible = (record: StoryRecord) => record.worldId === branch.worldId && record.playthroughId === branch.playthroughId;
  const baseline = all.get(branch.baselineId);
  if (baseline?.type !== "baseline" || !compatible(baseline)) throw new StoryProjectionError("story-lineage-invalid");

  function chain(target: string | null): StoryRevision[] {
    const reversed: StoryRevision[] = [], seen = new Set<string>(), messages = new Set<string>(), nativeMessages = new Set<string>();
    let id = target;
    while (id !== null) {
      if (seen.has(id)) throw new StoryProjectionError("story-cycle");
      seen.add(id);
      const current = all.get(id), owner = current && all.get(current.branchId);
      if (current?.type !== "revision" || !compatible(current) || owner?.type !== "branch" || owner.baselineId !== branch.baselineId || !compatible(owner) || messages.has(current.messageId)) throw new StoryProjectionError("story-lineage-invalid");
      const nativeIdentity = JSON.stringify([current.role, current.nativeMessageKey]);
      if (nativeMessages.has(nativeIdentity)) throw new StoryProjectionError("story-lineage-invalid");
      nativeMessages.add(nativeIdentity); messages.add(current.messageId); reversed.push(current);
      if (current.parentRevisionId === null && owner.parentBranchId !== null) throw new StoryProjectionError("story-lineage-invalid");
      if (current.parentRevisionId !== null) {
        const parent = all.get(current.parentRevisionId);
        if (parent?.type !== "revision" || parent.branchId !== current.branchId && parent.id !== owner.forkRevisionId) throw new StoryProjectionError("story-lineage-invalid");
      }
      id = current.parentRevisionId;
    }
    return reversed.reverse();
  }

  if (headRevisionId !== null) {
    const target = all.get(headRevisionId);
    if (target?.type !== "revision" || target.branchId !== branch.id && target.id !== branch.forkRevisionId) throw new StoryProjectionError("story-lineage-invalid");
  }
  const prefixIds = new Set(chain(branch.forkRevisionId).map(revision => revision.id));
  const selected = chain(headRevisionId ?? branch.forkRevisionId);
  if (!Array.isArray(acceptedEventIds) || new Set(acceptedEventIds).size !== acceptedEventIds.length) throw new StoryProjectionError("story-approval-invalid");
  const approved = new Set(acceptedEventIds);
  for (const id of approved) {
    const event = all.get(id);
    if (event?.type !== "event" || !compatible(event) || event.branchId !== branch.id && !prefixIds.has(event.revisionId)) throw new StoryProjectionError("story-approval-invalid");
    const source = all.get(event.revisionId);
    if (source?.type !== "revision" || source.completion !== "complete") throw new StoryProjectionError("story-source-incomplete");
  }
  if (selected.some(revision => revision.completion !== "complete")) throw new StoryProjectionError("story-source-incomplete");

  const eventsByRevision = new Map<string, StoryEvent[]>();
  for (const record of records) if (record.type === "event" && approved.has(record.id)) {
    const events = eventsByRevision.get(record.revisionId) ?? []; events.push(record); eventsByRevision.set(record.revisionId, events);
  }
  const ordered: StoryEvent[] = [];
  for (const revision of selected) {
    const events = (eventsByRevision.get(revision.id) ?? []).sort((a, b) => a.ordinal - b.ordinal);
    if (new Set(events.map(event => event.ordinal)).size !== events.length) throw new StoryProjectionError("story-order-conflict");
    ordered.push(...events);
  }
  const { snapshot, appliedEventIds } = replayStoryEvents((baseline as StoryBaseline).snapshot, ordered);
  return { headRevisionId, acceptedEventIds: [...approved].sort(), revisionIds: selected.map(revision => revision.id), appliedEventIds, snapshot };
}

/** Internal replay primitive. Caller supplies validated, approved, chronologically ordered events.
 * Also used to validate frozen request approvals without walking every historical prefix again.
 */
export function replayStoryEvents(initial: StorySnapshot, events: StoryEvent[]) {
  const snapshot = structuredClone(initial), appliedEventIds: string[] = [];
  for (const event of events) {
    for (const person of event.effects?.createdEntities ?? []) snapshot.names[person.id] = person.name;
    for (const change of event.changes) {
      const before = snapshot.states[change.entityId] ?? null;
      if (!sameStoryValue(before, change.before)) throw new StoryProjectionError("story-state-conflict", { eventId: event.id, entityId: change.entityId, path: "changes.before" });
    }
    if (event.sceneChange && !sameStoryValue({ presentIds: snapshot.presentIds, partnerIds: snapshot.partnerIds }, event.sceneChange.before)) throw new StoryProjectionError("story-scene-conflict", { eventId: event.id, path: "sceneChange.before" });
    for (const change of event.changes) {
      if (change.after === null) delete snapshot.states[change.entityId];
      else snapshot.states[change.entityId] = structuredClone(change.after);
    }
    if (event.sceneChange) { snapshot.presentIds = [...event.sceneChange.after.presentIds]; snapshot.partnerIds = [...event.sceneChange.after.partnerIds]; }
    appliedEventIds.push(event.id);
  }
  return { snapshot, appliedEventIds };
}
