import { expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { rp05CrossplotScenarios } from './fixtures/story-rp05-crossplot';

const cases = (['ru', 'en'] as const).flatMap((locale) => rp05CrossplotScenarios(locale));
const audit: Array<{
  id: string;
  locale: string;
  control: boolean;
  wanted: string[];
  selected: string[];
  missing: string[];
  integrity: string[];
}> = [];

const decode = (text: string) => {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
};

for (const scenario of cases) it(`independent RP-05 crossplot ${scenario.locale}:${scenario.id}`, () => {
  const before = structuredClone(scenario.input);
  const output = compileGameContext(scenario.input);
  const selected = decode(output.text);
  const selectedIds: string[] = [];
  const integrity: string[] = [];

  for (const hint of selected) {
    const index = scenario.facts.findIndex((fact) => fact.text === hint.text);
    if (index < 0) {
      integrity.push('unknown-source');
      continue;
    }
    const fact = scenario.facts[index]!;
    const role = scenario.input.story!.roleSeeds!.find((seed) => seed.binding.quote === fact.quote)!;
    selectedIds.push(index === 0 ? 'action'
      : index === 1 ? 'promise'
        : index === 2 ? 'quote'
          : index === 3 ? 'recap'
            : index === 4 ? 'rumor'
              : 'repeated');
    if (hint.kind !== fact.kind || (hint.sourceQuote ?? hint.text) !== fact.quote) integrity.push(`source-or-kind:${index}`);
    if (JSON.stringify(hint.task ?? null) !== JSON.stringify(fact.task ?? null)) integrity.push(`task-status:${index}`);
    if (JSON.stringify(hint.sourceRoles ?? {}) !== JSON.stringify(role.binding.roles)) integrity.push(`attribution:${index}`);
    if (hint.episodeSource?.revisionId !== scenario.sources[index]) integrity.push(`source-id:${index}`);
  }

  const missing = scenario.wanted.filter((id) => !selectedIds.includes(id));
  audit.push({ id: scenario.id, locale: scenario.locale, control: scenario.control, wanted: scenario.wanted, selected: selectedIds, missing, integrity });
  expect(integrity).toEqual([]);
  expect(output.report.total).toBe(addedContextTokens(output.text));
  expect(output.report.total <= output.report.limit || output.report.required > output.report.limit).toBe(true);
  expect(scenario.input).toEqual(before);
});

it('preserves pre-registered crossplot retrieval expectations and source safety', () => {
  const scored = audit.filter((row) => !row.control);
  const controls = audit.filter((row) => row.control);
  const report = {
    scenarios: audit.length,
    scored: scored.length,
    complete: scored.filter((row) => row.missing.length === 0).length,
    wanted: scored.reduce((total, row) => total + row.wanted.length, 0),
    missing: scored.reduce((total, row) => total + row.missing.length, 0),
    controls: controls.length,
    rumorOnly: controls.filter((row) => row.selected.length > 0 && row.selected.every((id) => id === 'rumor')).length,
    eventLeak: controls.filter((row) => row.selected.some((id) => id === 'action' || id === 'promise' || id === 'repeated')).length,
    integrityIssues: audit.reduce((total, row) => total + row.integrity.length, 0),
  };
  console.info('RP05-independent-crossplot', JSON.stringify(report), JSON.stringify(audit.filter((row) => row.missing.length || row.integrity.length)));

  expect(report).toMatchObject({
    scenarios: 10,
    scored: 8,
    complete: 8,
    wanted: 10,
    missing: 0,
    controls: 2,
    rumorOnly: 2,
    eventLeak: 0,
    integrityIssues: 0,
  });
});
