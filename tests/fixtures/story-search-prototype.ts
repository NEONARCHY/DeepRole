import { compileGameContext } from '../../src/core/game-context';
import { rankStoryFacts } from '../../src/core/story-fact-context';
import { storyRetrievalQuery } from '../../src/core/story-retrieval-query';
import { createStoryRoleReader } from '../../src/core/story-source-roles';
import { storedRoleReader } from '../../src/core/story-role-binding';
import { createEpisodeReader } from '../../src/core/story-episodes';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import { semanticQualityCorpus } from './story-semantic-quality';
import { semanticHoldoutCorpus } from './story-semantic-holdout';

export function prototypeScenarios() {
  return (['ru', 'en'] as const).flatMap(locale => [
    ...semanticQualityCorpus(locale).map(c => ({ ...c, split: 'development' })),
    ...semanticHoldoutCorpus(locale).map(c => ({ ...c, split: 'holdout' })),
  ]);
}

export type SearchScenario = Pick<ReturnType<typeof prototypeScenarios>[number], 'name' | 'input' | 'base' | 'facts' | 'sources' | 'seeds' | 'wanted'> & { family: string; intent: string; split: string };

export function prototypeCase(c: SearchScenario) {
    const scope = { worldId: c.base.world.id, entities: c.input.entities! }, roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
    const episodes = createEpisodeReader(c.seeds, c.sources), ranked = rankStoryFacts(c.facts, c.input.draft, scope, roles);
    // rankStoryFacts.index is a compacted-array position, not the original
    // source identity (a completed task removes its older open record).
    const original = new Map(c.facts.map((f, i) => [f.text, 'fact-' + i]));
    if (original.size !== c.facts.length) throw new Error('prototype fixture has duplicate fact texts');
    const current = ranked.filter(r => episodes.read(r.fact)), ids = new Map(current.map(r => [r.fact.text, original.get(r.fact.text)!]));
    const block = compileGameContext(c.input).text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
    const baseline = block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)).map(h => ids.get(h.text)!) : [];
    const retrieval = storyRetrievalQuery(c.input.draft, scope);
    return { id: c.name, split: c.split, family: c.family, intent: c.intent, query: retrieval.query,
      documents: current.map(r => ({ id: ids.get(r.fact.text)!, text: [r.fact.text, r.fact.task?.title ?? ''].filter(Boolean).join('\n'), source: episodes.read(r.fact)!.revisionId })),
      lexical: current.map(r => ids.get(r.fact.text)!), baseline, gold: c.wanted.map(f => ids.get(f.text)!), protected: !!roles.question || retrieval.ambiguousName };
}

export function prototypeCases() {
  return prototypeScenarios().map(prototypeCase);
}
