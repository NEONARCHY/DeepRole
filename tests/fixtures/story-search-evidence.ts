import { diverseScenarios as previousScenarios, diverseCase as previousCase, promptProbeReport } from './story-search-diverse';
import { auditSearchCorpus } from './story-search-audit';
import type { SearchScenario } from './story-search-prototype';
import { createStoryRoleReader } from '../../src/core/story-source-roles';
import { storedRoleReader } from '../../src/core/story-role-binding';

export const diverseScenarios = (): SearchScenario[] => [
  ...previousScenarios().map(c => ({ ...c, split: c.split === 'fresh' ? 'development' : c.split })),
  ...(['ru', 'en'] as const).flatMap(locale => auditSearchCorpus(locale).map(c => ({ ...c, split: 'fresh' }))),
];
export function diverseCase(c: SearchScenario) {
  const old = previousCase(c), scope = { worldId: c.base.world.id, entities: c.input.entities! };
  const roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
  const evidenceIds = old.baseline.filter(id => { const fact = c.facts[Number(id.slice(5))]!; return !!fact.task || !!fact.claim || !!Object.keys(roles.read(fact) ?? {}).length; });
  return { ...old, evidenceIds };
}
export { promptProbeReport };
