import { expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { storyContentRelevance } from '../src/core/story-content-relevance';
import { RP05_INDEPENDENT_REPEAT_COUNT, rp05IndependentPlotScenarios } from './fixtures/story-rp05-independent-plot';

const cases = (['ru', 'en'] as const).flatMap((locale) => rp05IndependentPlotScenarios(locale));
const audit: Array<{
  id: string;
  locale: string;
  control: boolean;
  wanted: string[];
  selected: string[];
  extras: string[];
  extraCount: number;
  missing: string[];
  integrity: string[];
}> = [];

const decode = (text: string) => {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
};

const labelForIndex = (index: number): string => index === 0 ? 'initial'
  : index === 1 ? 'moved'
    : index === 2 ? 'promise'
      : index === 3 ? 'completed'
        : index === 4 ? 'disclosure'
          : index === 5 ? 'quote'
            : index === 6 ? 'recap'
              : index === 7 ? 'rumor'
                : index === 8 + RP05_INDEPENDENT_REPEAT_COUNT ? 'progress'
                  : 'repeated';

for (const scenario of cases) it(`independent RP-05 plot ${scenario.locale}:${scenario.id}`, () => {
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
    selectedIds.push(labelForIndex(index));
    if (hint.kind !== fact.kind || (hint.sourceQuote ?? hint.text) !== fact.quote) integrity.push(`source-or-kind:${index}`);
    if (JSON.stringify(hint.task ?? null) !== JSON.stringify(fact.task ?? null)) integrity.push(`task-status:${index}`);
    if (JSON.stringify(hint.sourceRoles ?? {}) !== JSON.stringify(role.binding.roles)) integrity.push(`attribution:${index}`);
    if (hint.episodeSource?.revisionId !== scenario.sources[index]) integrity.push(`source-id:${index}`);
  }

  if (scenario.control) {
    const ownerAdmission = storyContentRelevance(scenario.facts, scenario.input.draft, []).admission;
    const matched = ownerAdmission ? scenario.facts.filter(ownerAdmission.matches) : [];
    if (!ownerAdmission || matched.length !== 1 || matched[0]!.kind !== 'belief' || !ownerAdmission.covers(matched)) integrity.push('owner-question-admission');
  }

  const missing = scenario.wanted.filter((id) => !selectedIds.includes(id));
  const extras = [...new Set(selectedIds.filter((id) => !scenario.wanted.includes(id)))];
  audit.push({ id: scenario.id, locale: scenario.locale, control: scenario.control, wanted: scenario.wanted, selected: selectedIds, extras, extraCount: selectedIds.filter((id) => !scenario.wanted.includes(id)).length, missing, integrity });
  expect(integrity).toEqual([]);
  expect(output.report.total).toBe(addedContextTokens(output.text));
  expect(output.report.total <= output.report.limit || output.report.required > output.report.limit).toBe(true);
  expect(scenario.input).toEqual(before);
});

it('keeps required plot facts available after a long recap tail without hiding useful extras', () => {
  const scored = audit.filter((row) => !row.control);
  const controls = audit.filter((row) => row.control);
  const report = {
    scenarios: audit.length,
    scored: scored.length,
    complete: scored.filter((row) => row.missing.length === 0).length,
    wanted: scored.reduce((total, row) => total + row.wanted.length, 0),
    missing: scored.reduce((total, row) => total + row.missing.length, 0),
    compoundLocations: audit.filter((row) => row.id === 'compound-first-and-later-location' && row.selected.includes('initial') && row.selected.includes('moved')).length,
    openPromiseAndProgress: audit.filter((row) => row.wanted.includes('progress') && row.selected.includes('promise') && row.selected.includes('progress')).length,
    completedAndOpenDistinct: audit.filter((row) => row.wanted.includes('completed') && row.selected.includes('completed') && row.selected.includes('promise')).length,
    repeatedTopics: audit.filter((row) => row.wanted.includes('repeated') && row.selected.includes('repeated')).length,
    controls: controls.length,
    rumorRetrieved: controls.filter((row) => row.selected.includes('rumor')).length,
    ownerQuestionExtraRecords: controls.reduce((total, row) => total + row.extraCount, 0),
    extraRecords: audit.reduce((total, row) => total + row.extraCount, 0),
    integrityIssues: audit.reduce((total, row) => total + row.integrity.length, 0),
  };
  console.info('RP05-independent-plot-audit', JSON.stringify(report), JSON.stringify(audit.filter((row) => row.missing.length || row.integrity.length).map((row) => ({ id: row.id, locale: row.locale, missing: row.missing, integrity: row.integrity }))));
  expect(report).toMatchObject({
    scenarios: 24,
    scored: 20,
    complete: 20,
    missing: 0,
    compoundLocations: 2,
    openPromiseAndProgress: 6,
    completedAndOpenDistinct: 2,
    repeatedTopics: 2,
    controls: 4,
    rumorRetrieved: 4,
    integrityIssues: 0,
  });
});
