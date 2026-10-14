import { prototypeScenarios, prototypeCase } from './story-search-prototype';
import type { SearchScenario } from './story-search-prototype';
import { freshSearchCorpus } from './story-search-fresh';
import { storyContentRelevance } from '../../src/core/story-content-relevance';
import { storyRetrievalQuery } from '../../src/core/story-retrieval-query';
import { rankStoryFacts, formatStoryFacts } from '../../src/core/story-fact-context';
import { createStoryRoleReader } from '../../src/core/story-source-roles';
import { storedRoleReader } from '../../src/core/story-role-binding';
import { createEpisodeReader } from '../../src/core/story-episodes';
import { createStoryTimeReader } from '../../src/core/story-time';
import { addedContextTokens, compileGameContext } from '../../src/core/game-context';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';

export function diverseScenarios(): SearchScenario[] {
  return [...prototypeScenarios().map(c => ({ ...c, split: 'seen' })), ...(['ru', 'en'] as const).flatMap(locale => freshSearchCorpus(locale).map(c => ({ ...c, split: 'fresh' })))];
}

export function diverseCase(c: SearchScenario) {
  const basic = prototypeCase(c), scope = { worldId: c.base.world.id, entities: c.input.entities! };
  const roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
  const retrieval = storyRetrievalQuery(c.input.draft, scope), ranked = rankStoryFacts(c.facts, c.input.draft, scope, roles);
  const admission = storyContentRelevance(ranked.map(r => r.fact), c.input.draft, retrieval.relevanceNames).admission;
  const selected = ranked.filter(r => basic.baseline.includes('fact-' + c.facts.findIndex(f => f.text === r.fact.text))).map(r => r.fact);
  const covered = !!admission?.covers(selected);
  return { ...basic, preserve: basic.protected || covered, protectionReason: [basic.protected ? 'owner-or-ambiguous-identity' : '', covered ? 'covered-topic-admission' : ''].filter(Boolean) };
}

export const diverseCases = () => diverseScenarios().map(diverseCase);

/** Experimental admission probe, not a second allocator or production hook.
 * Keep every non-story section and guard from the actual compiler. Replace the
 * whole story block iff every verified selected record fits the complete prompt.
 * Failure returns the exact current output, never a clipped semantic subset. */
export function probeCandidatePrompt(scenario: SearchScenario, candidates: string[], budget = scenario.input.settings.contextBudget) {
  const input = structuredClone(scenario.input); input.settings.contextBudget = budget;
  const base = compileGameContext(input), scope = { worldId: scenario.base.world.id, entities: input.entities! };
  const roles = createStoryRoleReader(scope, input.draft, storedRoleReader(scenario.seeds, scope.entities, scope.worldId));
  const episodes = createEpisodeReader(scenario.seeds, scenario.sources), time = createStoryTimeReader(input.story!.facts, episodes);
  const ranked = rankStoryFacts(input.story!.facts, input.draft, scope, roles), current = new Map(ranked.filter(r => episodes.read(r.fact)).map(r => ['fact-' + scenario.facts.findIndex(f => f.text === r.fact.text), r.fact]));
  const originalBlock = base.text.match(/<deeprole_story_memory>[\s\S]*?<\/deeprole_story_memory>/u)?.[0];
  const originalIds = originalBlock ? decodeStoryMemory(JSON.parse(originalBlock.split('\n')[1]!)).map(h => 'fact-' + scenario.facts.findIndex(f => f.text === h.text)) : [];
  const currentMandatoryIds = originalIds.filter(id => { const fact = current.get(id); return fact && (!!fact.task || !!fact.claim || !!Object.keys(roles.read(fact) ?? {}).length); });
  const fallback = (reason: string) => ({ accepted: false, reason, text: base.text, originalText: base.text, total: base.report.total, limit: base.report.limit, required: base.report.required, selected: originalIds, currentMandatoryIds, baseReport: base.report });
  if (!candidates.length || candidates.length > 8 || new Set(candidates).size !== candidates.length || candidates.some(id => !current.has(id))) return fallback('invalid-or-unproved-current-source');
  if (base.report.required > base.report.limit) return fallback('required-overflow');
  const render = (block: string) => originalBlock ? base.text.replace(originalBlock, () => block) : [base.text, block].filter(Boolean).join('\n\n');
  const block = formatStoryFacts(candidates.map(id => current.get(id)!), true, true, roles, episodes, time, { measure: b => addedContextTokens(render(b)) });
  const text = render(block), total = addedContextTokens(text);
  if (total > base.report.limit) return fallback('whole-budget-fallback');
  return { accepted: true, reason: 'whole-candidate-block-fits', text, originalText: base.text, total, limit: base.report.limit, required: base.report.required, selected: [...candidates], currentMandatoryIds, baseReport: base.report };
}

export function promptProbeReport(scenarios: SearchScenario[], rows: { id: string; selected: { diverse: string[] } }[], budgets: number[]) {
  const byId = new Map(scenarios.map(s => [s.name, s])), cache = new Map<string, ReturnType<typeof probeCandidatePrompt>>();
  const measure = (id: string, ids: string[], budget: number) => {
    const c = byId.get(id)!, key = id + ':' + budget;
    if (!cache.has(key)) cache.set(key, probeCandidatePrompt(c, ids, budget));
    const p = cache.get(key)!, gold = c.wanted.map(f => 'fact-' + c.facts.findIndex(v => v.text === f.text));
    if (!p.accepted && p.text !== p.originalText) throw new Error('Prototype fallback changed the compiler output');
    if (p.accepted && (p.total > p.limit || p.selected.length > 8 || JSON.stringify(p.selected) !== JSON.stringify(ids))) throw new Error('Prototype admission contract failed');
    return { id, split: c.split, goldCount: gold.length, budget, accepted: p.accepted, reason: p.reason, total: p.total, required: p.required,
      complete: !!gold.length && gold.every(g => p.selected.includes(g)), selected: p.selected };
  };
  const defaults = rows.map(r => measure(r.id, r.selected.diverse, byId.get(r.id)!.input.settings.contextBudget));
  const sweep = rows.filter(r => byId.get(r.id)!.split === 'fresh').flatMap(r => budgets.map(b => measure(r.id, r.selected.diverse, b)));
  return { scope: 'Whole-block replacement probe in the actual existing full prompt. Other sections/guards are retained; no second allocator, production hook, truncated subset or live send.',
    defaults, sweep, budgetGroups: budgets.map(b => { const g = sweep.filter(r => r.budget === b); return { budget: b, cases: g.length, accepted: g.filter(r => r.accepted).length, exactFallback: g.filter(r => !r.accepted).length, positive: g.filter(r => r.goldCount).length, complete: g.filter(r => r.complete).length }; }) };
}
