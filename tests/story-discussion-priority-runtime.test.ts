// @vitest-environment node
import { expect, it } from 'vitest';
import { compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { discussionScenarios, priorDiscussionContext, discussionWorld } from './fixtures/story-discussion-priority';
import { roleSeed } from '../src/core/story-role-binding';
const hints = (text: string) => { const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : []; };
const scenarios = discussionScenarios();
const pick = (name: string) => { const source = scenarios.find(c => c.name === name)!; return { ...source, input: structuredClone(source.input) }; };
for (const locale of ['ru', 'en'] as const) {
  it(`${locale} actual compiler keeps played source, both conditions, last code and meaningful dialogue before120 explicit repetitions`, () => {
    const c = pick(locale + ':priority:guild:known'), before = structuredClone(c.input);
    const prior = priorDiscussionContext(c.input), current = compileGameContext(c.input), selected = hints(current.text);
    expect(c.wanted.every(f => hints(prior.text).some(h => h.text === f.text))).toBe(false);
    for (const fact of c.wanted) { const h = selected.find(h => h.text === fact.text); expect(h).toBeDefined(); expect(h!.sourceQuote ?? h!.text).toBe(fact.quote); expect(h!.task).toEqual(fact.task); expect(h!.claim).toEqual(fact.claim); }
    expect(selected.every(h => !c.discussions.some(f => f.text === h.text))).toBe(true);
    expect(selected).toHaveLength(8); expect(current.report.total).toBeLessThanOrEqual(c.input.settings.contextBudget); expect(c.input).toEqual(before);
  });
  for (const budget of [900, 1000, 1500, 2300, 6000]) it(`${locale} complete bundle or exact prior output/counters at ${budget}`, () => {
    const c = pick(locale + ':priority:guild:known'); c.input.settings.contextBudget = budget;
    const prior = priorDiscussionContext(c.input), current = compileGameContext(c.input), selected = hints(current.text);
    if (current.text !== prior.text) { expect(current.report.total).toBeLessThanOrEqual(budget); expect(c.wanted.every(f => selected.some(h => h.text === f.text))).toBe(true); }
    else expect(current).toEqual(prior);
  });
  for (const id of ['unknown', 'speaker', 'continuation', 'ambiguous', 'replacement', 'foreign', 'quote-edit', 'reported-only']) it(`${locale} ${id} guard preserves exact compiler result`, () => {
    const c = pick(locale + ':priority:guild:' + id);
    expect(compileGameContext(c.input)).toEqual(priorDiscussionContext(c.input));
  });
  it(`${locale} historical cap8 comparator preserves its exact prior overflow result`, () => {
    const c = discussionWorld(locale); c.input.draft = c.s('Что известно о печати?', 'What do we know about the seal?');
    const text = c.s('Аделина сказала: «Печать оставили в другой комнате; это отдельное известное событие».', 'Adeline said: “The seal was left in another room; this is a separate known event.”'), fact = { kind: 'event' as const, text, quote: text };
    c.input.story!.facts.push(fact); c.input.story!.roleSeeds!.push(roleSeed(fact, { version: 1, sourceRevisionId: 'ninth-important-source', quote: text, roles: { speaker: { id: c.A.id, name: c.A.name } } })); c.input.story!.episodeSources!.push('ninth-important-source');
    expect(compileGameContext(c.input, { budgetPriority: false })).toEqual(priorDiscussionContext(c.input));
  });
  it(`${locale} required lore overflow and restart keep the exact prior path`, () => {
    const c = pick(locale + ':priority:guild:known');
    c.input.requiredContext = 'Whole required lore. '.repeat(1000); c.input.settings.contextBudget = 1000;
    expect(compileGameContext(c.input)).toEqual(priorDiscussionContext(c.input));
    c.input.requiredContext = ''; c.input.restart = true; expect(compileGameContext(c.input)).toEqual(priorDiscussionContext(c.input));
  });
}
