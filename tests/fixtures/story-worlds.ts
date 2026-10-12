import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import type { ChatBinding, DataRecord, Locale, MemoryEntry, SceneEntity, WorldProfile } from "../../src/core/types";

/** Entirely synthetic. IDs deliberately do not depend on names or locale. */
export function storyWorld(locale: Locale = "en", count = 3) {
  const ru = locale === "ru";
  const world: WorldProfile = { id: "synthetic-world", name: ru ? "Мастерская" : "Workshop", description: ru ? "  История о ремонте часов.\nБез магии.  " : "  A story about repairing clocks.\nNo magic.  ", color: "#456789", contextBudget: 2000, relevanceThreshold: 6, createdAt: 10, updatedAt: 20 };
  const entities: SceneEntity[] = Array.from({ length: count }, (_, index) => ({
    id: `person-${index + 1}`, worldId: world.id, kind: "character", name: `${ru ? "Житель" : "Resident"} ${index + 1}`,
    description: ru ? "Взрослый житель города." : "An adult town resident.", aliases: [], memberIds: [], createdAt: 10, updatedAt: 20,
    characterSheet: { ...EMPTY_CHARACTER, protagonist: index === 0, appearance: ru ? "35 лет; серое пальто." : "Age 35; gray coat.", personality: ru ? "Терпеливый." : "Patient.", sprites: {} },
  }));
  const binding: ChatBinding = { id: "binding:synthetic-a", chatId: "synthetic-a", chatUrl: "https://chat.deepseek.com/chat/s/synthetic-a", worldId: world.id, focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 10, updatedAt: 20,
    characterScenes: { [world.id]: { revision: "legacy-scene-a", presentIds: entities.slice(0, 2).map(e => e.id), states: Object.fromEntries(entities.slice(0, 2).map(e => [e.id, { ...EMPTY_STATUS, condition: ru ? "В мастерской." : "In the workshop.", goal: ru ? "Починить часы." : "Repair the clock.", stats: [] }])), updatedAt: 20 } },
  };
  const entry: MemoryEntry = { id: "clock-key", worldId: world.id, entityIds: [entities[1]?.id ?? entities[0]!.id], bookId: null, title: ru ? "Ключ от часов" : "Clock key", content: ru ? "Ключ от часов лежит в синей коробке." : "The clock key is in the blue box.", keywords: [ru ? "ключ от часов" : "clock key"], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 10, updatedAt: 20 };
  const records: DataRecord[] = [{ kind: "world", id: world.id, data: world }, ...entities.map(data => ({ kind: "entity" as const, id: data.id, data })), { kind: "entry", id: entry.id, data: entry }, { kind: "binding", id: binding.id, data: binding }];
  return { world, entities, binding, entry, records };
}

export function storyVariants(locale: Locale) {
  const ordinary = storyWorld(locale);
  const fantasy = storyWorld(locale);
  fantasy.world.description = locale === "ru" ? "Город на спине дракона. Часы измеряют приливы облаков." : "A town on a dragon's back. Clocks measure cloud tides.";
  const heroes = storyWorld(locale);
  heroes.entities[1]!.characterSheet!.protagonist = true;
  const ambiguous = storyWorld(locale);
  ambiguous.entities[0]!.name = ambiguous.entities[1]!.name = locale === "ru" ? "Саша" : "Alex";
  ambiguous.entities[0]!.aliases = ambiguous.entities[1]!.aliases = [locale === "ru" ? "Мастер" : "Maker"];
  const large = storyWorld(locale, 1000);
  const branches = storyWorld(locale);
  const other: ChatBinding = structuredClone(branches.binding);
  other.id = "binding:synthetic-b"; other.chatId = "synthetic-b"; other.chatUrl = "https://chat.deepseek.com/chat/s/synthetic-b";
  other.characterScenes![branches.world.id]!.revision = "legacy-scene-b";
  other.characterScenes![branches.world.id]!.states[branches.entities[0]!.id]!.goal = locale === "ru" ? "Продать часы." : "Sell the clock.";
  branches.records.push({ kind: "binding", id: other.id, data: other });
  return { ordinary, fantasy, heroes, ambiguous, large, branches };
}

export function detailedStoryWorld() {
  const fixture = storyWorld("en", 6);
  for (const entity of fixture.entities) for (const field of ["appearance", "personality", "goals", "background"] as const) {
    entity.characterSheet![field] = `${field}: observed fictional detail. `.repeat(50).slice(0, 1200);
  }
  fixture.binding.focusIds = fixture.entities.map(e => e.id);
  return fixture;
}
