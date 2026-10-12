import type { StoryRecord, StoryRevision } from "./story-records";

export interface StoryLineagePosition { start: number; end: number; complete: boolean; distinct: boolean }
/** One iterative pass over a validated forest. Request validation must not replay
 * every prefix separately when a long history contains thousands of receipts.
 */
export function indexStoryLineage(records: Iterable<StoryRecord>): Map<string, StoryLineagePosition> {
  const revisions: StoryRevision[] = [], children = new Map<string, StoryRevision[]>();
  for (const record of records) if (record.type === "revision") {
    revisions.push(record);
    const descendants = children.get(record.parentRevisionId ?? "") ?? []; descendants.push(record); children.set(record.parentRevisionId ?? "", descendants);
  }
  const positions = new Map<string, StoryLineagePosition>();
  const messages = new Set<string>(), nativeMessages = new Set<string>(); let cursor = 0;
  type Visit = { revision: StoryRevision; exit: boolean; complete: boolean; distinct: boolean; repeatedMessage?: boolean; repeatedNative?: boolean };
  const stack: Visit[] = (children.get("") ?? []).map(revision => ({ revision, exit: false, complete: true, distinct: true }));
  while (stack.length) {
    const visit = stack.pop()!, { revision } = visit, nativeKey = JSON.stringify([revision.role, revision.nativeMessageKey]);
    if (visit.exit) {
      positions.get(revision.id)!.end = cursor;
      if (!visit.repeatedMessage) messages.delete(revision.messageId);
      if (!visit.repeatedNative) nativeMessages.delete(nativeKey);
      continue;
    }
    if (positions.has(revision.id)) throw new Error("story-cycle");
    const repeatedMessage = messages.has(revision.messageId), repeatedNative = nativeMessages.has(nativeKey);
    const complete = visit.complete && revision.completion === "complete", distinct = visit.distinct && !repeatedMessage && !repeatedNative;
    positions.set(revision.id, { start: cursor++, end: -1, complete, distinct }); messages.add(revision.messageId); nativeMessages.add(nativeKey);
    stack.push({ revision, exit: true, complete, distinct, repeatedMessage, repeatedNative });
    for (const child of children.get(revision.id) ?? []) stack.push({ revision: child, exit: false, complete, distinct });
  }
  if (positions.size !== revisions.length) throw new Error("story-lineage-invalid");
  return positions;
}
