import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryRevision } from '../../src/core/story-records';
import { bindStoryRoles, captureRoleRoster, roleSeed, sourceRoleRoster } from '../../src/core/story-role-binding';
import { nativeStoryMessageKey } from '../../src/core/story-transport';
import { validStoryDispatchCapture, type StoryDispatchCapture } from '../../src/core/story-dispatch-capture';
import type { DataRecord } from '../../src/core/types';
import type { persistedLongWorld } from './story-persisted-long-audit';
import { captureStoryBaselineEffects } from '../../src/core/story-baseline-effects';

/** Synthetic historical lineage, validated by production import/graph guards.
 * The frozen source prose/gold is unchanged; roles are derived from that prose,
 * rather than assigning a speaker to an unattributed event in the test harness. */
export function withPersistedEvidence(f: ReturnType<typeof persistedLongWorld>) {
  const { base } = f, game = base.world.sharedGame!, historical = { ...base.binding, id: 'historical-binding', chatId: 'historical-chat', chatUrl: 'https://chat.deepseek.com/a/chat/s/historical-chat' };
  const scene = base.binding.characterScenes![base.world.id]!;
  const common = { format: 'deeprole-story' as const, contractVersion: 1 as const, worldId: base.world.id, playthroughId: 'historical-playthrough', branchId: 'historical-branch', createdAt: 20, updatedAt: 20 };
  const baseline: StoryBaseline = { ...common, id: 'historical-baseline', type: 'baseline', historyBeforeBaseline: 'unknown', legacyEntryScope: 'unclassified', gameId: game.id, origin: { bindingId: historical.id, chatId: historical.chatId, worldId: base.world.id, sceneRevision: scene.revision, nativeAnchor: { nativeMessageKey: null, role: null } }, snapshot: { presentIds: scene.presentIds, partnerIds: [], states: scene.states, names: Object.fromEntries(base.entities.map(p => [p.id, p.name])) } };
  const branch: StoryBranch = { ...common, id: common.branchId, type: 'branch', baselineId: baseline.id, parentBranchId: null, forkRevisionId: null, headRevisionId: null, selectionVersion: 0 };
  const records: DataRecord[] = [...base.records, { kind: 'binding', id: historical.id, data: historical }, storyRow(baseline), storyRow(branch)];
  const roster = captureRoleRoster(base.entities, base.world.id), sources: string[] = [], seeds: typeof f.seeds = [], factSources: string[] = [];
  let previous: StoryRevision | undefined;
  for (const [i, fact] of f.facts.entries()) {
    const captureId = `historical-capture-${i}`, draft = 'Continue.', context = 'Historical roster.', outgoing = context + '\n\n[User message]\n' + draft;
    const user: StoryRevision = { ...common, id: `historical-user-${i}`, type: 'revision', messageId: `historical-u-${i}`, nativeMessageKey: nativeStoryMessageKey(String(i * 2 + 1)), requestId: null, parentRevisionId: previous?.id ?? null, role: 'user', completion: 'complete', content: outgoing };
    const assistant: StoryRevision = { ...common, id: `historical-assistant-${i}`, type: 'revision', messageId: `historical-a-${i}`, nativeMessageKey: nativeStoryMessageKey(String(i * 2 + 2)), requestId: null, parentRevisionId: user.id, role: 'assistant', completion: 'complete', content: fact.quote, roleRoster: sourceRoleRoster(roster, base.world.id, fact.quote), roleRosterRequestId: captureId };
    const identity = { chatId: historical.chatId, nativeParentKey: previous?.nativeMessageKey ?? null };
    const capture: StoryDispatchCapture = { format: 'deeprole-story-dispatch', contractVersion: 1, id: captureId, worldId: base.world.id, bindingId: historical.id, identity, ownerTabId: 7, origin: 'local', purpose: 'user-turn', transport: 'xhr', sceneRevision: scene.revision, originalDraft: draft, proposedContext: context, injection: 'context', started: true, delivery: { status: 'accepted', httpStatus: 200 }, wire: { phase: 'closed', link: { requestId: captureId, ...identity, userMessageKey: user.nativeMessageKey, assistantMessageKey: assistant.nativeMessageKey }, sawFinish: true, issue: null }, roleRoster: roster, createdAt: 20, updatedAt: 20 };
    if (!validStoryDispatchCapture(capture)) throw Error('Invalid synthetic historical receipt');
    records.push(storyRow(user), storyRow(assistant), { kind: 'dispatch', id: capture.id, data: capture });
    sources.push(user.id, assistant.id); factSources.push(assistant.id);
    seeds.push(roleSeed(fact, bindStoryRoles(fact, assistant))); previous = assistant;
  }
  branch.headRevisionId = previous!.id;
  game.factRoleSeeds = seeds; game.episodeSources = sources;
  // Match a completed continuation activation: the new native chat inherits a
  // checkpoint containing facts AND their evidence, not just a loose world row.
  const currentBranch: StoryBranch = { ...common, playthroughId: 'current-playthrough', branchId: 'current-branch', id: 'current-branch', type: 'branch', baselineId: 'current-baseline', parentBranchId: null, forkRevisionId: null, headRevisionId: null, selectionVersion: 0 };
  const currentBaseline: StoryBaseline = { ...baseline, id: currentBranch.baselineId, branchId: currentBranch.id, playthroughId: currentBranch.playthroughId, origin: { bindingId: base.binding.id, chatId: base.binding.chatId, worldId: base.world.id, sceneRevision: scene.revision }, legacyEffects: captureStoryBaselineEffects(base.binding, base.world.id), factSeeds: structuredClone(game.facts), factRoleSeeds: structuredClone(seeds), episodeSourceSeeds: [...sources] };
  records.push(storyRow(currentBranch), storyRow(currentBaseline));
  base.records = records;
  assertStoryGraph(records);
  return { ...f, seeds, sources: factSources, episodeSources: sources };
}
