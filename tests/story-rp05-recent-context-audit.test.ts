import { expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { storyFactHint } from '../src/core/story-fact-context';
import { createEpisodeReader } from '../src/core/story-episodes';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { createStoryTimeReader } from '../src/core/story-time';
import { RECENT_CONTEXT_VARIANTS, recentPlotFactLabel, rp05RecentContextScenarios } from './fixtures/story-rp05-recent-context';

const cases = (['ru', 'en'] as const).flatMap(rp05RecentContextScenarios);
const audit: Array<{
  id: string; locale: string; variant: string; control: boolean;
  selected: string[]; selectedIndices: number[]; wanted: string[]; missing: string[]; support: number;
  spillover: number; duplicateTopicRows: number; totalTokens: number; priorTokens: number;
}> = [];

for (const scenario of cases) it(`RP319 recent context ${scenario.locale}:${scenario.id}:${scenario.variant}`, () => {
  const before = structuredClone(scenario.input);
  const output = compileGameContext(scenario.input);
  const prior = compileGameContext(scenario.input, { memoryPrefixes: false });
  const block = output.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  const selected = block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
  const priorBlock = prior.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  const priorSelected = priorBlock ? decodeStoryMemory(JSON.parse(priorBlock.split('\n')[1]!)) : [];
  expect(selected).toEqual(priorSelected);
  expect(output.report.explanation).toEqual(prior.report.explanation);
  expect(output.report.total).toBeLessThanOrEqual(prior.report.total);
  const story = scenario.input.story!;
  const roles = createStoryRoleReader({ worldId: story.world.id, entities: scenario.input.entities ?? [] }, scenario.input.draft,
    storedRoleReader(story.roleSeeds!, scenario.input.entities ?? [], story.world.id));
  const episodes = createEpisodeReader(story.roleSeeds, story.episodeSources);
  const time = createStoryTimeReader(story.facts, episodes);
  const labels: string[] = [], selectedIndices: number[] = [];
  for (const hint of selected) {
    const index = scenario.facts.findIndex(f => f.text === hint.text);
    expect(index, 'only accepted, unchanged sources may be transmitted').toBeGreaterThanOrEqual(0);
    const fact = scenario.facts[index]!;
    expect(hint).toEqual(storyFactHint(fact, roles, episodes, time));
    labels.push(recentPlotFactLabel(index));
    selectedIndices.push(index);
  }
  const missing = scenario.wanted.filter(label => !labels.includes(label));
  audit.push({
    id: scenario.id, locale: scenario.locale, variant: scenario.variant, control: scenario.control,
    selected: labels, selectedIndices, wanted: scenario.wanted, missing,
    support: labels.filter(label => !scenario.wanted.includes(label) && scenario.support.includes(label)).length,
    spillover: labels.filter(label => !scenario.wanted.includes(label) && !scenario.support.includes(label)).length,
    duplicateTopicRows: scenario.id === 'natural-repeat-discussion-recall' ? Math.max(0, labels.filter(label => label === 'repeated').length - 1) : 0,
    totalTokens: output.report.total, priorTokens: prior.report.total,
  });
  expect(output.report.total).toBe(addedContextTokens(output.text));
  expect(output.report.total <= output.report.limit || output.report.required > output.report.limit).toBe(true);
  expect(scenario.input).toEqual(before);
});

it('reports query coverage separately from useful support and incidental recent context', () => {
  const report = RECENT_CONTEXT_VARIANTS.map(variant => {
    const all = audit.filter(row => row.variant === variant), scored = all.filter(row => !row.control), controls = all.filter(row => row.control);
    return {
      variant, scenarios: all.length, scored: scored.length,
      complete: scored.filter(row => !row.missing.length).length,
      wanted: scored.reduce((n, row) => n + row.wanted.length, 0),
      missing: scored.reduce((n, row) => n + row.missing.length, 0),
      support: scored.reduce((n, row) => n + row.support, 0),
      spillover: scored.reduce((n, row) => n + row.spillover, 0),
      duplicateTopicRows: scored.reduce((n, row) => n + row.duplicateTopicRows, 0),
      averageFacts: scored.reduce((n, row) => n + row.selected.length, 0) / scored.length,
      averageTokens: Math.round(scored.reduce((n, row) => n + row.totalTokens, 0) / scored.length),
      priorAverageTokens: Math.round(scored.reduce((n, row) => n + row.priorTokens, 0) / scored.length),
      savedTokens: scored.reduce((n, row) => n + row.priorTokens - row.totalTokens, 0),
      sameSelectionAsNewChat: scored.filter(row => JSON.stringify(row.selectedIndices) === JSON.stringify(audit.find(other => other.id === row.id && other.locale === row.locale && other.variant === 'new-chat')!.selectedIndices)).length,
      ownerControls: controls.length,
      ownerExtraRecords: controls.reduce((n, row) => n + row.selected.filter(label => label !== 'rumor').length, 0),
    };
  });
  console.info('RP05-recent-context-audit', JSON.stringify(report), JSON.stringify(audit.filter(row => row.missing.length)));
  expect(audit).toHaveLength(96);
  for (const row of report) expect(row).toMatchObject({ scenarios: 24, scored: 20, complete: 20, wanted: 32, missing: 0, ownerControls: 4, ownerExtraRecords: 0 });
});
