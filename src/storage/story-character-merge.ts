import { validMergeRead, validMergeApproval, validMergeUndo, storyMerges, type MergeRead, type MergeApproval, type MergeUndo, type MergePage, type MergePerson } from "../core/story-character-merge";
import { storyRow, type StoryEvent, type StoryRecord } from "../core/story-records";
import { EMPTY_STATUS } from "../core/characters";
import { identityName, identityOwners } from "../core/story-character-identity";
import { storyProfileEntities } from "../core/story-profile-view";
import { sameStoryValue } from "../core/story-value";
import type { DataRecord, SceneEntity, CharacterStatus } from "../core/types";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { storyEffectsAt } from "./story-effect-replay";
import { planStorySelection } from "./story-selection";
import { repository, type DeepRoleRepository } from "./repository";

function scope(all: DataRecord[], input: { worldId: string; chatId: string }, readonly = false) {
 const f = scopedDiscovery(all, input, readonly);
 const people = storyProfileEntities(f.rawPeople, f.stored, f.projection.appliedEventIds, input.worldId, input.chatId, f.baseline.profileSeeds, f.baseline.identitySeeds, f.baseline.mergeSeeds);
 return { ...f, people };
}
const status = (f: ReturnType<typeof scope>, p: SceneEntity) => structuredClone(f.projection.snapshot.states[p.id] ?? p.characterSheet?.initialStatus ?? EMPTY_STATUS);
const person = (f: ReturnType<typeof scope>, p: SceneEntity): MergePerson => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, profile: Object.fromEntries(["appearance", "personality", "goals", "background"].map(k => [k, p.characterSheet?.[k as "appearance"] ?? ""])) as MergePerson["profile"], state: status(f, p), protagonist: !!p.characterSheet?.protagonist, images: !!Object.keys(p.characterSheet?.sprites ?? {}).length || !!p.characterSheet?.imageGeneration, aliases: [...p.aliases] });
function page(all: DataRecord[], input: MergeRead): MergePage {
 const f = scope(all, input, true), query = identityName(input.query);
 const list = f.people.filter(p => p.characterSheet && (!query || [p.name, ...p.aliases].some(n => identityName(n).includes(query))));
 const offset = Math.min(input.offset, Math.max(0, Math.ceil(list.length / 40) - 1) * 40);
 const a = input.pair && f.people.find(p => p.id === input.pair![0]), b = input.pair && f.people.find(p => p.id === input.pair![1]);
 if (input.pair && (!a?.characterSheet || !b?.characterSheet)) throw Error("story-review-stale");
 return { ...input, offset, guard: f.guard, paused: Object.hasOwn(f.branch, "pausedAtRevisionId"), people: list.slice(offset, offset + 40).map(p => ({ id: p.id, name: p.name, summary: (p.description || p.characterSheet?.background || "").slice(0, 240) })), total: list.length, next: offset + 40 < list.length ? offset + 40 : null,
  preview: a && b ? { a: person(f, a), b: person(f, b), incomingConflicts: Object.values(f.projection.snapshot.states).filter(s => s.bonds?.[a.id] && s.bonds?.[b.id] && !sameStoryValue(s.bonds[a.id], s.bonds[b.id])).length } : null,
  merges: storyMerges(f.stored, f.projection.appliedEventIds, f.baseline.mergeSeeds).map(m => ({ id: m.id, name: f.rawPeople.find(p => p.id === m.merge.mergedId)?.name ?? m.merge.canonical.name, sources: m.merge.sourceIds.map(id => f.rawPeople.find(p => p.id === id)?.name ?? id), inherited: m.inherited, dropsLaterScenes: !m.inherited && m.revisionId !== (f.branch.headRevisionId ?? f.baseline.id) }))
 };
}
export async function readStoryMerge(input: MergeRead, repo: DeepRoleRepository = repository) {
 input = structuredClone(input); if (!validMergeRead(input)) throw Error("story-review-invalid");
 return repo.updateRecords(all => ({ records: [], removed: [], result: page(all, input) }));
}
export async function approveStoryMerge(input: MergeApproval, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
 input = structuredClone(input); if (!validMergeApproval(input)) throw Error("story-review-invalid");
 await repo.updateRecords(all => {
  const f = scope(all, input); discoveryGuard(f.guard, input.guard);
  const [a, b] = input.pair!.map(id => f.people.find(p => p.id === id));
  if (!a?.characterSheet || !b?.characterSheet || a.updatedAt !== input.versions[0] || b.updatedAt !== input.versions[1]) throw Error("story-review-stale");
  if ([input.choices.name, ...input.choices.aliases].some(n => identityOwners(f.people, n).some(p => p.id !== a.id && p.id !== b.id))) throw Error("identity-ambiguous");
  if (input.choices.protagonist && f.people.some(p => p.id !== a.id && p.id !== b.id && p.characterSheet?.protagonist)) throw Error("merge-protagonist-conflict");
  const profile = input.choices.profile === "a" ? a : b, selectedState = input.choices.state === "a" ? a : b;
  // Different schemas cannot share numeric values safely. Choose the same source.
  if (profile.id !== selectedState.id && (!sameStoryValue(profile.characterSheet?.attributes, selectedState.characterSheet?.attributes) || !sameStoryValue(profile.characterSheet?.relationships, selectedState.characterSheet?.relationships))) throw Error("merge-state-incompatible");
  const now = Date.now(), mergedId = crypto.randomUUID(), sheet = structuredClone(profile.characterSheet!);
  sheet.protagonist = input.choices.protagonist;
  const aliases = [...new Map(input.choices.aliases.filter(n => identityName(n) !== identityName(input.choices.name)).map(n => [identityName(n), n])).values()];
  const merged: SceneEntity = { ...structuredClone(profile), id: mergedId, name: input.choices.name, aliases, memberIds: [], playthroughChatId: input.chatId, characterSheet: sheet, createdAt: now, updatedAt: now };
  const chosen = status(f, selectedState), states = f.projection.snapshot.states, changes: StoryEvent["changes"] = [];
  if (chosen.bonds) { delete chosen.bonds[a.id]; delete chosen.bonds[b.id]; delete chosen.bonds[mergedId]; }
  changes.push({ entityId: mergedId, before: null, after: chosen });
  for (const [id, before] of Object.entries(states)) {
   if (id === a.id || id === b.id || !before.bonds || !before.bonds[a.id] && !before.bonds[b.id]) continue;
   const after: CharacterStatus = structuredClone(before), preferred = input.choices.incoming === "a" ? a.id : b.id;
   const bond = before.bonds[preferred] ?? before.bonds[preferred === a.id ? b.id : a.id];
   delete after.bonds![a.id]; delete after.bonds![b.id]; after.bonds![mergedId] = structuredClone(bond!);
   changes.push({ entityId: id, before: structuredClone(before), after });
  }
  const mapIds = (ids: string[]) => [...new Set(ids.map(id => id === a.id || id === b.id ? mergedId : id))];
  const before = { presentIds: [...f.projection.snapshot.presentIds], partnerIds: [...f.projection.snapshot.partnerIds] };
  const after = { presentIds: mapIds(before.presentIds), partnerIds: mapIds(before.partnerIds).filter(id => !sheet.protagonist || id !== mergedId) };
  const effects = storyEffectsAt(f.stored, f.baseline, f.projection.appliedEventIds).value, revisionId = f.branch.headRevisionId ?? f.baseline.id;
  const event: StoryEvent = { format: "deeprole-story", contractVersion: 1, type: "event", id: crypto.randomUUID(), worldId: input.worldId, playthroughId: f.baseline.playthroughId, branchId: f.branch.id, createdAt: now, updatedAt: now, revisionId, ordinal: Math.max(-1, ...f.stored.flatMap(e => e.type === "event" && e.revisionId === revisionId ? [e.ordinal] : [])) + 1, disposition: "candidate", label: "Character merge", quote: input.choices.name, participantIds: [...new Set([a.id, b.id, mergedId, ...changes.map(c => c.entityId), ...before.presentIds, ...after.presentIds])], changes, sceneChange: { before, after }, effects: { before: structuredClone(effects), after: structuredClone(effects), createdEntities: [merged], createdPhotos: [] }, characterMerge: { sourceIds: [a.id, b.id], mergedId, canonical: { name: merged.name, aliases: [...merged.aliases] } } };
  const selected = planStorySelection([...all, storyRow(event)], f.branch.id, { headRevisionId: f.branch.headRevisionId, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: [...f.projection.acceptedEventIds, event.id] });
  return { records: [storyRow(event), ...selected.records], removed: selected.removed, result: undefined };
 }, current);
 return readStoryMerge({ worldId: input.worldId, chatId: input.chatId, query: "", offset: 0, pair: null }, repo);
}
export async function undoStoryMerge(input: MergeUndo, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
 input = structuredClone(input); if (!validMergeUndo(input)) throw Error("story-review-invalid");
 await repo.updateRecords(all => {
  const f = scope(all, input); discoveryGuard(f.guard, input.guard);
  const event = f.stored.find((e): e is StoryEvent => e.type === "event" && e.id === input.eventId && !!e.characterMerge);
  if (!event || !f.projection.appliedEventIds.includes(event.id)) throw Error("story-review-stale");
  const head = event.revisionId === f.baseline.id ? null : event.revisionId;
  const accepted = f.projection.acceptedEventIds.filter(id => { const e = f.stored.find(r => r.id === id); return id !== event.id && !(e?.type === "event" && e.revisionId === event.revisionId && e.ordinal > event.ordinal); });
  const selected = planStorySelection(all, f.branch.id, { headRevisionId: head, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: accepted });
  if (head !== f.branch.headRevisionId) selected.records = selected.records.map(r => { const data = r.data as StoryRecord; return r.kind === "story" && data.type === "branch" ? storyRow({ ...data, pausedAtRevisionId: head }) : r; });
  return { records: selected.records, removed: selected.removed, result: undefined };
 }, current);
 return readStoryMerge({ worldId: input.worldId, chatId: input.chatId, query: input.query, offset: input.offset, pair: null }, repo);
}
