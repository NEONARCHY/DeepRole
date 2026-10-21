import { expect, it } from 'vitest';
import { compileGameContext, addedContextTokens, type GameContextInput } from '../src/core/game-context';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { longHoldout, longHoldoutWorld } from './fixtures/story-rp344-world';
import { unresolvedStoryIntent } from '../src/core/story-unresolved-intent';
import { READ_ONLY_STORY_INSTRUCTION } from '../src/core/story-message-mode';

const hints = (text: string) => { const b = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return b ? decodeStoryMemory(JSON.parse(b.split('\n')[1]!)) : []; };
const makeInput = (gold: typeof longHoldout.worlds[number], id: string) => {
  const f = longHoldoutWorld(gold, 0), q = gold.queries.find(q => q.id === id)!;
  const input: GameContextInput = { draft: q.draft, recentMessages: q.recentMessages ?? [], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp346', facts: f.facts, sheetsEnabled: false } };
  return { input, f, q };
};
for (const gold of longHoldout.worlds) for (const id of ['narrative-four','free-equipment','free-sensitive','recent-version','cross-object','reordered-six','completed-history','what-remains','unknown-only','long-delayed-reference']) it(`${gold.id}:${id} retains evidence and visible uncertainty`, () => {
  const { input, f, q } = makeInput(gold,id), before = structuredClone(input); let coverage: GameMemoryCoverage | undefined;
  const out = compileGameContext(input, {}, c => { coverage = c; }), selected = hints(out.text);
  for (const at of q.wanted) expect(selected.some(h => h.text === f.important[at]!.text), `missing core${at}`).toBe(true);
  if (q.notice === 'required') expect(memoryCoverageIssue(coverage,out.report)).toBeDefined();
  expect(coverage?.kind).not.toBe('complete');
  for (const h of selected) {
    const at = f.facts.findIndex(f => f.text === h.text); expect(at).toBeGreaterThanOrEqual(0);
    expect(h.task).toEqual(f.facts[at]!.task); expect(h.sourceQuote ?? h.text).toBe(f.facts[at]!.quote);
    expect(h.sourceRoles ?? {}).toEqual(f.seeds[at]!.binding.roles); expect(h.episodeSource?.revisionId).toBe(f.sources[at]);
  }
  expect(input).toEqual(before); expect(out.report.total).toBe(addedContextTokens(out.text)); expect(out.report.total).toBeLessThanOrEqual(6000);
});
it('historical open task is explicit source history and cannot replace its completed current state', () => {
  const {input,f}=makeInput(longHoldout.worlds[0]!,'completed-history'), out=compileGameContext(input), selected=hints(out.text);
  expect(selected.some(h=>h.text===f.important[16]!.text&&h.task?.status==='open')).toBe(true);
  expect(selected.some(h=>h.text===f.important[17]!.text&&h.task?.status==='completed')).toBe(true);
  expect(out.text).toContain('<deeprole_task_history>'); expect(out.text).toContain('NOT current obligations');
  expect(out.text).toContain(f.sources[17]!); expect(input.story!.facts[17]!.task!.status).toBe('completed');
});
for (const query of ['А это уже можно отправлять?', 'Можно её показать?', 'Can that be shown?', 'Can the unknown object be sent yet?']) it(`operative infinitive: ${query}`,()=>{
  expect(unresolvedStoryIntent(query).operative).toBe(true);
});
it('read-only lore explicitly keeps an unstated promise recipient unknown',()=>{
  expect(READ_ONLY_STORY_INSTRUCTION).toContain('signatory'); expect(READ_ONLY_STORY_INSTRUCTION).toContain('recipient');
  expect(READ_ONLY_STORY_INSTRUCTION).toContain('unknown');
});
