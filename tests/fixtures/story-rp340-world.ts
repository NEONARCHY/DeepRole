import frozen from './story-rp340-long-holdout.json' with { type: 'json' };
import { storyWorld } from './story-worlds';
import { withPersistedEvidence } from './story-persisted-evidence';
import { EMPTY_STATUS } from '../../src/core/characters';
import type { StoryFact } from '../../src/core/story-update';
import type { FactRoleSeed } from '../../src/core/story-role-binding';

export const longHoldout = frozen;

/** New stories/gold are independent of retrieval output. Reuse the validated
 * evidence graph builder; do not give the compiler gold source indices. */
export function longHoldoutWorld(gold: typeof frozen.worlds[number], count: number) {
  const locale = gold.locale === 'ru' ? 'ru' : 'en', base = storyWorld(locale, 3);
  const s = (ru: string, en: string) => locale === 'ru' ? ru : en;
  base.world.name = gold.worldName; base.world.contextBudget = frozen.budget;
  base.world.description = s('Вымышленная история независимой проверки.', 'A fictional independent evaluation story.');
  base.entities.forEach((person, i) => { person.name = gold.people[i]!; person.characterSheet!.protagonist = false; });
  const scene = base.binding.characterScenes![base.world.id]!;
  scene.presentIds = base.entities.map(p => p.id);
  scene.states[base.entities[2]!.id] = { ...structuredClone(EMPTY_STATUS), stats: [] };
  const important = structuredClone(gold.facts) as StoryFact[];
  const extras: StoryFact[] = Array.from({ length: count }, (_, i) => {
    const speaker = gold.people[i % 3]!, place = `S${String(i).padStart(4, '0')}`;
    if (i % 3 === 0) {
      const object = gold.objects[Math.floor(i / 3) % 4]!;
      const text = s(`${speaker}: «Снова обсуждали ${object} в комнате ${place}; новых сведений нет, действий и обещаний не было».`, `${speaker}: “We discussed the ${object} in room ${place} again; no new information, actions or promises.”`);
      return { kind: 'event', text, quote: text };
    }
    if (i % 3 === 1) {
      const text = s(`${speaker} поставил чашку на полку ${place}, закрыл окно и записал температуру. Это произошло на побочной встрече.`, `${speaker} put a cup on shelf ${place}, closed the window and recorded the temperature during a side meeting.`);
      return { kind: 'event', text, quote: text };
    }
    const title = s(`квитанция ${place}`, `receipt ${place}`);
    const text = s(`${speaker} выполнил отдельное обещание: ${title} доставлена в канцелярию. Обещание завершено.`, `${speaker} fulfilled a separate promise: ${title} was delivered to the office. That promise is completed.`);
    return { kind: 'event', text, quote: text, task: { key: `side-${place}`, title, status: 'completed' } };
  });
  const facts = [...important, ...extras];
  base.world.sharedGame = { version: 1, id: 'persisted-game', revision: 'persisted-revision', activationId: 'persisted-activation', activeChatId: base.binding.chatId, activeBindingId: base.binding.id, managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts, factRoleSeeds: [], episodeSources: [], updatedAt: 20 };
  return { ...withPersistedEvidence({ base, important, facts, seeds: [] as FactRoleSeed[], sources: [] as string[], questions: gold.queries, s }), gold };
}
