/** Read old v1 files without touching names, image keys, story text or timestamps.
 * New writes use action fields. Invalid new fields never fall back to old ones. */
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function rename(value: unknown, current: string, legacy: string): unknown {
  if (!object(value) || !Object.hasOwn(value, legacy)) return value;
  const next = { ...value };
  if (!Object.hasOwn(next, current)) next[current] = next[legacy];
  delete next[legacy];
  return next;
}
export const normalizeActionSettings = (value: unknown) => rename(value, "characterActions", "characterEmotions");
export const normalizeActionStatus = (value: unknown) => rename(value, "action", "emotion");
export function normalizeActionSheet(value: unknown): unknown {
  const next = rename(value, "blockedActions", "blockedEmotions");
  if (!object(next) || next.initialStatus === undefined) return next;
  const initialStatus = normalizeActionStatus(next.initialStatus);
  return initialStatus === next.initialStatus ? next : { ...next, initialStatus };
}
function scene(value: unknown): unknown {
  if (!object(value) || !object(value.states)) return value;
  const entries = Object.entries(value.states).map(([id, state]) => [id, normalizeActionStatus(state)] as const);
  return entries.every(([id, state]) => state === (value.states as Record<string, unknown>)[id]) ? value : { ...value, states: Object.fromEntries(entries) };
}
export function normalizeActionRecordData(kind: string, data: unknown): unknown {
  if (!object(data)) return data;
  if (kind === "world") return normalizeActionSettings(data);
  if (kind === "entity") {
    const characterSheet = normalizeActionSheet(data.characterSheet);
    return characterSheet === data.characterSheet ? data : { ...data, characterSheet };
  }
  if (kind === "binding" && object(data.characterScenes)) {
    const entries = Object.entries(data.characterScenes).map(([id, value]) => [id, scene(value)] as const);
    return entries.every(([id, value]) => value === (data.characterScenes as Record<string, unknown>)[id]) ? data : { ...data, characterScenes: Object.fromEntries(entries) };
  }
  if (kind === "snapshot") {
    const characterScene = scene(data.characterScene);
    return characterScene === data.characterScene ? data : { ...data, characterScene };
  }
  if (kind === "cast" && object(data.draft) && Array.isArray(data.draft.characters)) {
    const characters = data.draft.characters.map(member => object(member) ? { ...member, state: normalizeActionStatus(member.state), sheet: normalizeActionSheet(member.sheet) } : member);
    return { ...data, draft: { ...data.draft, characters } };
  }
  return data;
}
export function normalizeActionRecord<T>(record: T): T {
  if (!object(record) || typeof record.kind !== "string") return record;
  const data = normalizeActionRecordData(record.kind, record.data);
  return (data === record.data ? record : { ...record, data }) as T;
}
