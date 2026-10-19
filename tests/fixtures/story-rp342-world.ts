import frozen from './story-rp342-free-holdout.json' with { type: 'json' };
import { storyWorld } from './story-worlds';
import { withPersistedEvidence } from './story-persisted-evidence';
import { EMPTY_STATUS } from '../../src/core/characters';
import type { StoryFact } from '../../src/core/story-update';
import type { FactRoleSeed } from '../../src/core/story-role-binding';

export const longHoldout = frozen;

/** Only the evidence graph mechanism is reused. Gold never enters the compiler. */
export function longHoldoutWorld(gold: typeof frozen.worlds[number], count: number) {
  const locale = gold.locale === 'ru' ? 'ru' : 'en', base = storyWorld(locale, 3);
  const s = (ru: string, en: string) => locale === 'ru' ? ru : en;
  base.world.name = gold.worldName; base.world.contextBudget = frozen.budget;
  base.world.description = s('Вымышленная история независимой проверки.', 'A fictional independent evaluation story.');
  base.entities.forEach((person, i) => { person.name = gold.people[i]!; person.characterSheet!.protagonist = false; });
  const scene = base.binding.characterScenes![base.world.id]!;
  scene.presentIds = base.entities.map(p => p.id);
  scene.states[base.entities[2]!.id] = { ...structuredClone(EMPTY_STATUS), stats: [] };
  // The authored semantic label "boundary" is not a storage kind. A recorded
  // declaration of a rule is an event; preserve its literal prose and all gold.
  const important = structuredClone(gold.facts).map(f => ({ ...f, kind: f.kind === 'boundary' ? 'event' : f.kind })) as StoryFact[];
  const extras: StoryFact[] = Array.from({ length: count }, (_, i) => {
    const speaker = gold.people[i % 3]!, place = `S${String(i).padStart(4, '0')}`;
    if (i % 4 === 0) {
      const object = gold.objects[Math.floor(i / 4) % 4]!;
      const text = s(`${speaker}: «Снова обсуждали ${object} в комнате ${place}; новых сведений нет, действий и обещаний не было».`, `${speaker}: “We discussed the ${object} in room ${place} again; no new information, actions or promises.”`);
      return { kind: 'event', text, quote: text };
    }
    if (i % 4 === 3) {
      const title = s(`ведомость ${place}`, `inventory ${place}`);
      const text = s(`${speaker} закончил отдельное обещание: ${title} доставлена в метеобюро, дело закрыто.`, `${speaker} completed a separate promise: ${title} was delivered to the weather office; the task is closed.`);
      return { kind: 'event', text, quote: text, task: { key: `side-${place}`, title, status: 'completed' } };
    }
    const text = i % 4 === 1
      ? s(`${speaker} встретил курьера у будки ${place}, получил прогноз дождя и записал маршрут следующей смены.`, `${speaker} met a courier at hut ${place}, received a rain forecast and recorded the next shift’s route.`)
      : s(`${speaker} починил лампу у стола ${place}, вскипятил воду и оставил записку о доставке дров.`, `${speaker} repaired a lamp by desk ${place}, boiled water and left a note about firewood delivery.`);
    return { kind: 'event', text, quote: text };
  });
  const cut1 = Math.floor(count / 3), cut2 = Math.floor(count * 2 / 3);
  const facts = [...important.slice(0, 16), ...extras.slice(0, cut1), ...important.slice(16, 18), ...extras.slice(cut1, cut2), ...important.slice(18), ...extras.slice(cut2)];
  const coreIndices = important.map(f => facts.indexOf(f));
  base.world.sharedGame = { version: 1, id: 'persisted-game', revision: 'persisted-revision', activationId: 'persisted-activation', activeChatId: base.binding.chatId, activeBindingId: base.binding.id, managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts, factRoleSeeds: [], episodeSources: [], updatedAt: 20 };
  return { ...withPersistedEvidence({ base, important, facts, seeds: [] as FactRoleSeed[], sources: [] as string[], questions: gold.queries, s }), coreIndices, gold };
}
