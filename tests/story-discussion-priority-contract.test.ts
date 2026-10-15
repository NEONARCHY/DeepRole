// @vitest-environment node
import { expect, it } from 'vitest';
import { discussionWorld } from './fixtures/story-discussion-priority';
import { isExplicitDiscussionRepeat, discussionPriorityFacts } from '../src/core/story-discussion-priority';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader, roleSeed } from '../src/core/story-role-binding';
import { createEpisodeReader } from '../src/core/story-episodes';
import { storyContentRelevance } from '../src/core/story-content-relevance';
import { storyRetrievalQuery } from '../src/core/story-retrieval-query';
import type { StoryFact } from '../src/core/story-update';
const readers = (c: ReturnType<typeof discussionWorld>) => ({
  roles: createStoryRoleReader({ worldId: c.base.world.id, entities: c.input.entities! }, c.input.draft, storedRoleReader(c.seeds, c.input.entities!, c.base.world.id)),
  episodes: createEpisodeReader(c.seeds, c.input.story!.episodeSources),
});
for (const locale of ['ru', 'en'] as const) {
  it(`${locale} only full explicit repeats qualify; every original/mixed source remains substantive`, () => {
    const c = discussionWorld(locale), r = readers(c), before = structuredClone(c.input);
    expect(c.discussions.every(f => isExplicitDiscussionRepeat(f, r.roles, r.episodes))).toBe(true);
    expect(c.records.every(f => !isExplicitDiscussionRepeat(f, r.roles, r.episodes))).toBe(true);
    expect(c.input).toEqual(before);
  });
  for (const change of ['summary', 'source', 'identity', 'recipient', 'task', 'claim', 'kind'] as const) it(`${locale} ${change} never loses speaker/meaning to repeat classification`, () => {
    const c = discussionWorld(locale), f = c.discussions[0]!;
    if (change === 'summary') f.text = locale === 'ru' ? 'Они говорили о печати.' : 'They talked about the seal.';
    if (change === 'source') c.input.story!.episodeSources = [];
    if (change === 'identity') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'replacement-' + e.id }));
    if (change === 'recipient') c.seeds.find(s => s.binding.quote === f.quote)!.binding.roles.recipient = { id: c.B.id, name: c.B.name };
    if (change === 'task') f.task = { key: 'new-task', title: 'Known task', status: 'open' };
    if (change === 'claim') f.claim = { key: 'known-state', value: f.text, scope: 'state' };
    if (change === 'kind') f.kind = 'belief';
    const r = readers(c); expect(isExplicitDiscussionRepeat(f, r.roles, r.episodes)).toBe(false);
  });
  it(`${locale} unknown topic, dialogue request, owner and source failures keep ordinary selection`, () => {
    const c = discussionWorld(locale), r = readers(c);
    for (const query of c.s('Продолжай.|Что Аделина сказала?|Напомни о невиданном драконе.', 'Continue.|What did Adeline say?|Remind me about an unknown dragon.').split('|')) {
      const a = storyContentRelevance(c.facts, query, storyRetrievalQuery(query, { worldId: c.base.world.id, entities: c.input.entities! }).relevanceNames).admission;
      expect(discussionPriorityFacts(c.facts, query, a, r.roles, r.episodes)).toBeUndefined();
    }
  });
}
for (const body of [
  'We discussed the seal again; its code is 8899; no new information, actions or commitments were added.',
  'We only recalled the seal and learned a secret; no new information, actions or commitments were added.',
  'We only recalled the seal 8899; no new information, actions or commitments were added.',
  'We only recalled the seal; no new actions were added.',
  'We only recalled the seal; no new information, actions or commitments were added. But someone changed the code.',
  'Мы снова обсуждали печать и узнали секрет; новых сведений, действий и обязательств не появилось.',
  'Мы снова обсуждали печать 8899; новых сведений, действий и обязательств не появилось.',
  'Мы снова обсуждали печать; новых сведений, действий и обязательств не появилось. Появился новый код.',
]) it(`new/mixed/incomplete statements remain important: ${body}`, () => {
  const c = discussionWorld('en'), text = `Adeline said: “${body}”`, fact: StoryFact = { kind: 'event', text, quote: text };
  c.seeds.push(roleSeed(fact, { version: 1, sourceRevisionId: c.sources[0]!, quote: text, roles: { speaker: { id: c.A.id, name: c.A.name } } }));
  const r = readers(c); expect(isExplicitDiscussionRepeat(fact, r.roles, r.episodes)).toBe(false);
});
