import type { CharacterScene, SceneEntity } from "./types";

/** Request-size budget, NOT a library limit. Exact mentions are local matching,
 * not semantic search. Whole names/aliases must not match inside other names. */
export const CHARACTER_ROSTER_BUDGET = 6000;
const folded = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ");
const word = (text: string) => /[\p{L}\p{N}_]/u.test(text);
function mentionsFolded(lower: string, entity: Pick<SceneEntity, "name" | "aliases">) {
  return [entity.name, ...entity.aliases].some(value => {
    const name = folded(value).trim(); if (!name) return false;
    for (let index = lower.indexOf(name); index >= 0; index = lower.indexOf(name, index + 1)) {
      const before = lower.slice(Math.max(0, index - 2), index), after = lower.slice(index + name.length, index + name.length + 2);
      if ((!before || !word([...before].at(-1)!)) && (!after || !word([...after][0]!))) return true;
    }
    return false;
  });
}
export const mentionsCharacter = (text: string, entity: Pick<SceneEntity, "name" | "aliases">) => mentionsFolded(folded(text), entity);
export function selectCharacterContext(entities: SceneEntity[], scene: CharacterScene | undefined, focusIds: string[], recent: string, budget = CHARACTER_ROSTER_BUDGET) {
  const present = new Set(scene?.presentIds ?? []), talking = new Set(scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : [])), focus = new Set(focusIds);
  const lower = folded(recent);
  const players = entities.filter(e => e.characterSheet?.protagonist), uniquePlayer = players.length === 1 ? players[0]!.id : null;
  const ranked = entities.map((entity, index) => ({ entity, index, priority: entity.characterSheet?.protagonist ? 4 : talking.has(entity.id) || focus.has(entity.id) ? 3 : present.has(entity.id) ? 2 : mentionsFolded(lower, entity) ? 1 : 0 }));
  ranked.sort((a, b) => b.priority - a.priority || a.index - b.index);
  const roster: SceneEntity[] = []; let used = 2;
  for (const { entity } of ranked) {
    const size = JSON.stringify({ id: entity.id, name: entity.name, player: !!entity.characterSheet?.protagonist }).length + 1;
    // A physically present participant cannot disappear because of optional
    // off-scene references. Physical scene cardinality is checked separately.
    if (used + size > budget && !present.has(entity.id) && !talking.has(entity.id) && entity.id !== uniquePlayer) continue;
    roster.push(entity); used += size;
  }
  return { roster, active: ranked.filter(r => r.priority > 0 && roster.includes(r.entity)).slice(0, 6).map(r => r.entity) };
}
