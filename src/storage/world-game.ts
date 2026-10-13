import { createId } from "../core/id";
import { characterInChat } from "../core/characters";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { identityCanonical, type IdentitySeeds } from "../core/story-character-identity";
import { currentMergeSeeds } from "../core/story-character-merge";
import { currentStoryProfileEntities, storyProfileEntities, PROFILE_TEXT_FIELDS, type ProfileSeeds } from "../core/story-profile-view";
import { identityReferences } from "../core/story-identity-management";
import { profileValues } from "../core/character-profile";
import { sameStoryValue } from "../core/story-value";
import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryRecord } from "../core/story-records";
import { assertWorldGameWriter, validWorldGameActivation, type WorldGame, type WorldGameActivation } from "../core/world-game";
import type { ChatBinding, DataRecord, HandoffSnapshot, RecordKind, SceneEntity, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { planLegacyStory } from "./story-history";
import { boundStory } from "../core/story-continuation";
import { storyReplyProse, compactStoryFacts } from "../core/story-update";
import { automationReviews } from "../core/story-automation";
import { roleSeed, selectedRoleSeeds } from "../core/story-role-binding";
const stories = (all: DataRecord[]) => all.filter(r => r.kind === "story").map(r => r.data as StoryRecord);
const replace = (all: DataRecord[], changes: DataRecord[], removed: { kind: RecordKind; id: string }[] = []) => {
 const keys = new Set([...changes, ...removed].map(r => r.kind + ":" + r.id));
 return [...all.filter(r => !keys.has(r.kind + ":" + r.id)), ...changes];
};
/** Selected overlays become the next segment's seeds, without rewriting user lore. */
export function captureWorldGame(all: DataRecord[], world: WorldProfile, binding: ChatBinding, previous?: WorldGame): WorldGame {
 const stored = stories(all), raw = all.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === world.id && (r.data as SceneEntity).kind === "character" && characterInChat(r.data as SceneEntity, binding.chatId)).map(r => r.data as SceneEntity);
 const byId = new Map(raw.map(p => [p.id, p]));
 const baseline = stored.find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === binding.id && r.worldId === world.id);
 const branch = baseline && stored.find((r): r is StoryBranch => r.type === "branch" && r.id === baseline.branchId);
 const projection = branch && stored.find(r => r.type === "projection" && r.id === branch.projectionId);
 const played = projection?.type === "projection" ? projection.revisionIds.flatMap(id => { const r = stored.find(r => r.id === id); return r?.type === "revision" && r.completion === "complete" && r.storyPurpose !== "out-of-character" ? [{ role: r.role, text: storyReplyProse(r.content) }] : []; }) : [];
 const recentStory = branch?.gameManaged || baseline?.storySeeds ? boundStory([...(baseline?.storySeeds?.turns ?? []), ...played], "history", !!baseline?.storySeeds?.partial, baseline?.storySeeds?.omittedTurns ?? 0) : previous?.recentStory;
 const reviewState = automationReviews(stored, baseline, projection?.type === "projection" ? projection : undefined);
  const visible = branch?.gameManaged ? currentStoryProfileEntities(raw, stored, world.id, binding.chatId, binding.id) : baseline ? storyProfileEntities(raw, [], [], world.id, binding.chatId, baseline.profileSeeds, baseline.identitySeeds, baseline.mergeSeeds) : raw;
  const profileSeeds: ProfileSeeds = {}, identitySeeds: IdentitySeeds = {};
  const applied = projection?.type === "projection" ? projection.appliedEventIds.flatMap(id=>{const e=stored.find(r=>r.id===id);return e?.type==="event"&&e.memory?[e]:[];}) : [];
  const facts = compactStoryFacts([...(baseline?.factSeeds??[]),...applied.map(e=>e.memory!)]);
  const factRoleSeeds = selectedRoleSeeds(facts,[...(baseline?.factRoleSeeds??[]),...applied.flatMap(e=>e.memoryRoles?[roleSeed(e.memory!,e.memoryRoles)]:[])]);
  const sourceIndex = new Map(stored.map(r => [r.id, r]));
  const episodeSources = branch?.gameManaged && projection?.type === "projection"
    ? [...new Set([...(baseline?.episodeSourceSeeds ?? []), ...projection.revisionIds.filter(id => { const r = sourceIndex.get(id); return r?.type === "revision" && r.completion === "complete" && r.storyPurpose !== "out-of-character"; })])]
    : previous?.episodeSources;
 for (const p of visible) {
  const origin = byId.get(p.id)!;
  const borrowed = baseline ? identityReferences(baseline, stored, projection?.type === "projection" ? projection.appliedEventIds : []).filter(r => r.reference.entityId === p.id && sameStoryValue(r.canonical, identityCanonical(origin))).map(r => r.reference.alias) : [];
  const aliases = [...new Set([...borrowed, ...p.aliases.filter(n => !origin.aliases.includes(n))])];
  if (aliases.length) identitySeeds[p.id] = { canonical: identityCanonical(origin), aliases, disabledAliases: aliases.filter(n => !p.aliases.includes(n)) };
  if (!origin.characterSheet || !p.characterSheet) continue;
  const values = Object.fromEntries(PROFILE_TEXT_FIELDS.filter(k => p.characterSheet![k] !== origin.characterSheet![k]).map(k => [k, p.characterSheet![k]]));
  if (Object.keys(values).length) profileSeeds[p.id] = { canonical: profileValues(origin.characterSheet), versions: { ...origin.profileFieldRevisions }, values };
 }
  return { version: 1, id: previous?.id ?? createId("game"), revision: previous?.revision ?? createId("game-rev"), activationId: previous?.activationId ?? createId("game-activation"), activeChatId: binding.chatId, activeBindingId: binding.id,
   ...(episodeSources ? { episodeSources } : {}),
  ...((previous?.memoryBatchSources || world.storyMemoryBatch) ? { memoryBatchSources: [...new Set([...(baseline?.memoryBatchSeeds ?? previous?.memoryBatchSources?.filter(id => stored.find(r => r.id === id)?.branchId !== branch?.id) ?? []), ...(projection?.type === "projection" ? projection.revisionIds.filter(id => { const r = stored.find(r => r.id === id); return r?.type === "revision" && r.completion === "complete" && r.storyPurpose !== "out-of-character"; }) : [])])] } : {}),
  ...(reviewState.pending.length ? { pendingReviewIds: reviewState.pending } : {}), ...(Object.keys(reviewState.resolutions).length ? { reviewResolutions: reviewState.resolutions } : {}),
   managed: !!branch?.gameManaged || !!(previous?.managed && baseline && !baseline.origin.nativeAnchor), ...(binding.characterScenes?.[world.id] ? { scene: structuredClone(binding.characterScenes[world.id]) } : {}),
  memoryOverrides: structuredClone(binding.memoryOverrides ?? { includedIds: [], excludedIds: [] }), profileSeeds, identitySeeds, mergeSeeds: projection ? currentMergeSeeds(stored, world.id, binding.chatId, binding.id) : structuredClone(baseline?.mergeSeeds ?? {}), facts, ...(factRoleSeeds.length?{factRoleSeeds}:{}), ...(recentStory?.turns.length ? { recentStory, recentChatId: played.length ? binding.chatId : baseline?.storySourceChatId ?? previous?.recentChatId } : {}), ...(previous?.restartPending && !branch?.headRevisionId ? { restartPending: true as const } : {}), updatedAt: Date.now() };
}
export function planWorldGameActivation(initial: DataRecord[], input: WorldGameActivation) {
 if (!validWorldGameActivation(input) || !isSameDeepSeekChat(input.chatUrl, input.chatUrl, input.chatId)) throw Error("story-game-invalid");
 let all = structuredClone(initial);
 const world = all.find(r => r.kind === "world" && r.id === input.worldId)?.data as WorldProfile | undefined;
 let binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === input.chatId)?.data as ChatBinding | undefined;
 if (!world || !binding || binding.worldId !== world.id || !isSameDeepSeekChat(binding.chatUrl, input.chatUrl, input.chatId)) throw Error("story-binding-conflict");
 if ((world.sharedGame?.revision ?? null) !== input.expectedRevision) throw Error("story-game-stale");
 let game = world.sharedGame;
 if (!game) {
  const confirmed = all.filter(r => r.kind === "snapshot" && (r.data as HandoffSnapshot).worldId === world.id && (r.data as HandoffSnapshot).appliedAt !== undefined && (r.data as HandoffSnapshot).targetChatId).map(r => r.data as HandoffSnapshot).sort((a,b) => b.appliedAt! - a.appliedAt! || b.createdAt - a.createdAt)[0];
  const candidates = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).worldId === world.id).map(r => r.data as ChatBinding);
  const source = candidates.find(b => b.chatId === confirmed?.targetChatId) ?? candidates.filter(b => b.characterScenes?.[world.id]).sort((a,b) => b.characterScenes![world.id]!.updatedAt - a.characterScenes![world.id]!.updatedAt)[0] ?? binding;
  game = captureWorldGame(all, world, source);
  if (confirmed) {
   const origin = candidates.find(b => b.chatId === confirmed.sourceChatId);
   if (origin && !stories(all).some(r => r.type === "baseline" && r.origin.bindingId === source.id)) {
    const inherited = captureWorldGame(all, world, origin, game);
    game = { ...inherited, activeBindingId: source.id, activeChatId: source.chatId, scene: game.scene, memoryOverrides: game.memoryOverrides };
    for (const row of all) if (row.kind === "entity" && (row.data as SceneEntity).worldId === world.id && (row.data as SceneEntity).playthroughChatId === origin.chatId) (row.data as SceneEntity).sharedInWorld = true;
   }
   if (!candidates.some(b => b.chatId === confirmed.targetChatId)) game = { ...game, activeChatId: confirmed.targetChatId!, activeBindingId: "binding:" + confirmed.targetChatId, activationId: confirmed.id };
  }
 }
 if (input.mode !== "initialize" && game.activeBindingId !== binding.id) {
  for (const row of all) if (row.kind === "entity" && (row.data as SceneEntity).worldId === world.id && (row.data as SceneEntity).playthroughChatId === game.activeChatId) (row.data as SceneEntity).sharedInWorld = true;
   const played = binding.characterScenes?.[world.id];
   if (played && (Object.keys(played.states).length || played.presentIds.length) && !stories(all).some(r => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === world.id)) all = replace(all, planLegacyStory(all, { worldId: world.id, bindingId: binding.id }).records);
   const hadBaseline = stories(all).some(r => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === world.id);
  const oldId = binding.id;
  binding = { ...binding, ...(hadBaseline ? { id: createId("binding") } : {}), memoryOverrides: structuredClone(game.memoryOverrides), updatedAt: Date.now() };
   if (game.scene) { const scene = structuredClone(game.scene); delete scene.lastReply; delete scene.progress; binding.characterScenes = { ...binding.characterScenes, [world.id]: { ...scene, revision: hadBaseline ? createId("rev") : scene.revision, updatedAt: Date.now() } }; }
  else if (binding.characterScenes) { binding.characterScenes = { ...binding.characterScenes }; delete binding.characterScenes[world.id]; }
  all = replace(all, [{ kind: "binding", id: binding.id, data: binding }], oldId === binding.id ? [] : [{ kind: "binding", id: oldId }]);
  game = { ...game, activeChatId: binding.chatId, activeBindingId: binding.id, revision: createId("game-rev"), activationId: createId("game-activation"), updatedAt: Date.now() };
  if (game.managed) {
   // New native chat => new anchor, never replay its old transcript over current progress.
   const planned = planLegacyStory(all, { worldId: world.id, bindingId: binding.id }); all = replace(all, planned.records);
   const baseline = stories(all).find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === world.id)!;
   all = replace(all, [storyRow({ ...baseline, gameId: game.id, ...(game.episodeSources ? {episodeSourceSeeds:[...game.episodeSources]} : {}), ...(game.factRoleSeeds?{factRoleSeeds:structuredClone(game.factRoleSeeds)}:{}), ...(world.storyAutomation ? { gameId: game.id, pendingReviewSeeds: [...game.pendingReviewIds ?? []], reviewResolutionSeeds: { ...game.reviewResolutions } } : {}), profileSeeds: structuredClone(game.profileSeeds), identitySeeds: structuredClone(game.identitySeeds), mergeSeeds: structuredClone(game.mergeSeeds), factSeeds: structuredClone(game.facts), storySeeds: structuredClone(game.recentStory), memoryBatchSeeds: [...game.memoryBatchSources ?? []], storySourceChatId: game.recentChatId })]);
  }
 }
 if (game.managed && game.activeBindingId === binding.id && !stories(all).some(r => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === world.id)) {
  const planned = planLegacyStory(all, { worldId: world.id, bindingId: binding.id }); all = replace(all, planned.records);
  const baseline = stories(all).find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === world.id)!;
  all = replace(all, [storyRow({ ...baseline, gameId: game.id, ...(game.episodeSources ? {episodeSourceSeeds:[...game.episodeSources]} : {}), ...(game.factRoleSeeds?{factRoleSeeds:structuredClone(game.factRoleSeeds)}:{}), ...(world.storyAutomation ? { gameId: game.id, pendingReviewSeeds: [...game.pendingReviewIds ?? []], reviewResolutionSeeds: { ...game.reviewResolutions } } : {}), profileSeeds: structuredClone(game.profileSeeds), identitySeeds: structuredClone(game.identitySeeds), mergeSeeds: structuredClone(game.mergeSeeds), factSeeds: structuredClone(game.facts), storySeeds: structuredClone(game.recentStory), memoryBatchSeeds: [...game.memoryBatchSources ?? []], storySourceChatId: game.recentChatId })]);
 }
 all = replace(all, [{ kind: "world", id: world.id, data: { ...world, sharedGame: game } }]);
 assertStoryGraph(all);
 return { records: all.filter(r => !initial.some(o => o.kind === r.kind && o.id === r.id && sameStoryValue(o.data, r.data))), removed: initial.filter(r => !all.some(n => n.kind === r.kind && n.id === r.id)).map(r => ({ kind: r.kind, id: r.id })), result: structuredClone(game) };
}
export async function activateWorldGame(input: WorldGameActivation, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
 return repo.updateRecords(all => planWorldGameActivation(all, structuredClone(input)), current);
}
/** Explicit reset archives progress and source branches; no lore or portrait is deleted. */
export function resetWorldGame(initial: DataRecord[], chatId: string, worldId: string) {
 let all = structuredClone(initial);
 const world = all.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
 const source = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === chatId)?.data as ChatBinding | undefined;
 if (!world?.sharedGame || !source || source.worldId !== worldId) throw Error("story-binding-conflict");
 assertWorldGameWriter(all, source, worldId);
 if (!stories(all).some(r => r.type === "baseline" && r.origin.bindingId === source.id && r.worldId === worldId)) all = replace(all, planLegacyStory(all, { worldId, bindingId: source.id }).records);
 const scene = { revision: createId("rev"), states: {}, presentIds: [], updatedAt: Date.now() };
 const binding: ChatBinding = { ...source, id: createId("binding"), characterScenes: { ...source.characterScenes, [worldId]: scene }, nextStoryMessageMode: undefined, updatedAt: Date.now() };
 const game: WorldGame = { ...world.sharedGame, id: createId("game"), revision: createId("game-rev"), activationId: createId("game-activation"), activeBindingId: binding.id, activeChatId: chatId, scene, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts: [], episodeSources: [], factRoleSeeds: undefined, memoryBatchSources: [], pendingReviewIds: undefined, reviewResolutions: undefined, recentStory: undefined, recentChatId: undefined, managed: false, restartPending: true, updatedAt: Date.now() };
 return replace(all, [{ kind: "binding", id: binding.id, data: binding }, { kind: "world", id: world.id, data: { ...world, sharedGame: game, sharedGameArchives: [...world.sharedGameArchives ?? [], structuredClone(world.sharedGame)] } }], [{ kind: "binding", id: source.id }]);
}
/** Reversible reset, only before the new game receives any played/manual state. */
export function undoWorldGameReset(initial: DataRecord[], chatId: string, worldId: string) {
 let all = structuredClone(initial);
 const world = all.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
 const source = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === chatId)?.data as ChatBinding | undefined, saved = world?.sharedGameArchives?.at(-1);
 if (!world?.sharedGame || !source || !saved || source.worldId !== worldId) throw Error("story-binding-conflict");
 assertWorldGameWriter(all, source, worldId);
 if (!world.sharedGame.restartPending || Object.keys(world.sharedGame.scene?.states ?? {}).length || world.sharedGame.scene?.presentIds.length) throw Error("story-game-reset-changed");
 const scene = saved.scene ? { ...structuredClone(saved.scene), revision: createId("rev"), updatedAt: Date.now() } : undefined;
 if (scene) delete scene.lastReply;
 const binding: ChatBinding = { ...source, id: createId("binding"), memoryOverrides: structuredClone(saved.memoryOverrides), characterScenes: { ...source.characterScenes, ...(scene ? { [worldId]: scene } : {}) }, updatedAt: Date.now() };
 if (!scene && binding.characterScenes) delete binding.characterScenes[worldId];
 const game: WorldGame = { ...structuredClone(saved), activeChatId: chatId, activeBindingId: binding.id, revision: createId("game-rev"), activationId: createId("game-activation"), updatedAt: Date.now() };
 all = replace(all, [{ kind: "binding", id: binding.id, data: binding }, { kind: "world", id: world.id, data: { ...world, sharedGame: game, sharedGameArchives: world.sharedGameArchives!.slice(0,-1) } }], [{ kind: "binding", id: source.id }]);
 const planned = planLegacyStory(all, { worldId, bindingId: binding.id }); all = replace(all, planned.records);
 const baseline = stories(all).find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === binding.id && r.worldId === worldId)!;
 return replace(all, [storyRow({ ...baseline, gameId: game.id, ...(game.episodeSources ? {episodeSourceSeeds:[...game.episodeSources]} : {}), ...(game.factRoleSeeds?{factRoleSeeds:structuredClone(game.factRoleSeeds)}:{}), ...(world.storyAutomation ? { gameId: game.id, pendingReviewSeeds: [...game.pendingReviewIds ?? []], reviewResolutionSeeds: { ...game.reviewResolutions } } : {}), profileSeeds: game.profileSeeds, identitySeeds: game.identitySeeds, mergeSeeds: game.mergeSeeds, factSeeds: game.facts, storySeeds: game.recentStory, memoryBatchSeeds: [...game.memoryBatchSources ?? []], storySourceChatId: game.recentChatId })]);
}
/** Runs under the repository lock for every planner, including legacy writers.
 * Archived segments may receive transport receipts, never change the live game. */
export function sharedGameCommit(current: DataRecord[], changes: DataRecord[], removed: { kind: RecordKind; id: string }[]): DataRecord[] {
 let all = replace(current, changes, removed);
 const out = new Map(changes.map(r => [r.kind + ":" + r.id, r]));
 for (const row of all.filter(r => r.kind === "world")) {
  let world = row.data as WorldProfile, game = world.sharedGame;
  if (!game) continue;
  for (const changed of changes) {
   if (changed.kind === "binding") {
    const next = changed.data as ChatBinding, old = current.find(r => r.kind === "binding" && r.id === next.id)?.data as ChatBinding | undefined;
    if (next.worldId === world.id && old?.worldId === world.id && next.id !== game!.activeBindingId && old && (!sameStoryValue(next.characterScenes?.[world.id], old.characterScenes?.[world.id]) || !sameStoryValue(next.memoryOverrides, old.memoryOverrides))) throw Error("story-game-inactive");
   }
   if (changed.kind === "story" && ["projection", "branch"].includes((changed.data as StoryRecord).type)) {
    const s = changed.data as StoryRecord, baseline = stories(all).find((b): b is StoryBaseline => b.type === "baseline" && b.id === (s.type === "branch" || s.type === "projection" ? s.baselineId : ""));
    if (s.worldId === world.id && baseline && baseline.origin.bindingId !== game!.activeBindingId && ((s.type === "projection") || s.type === "branch" && s.gameManaged)) throw Error("story-game-inactive");
   }
  }
  const active = all.find(r => r.kind === "binding" && r.id === game!.activeBindingId && (r.data as ChatBinding).worldId === world.id)?.data as ChatBinding | undefined;
  if (!active) continue; // Canonical checkpoint survives detaching/deleting the native chat.
  const priorBinding = current.find(r => r.kind === "binding" && r.id === active.id)?.data as ChatBinding | undefined;
   const priorGame = (current.find(r => r.kind === "world" && r.id === world.id)?.data as WorldProfile | undefined)?.sharedGame;
   const affected = !priorGame || priorGame.activeBindingId !== game.activeBindingId || changes.some(r => r.kind === "binding" && r.id === active.id && (!priorBinding || !sameStoryValue((r.data as ChatBinding).characterScenes?.[world.id], priorBinding.characterScenes?.[world.id]) || !sameStoryValue((r.data as ChatBinding).memoryOverrides, priorBinding.memoryOverrides)) || r.kind === "entity" && (r.data as SceneEntity).worldId === world.id || r.kind === "story" && (r.data as StoryRecord).worldId === world.id);
  if (!affected) continue;
  for (const row of all) if (row.kind === "entity" && (row.data as SceneEntity).worldId === world.id && (row.data as SceneEntity).playthroughChatId === active.chatId && !(row.data as SceneEntity).sharedInWorld) {
   const next = { ...row, data: { ...row.data, sharedInWorld: true as const } }; out.set(row.kind + ":" + row.id, next); all = replace(all, [next]);
  }
  const captured = captureWorldGame(all, world, active, game), comparable = (g: WorldGame) => ({ ...g, revision: "", updatedAt: 0 });
  if (!sameStoryValue(comparable(game), comparable(captured))) { game = { ...captured, revision: createId("game-rev") }; world = { ...world, sharedGame: game }; out.set("world:" + world.id, { kind: "world", id: world.id, data: world }); }
 }
 return [...out.values()];
}
