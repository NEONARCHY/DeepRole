import type { DiscussionScenario, discussionCase } from './story-discussion-priority';
import { discussionPriorityFacts, isExplicitDiscussionRepeat } from '../../src/core/story-discussion-priority';
import { storyContentRelevance } from '../../src/core/story-content-relevance';
import { createStoryRoleReader } from '../../src/core/story-source-roles';
import { storedRoleReader } from '../../src/core/story-role-binding';
import { createEpisodeReader } from '../../src/core/story-episodes';
import { storyRetrievalQuery } from '../../src/core/story-retrieval-query';
import { storyFactIdentity } from '../../src/core/story-memory-lifecycle';
import { rankStoryFacts, formatStoryFacts } from '../../src/core/story-fact-context';
import { addedContextTokens } from '../../src/core/game-context';
import { createStoryTimeReader } from '../../src/core/story-time';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import { priorDiscussionContext } from './story-discussion-priority';
type Case = ReturnType<typeof discussionCase>;

export function priorityCase(c: DiscussionScenario, base: Case) {
  const scope = { worldId: c.base.world.id, entities: c.input.entities! }, roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
  const episodes = createEpisodeReader(c.seeds, c.input.story!.episodeSources), facts = rankStoryFacts(c.input.story!.facts, c.input.draft, scope, roles).map(r => r.fact);
  const admission = storyContentRelevance(facts, c.input.draft, storyRetrievalQuery(c.input.draft, scope).relevanceNames).admission;
  const ids = new Map(c.facts.map((f, i) => [storyFactIdentity(f), 'fact-' + i])), byId = new Map(facts.map(f => [ids.get(storyFactIdentity(f))!, f]));
  const group = !base.protected ? discussionPriorityFacts(facts, c.input.draft, admission, roles, episodes) : undefined;
  const substantiveBaseline = base.baseline.filter(id => !group?.repeats.has(byId.get(id)!));
  const desired = group ? [...new Set([...group.primary.map(f => ids.get(storyFactIdentity(f))!), ...substantiveBaseline])] : [];
  const accepted = !!group && desired.length <= 8;
  return { candidate: accepted ? desired : base.baseline, substantiveBaseline, roles, episodes, facts, byId,
    repeated: facts.filter(f => isExplicitDiscussionRepeat(f, roles, episodes)).map(f => ids.get(storyFactIdentity(f))!),
    reason: accepted ? 'whole-topic-plus-prior-substance' : 'exact-prior-selection' };
}

export function priorityReport(scenarios: DiscussionScenario[], cases: Case[]) {
  const probes: { id: string; split: string; budget: number; accepted: boolean; complete: boolean; substantiveLoss: string[]; reason: string }[] = [];
  const rows = scenarios.map((c, i) => {
    const base = cases[i]!, p = priorityCase(c, base);
    for (const budget of [900, 1500, 2300, 4000, 6000]) {
      const input = structuredClone(c.input); input.settings.contextBudget = budget;
      const prior = priorDiscussionContext(input), block = prior.text.match(/<deeprole_story_memory>[\s\S]*?<\/deeprole_story_memory>/u)?.[0];
      const original = block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [], ids = new Map(c.facts.map((f, i) => [f.text, 'fact-' + i]));
      const mandatory = original.map(h => ids.get(h.text)!).filter(id => !isExplicitDiscussionRepeat(p.byId.get(id)!, p.roles, p.episodes));
      const time = createStoryTimeReader(c.input.story!.facts, p.episodes), render = (memory: string) => block ? prior.text.replace(block, () => memory) : [prior.text, memory].filter(Boolean).join('\n\n');
      const memory = formatStoryFacts(p.candidate.map(id => p.byId.get(id)!), true, true, p.roles, p.episodes, time, { measure: b => addedContextTokens(render(b)) });
      const proposed = render(memory), accepted = p.reason !== 'exact-prior-selection' && prior.report.required <= budget && addedContextTokens(proposed) <= budget && mandatory.every(id => p.candidate.includes(id));
      const selected = accepted ? p.candidate : original.map(h => ids.get(h.text)!);
      const substantiveLoss = mandatory.filter(id => !selected.includes(id));
      if (substantiveLoss.length) throw new Error('RP270 lost substantive current-budget evidence');
      probes.push({ id: c.name, split: c.split, budget, accepted, complete: !!base.gold.length && base.gold.every(id => selected.includes(id)), substantiveLoss,
        reason: accepted ? 'whole-candidate-context-fits' : 'exact-prior-context' });
    }
    return { id: c.name, split: c.split, family: c.family, gold: base.gold, baseline: base.baseline, lexical: base.lexical.slice(0, 8), candidate: p.candidate,
      substantiveBaseline: p.substantiveBaseline, repeated: p.repeated, reason: p.reason,
      controlDrift: !base.gold.length && JSON.stringify(base.baseline) !== JSON.stringify(p.candidate),
      substantiveLoss: p.substantiveBaseline.filter(id => !p.candidate.includes(id)), lostLexicalGold: base.gold.filter(id => base.lexical.slice(0, 8).includes(id) && !p.candidate.includes(id)) };
  });
  const groups = ['development', 'holdout'].map(split => {
    const r = rows.filter(r => r.split === split), positive = r.filter(r => r.gold.length);
    return { split, cases: r.length, positive: positive.length, baselineComplete: positive.filter(r => r.gold.every(id => r.baseline.includes(id))).length,
      candidateComplete: positive.filter(r => r.gold.every(id => r.candidate.includes(id))).length,
      wrongFirstBefore: positive.filter(r => !r.gold.includes(r.lexical[0]!)).length, wrongFirstAfter: positive.filter(r => !r.gold.includes(r.candidate[0]!)).length,
      controlDrift: r.filter(r => r.controlDrift).length, substantiveLoss: r.reduce((n, r) => n + r.substantiveLoss.length, 0), lostLexicalGold: r.reduce((n, r) => n + r.lostLexicalGold.length, 0) };
  });
  return { scope: 'Read-only whole-source priority experiment before runtime integration; unrelated-template queries deliberately retained. No native send or canon write.', rows, probes, groups,
    budgets: [900, 1500, 2300, 4000, 6000].map(budget => { const p = probes.filter(p => p.budget === budget); return { budget, cases: p.length, accepted: p.filter(p => p.accepted).length, complete: p.filter(p => p.complete).length, substantiveLoss: p.reduce((n, r) => n + r.substantiveLoss.length, 0) }; }) };
}
