import frozen from './story-rp336-narrative-holdout.json' with {type:'json'};
import { storyWorld } from './story-worlds';
import { withPersistedEvidence } from './story-persisted-evidence';
import { EMPTY_STATUS } from '../../src/core/characters';
import type { StoryFact } from '../../src/core/story-update';
import type { FactRoleSeed } from '../../src/core/story-role-binding';

export const narrativeHoldout = frozen;
export function narrativeHoldoutWorld(gold: typeof frozen.worlds[number], count: number) {
  const locale = gold.locale === 'ru' ? 'ru' : 'en', base = storyWorld(locale, 3);
  const s = (ru: string, en: string) => locale === 'ru' ? ru : en;
  base.world.name = gold.worldName; base.world.contextBudget = frozen.budget;
  base.world.description = s('Вымышленная история для независимой проверки памяти.', 'A fictional story for independent memory evaluation.');
  base.entities.forEach((person, i) => { person.name = gold.people[i]!; person.characterSheet!.protagonist = false; });
  const scene = base.binding.characterScenes![base.world.id]!;
  scene.presentIds = base.entities.map(p => p.id);
  scene.states[base.entities[2]!.id] = { ...structuredClone(EMPTY_STATUS), stats: [] };
  const important = structuredClone(gold.facts) as StoryFact[];
  const repeats: StoryFact[] = Array.from({ length: count }, (_, i) => {
    const place = String.fromCharCode(97 + Math.floor(i / 26) % 26, 97 + i % 26), object = gold.objects[i % 4]!;
    const text = s(`Эва сказала: «Мы снова говорили о предмете ${object} у сектора ${place}; новых сведений не появилось; ничего не предприняли; ничего не обещали».`, `Eva said: “We discussed the ${object} again by sector ${place}; no new information emerged; no actions were taken; no promises were made.”`);
    return { kind: 'event', text, quote: text };
  });
  const facts = [...important, ...repeats];
  base.world.sharedGame = { version: 1, id: 'persisted-game', revision: 'persisted-revision', activationId: 'persisted-activation', activeChatId: base.binding.chatId, activeBindingId: base.binding.id, managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts, factRoleSeeds: [], episodeSources: [], updatedAt: 20 };
  return { ...withPersistedEvidence({ base, important, facts, seeds: [] as FactRoleSeed[], sources: [] as string[], questions: gold.queries, s }), gold };
}
