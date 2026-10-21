import type { CharacterStatus, SceneEntity, WorldProfile } from "./types";
import { characterInChat, characterRevision, EMPTY_STATUS } from "./characters";
import { worldGamePeople } from "./world-game";
import { bondFor } from "./relationships";
import { characterStatusForSheet } from "./character-actions";

export interface WorldRestartPerson {
  id: string; name: string;
  bond?: { hero: string; trust: number; affinity: number; completed: string[] };
  attributes: { id: string; label: string; value: number }[];
  state: Pick<CharacterStatus, "action" | "condition" | "goal" | "relationship" | "stats">;
}
export interface WorldRestartPreview {
  worldId: string; chatId: string; revision: string; base: string; people: WorldRestartPerson[];
}
/** Read-only values from canonical saved sheets, not played overlays or images.
 * Match the roster after resetWorldGame clears seeds and archives the old game.
 * base is the existing transaction guard, passed unchanged through confirmation. */
export function worldRestartPreview(entities: SceneEntity[], world: WorldProfile | undefined, chatId: string | null): WorldRestartPreview | undefined {
  const game = world?.sharedGame;
  if (!world || !game || !chatId || game.activeChatId !== chatId) return;
  const raw = entities.filter(p => p.worldId === world.id && p.kind === "character" && characterInChat(p, chatId));
  const people = worldGamePeople(raw, { ...world, sharedGame: { ...game, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {} }, sharedGameArchives: [...world.sharedGameArchives ?? [], game] }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const hero = people.find(p => p.characterSheet?.protagonist);
  return { worldId: world.id, chatId, revision: game.revision, base: characterRevision(raw, game.scene), people: people.map(p => {
    const sheet = p.characterSheet, state = characterStatusForSheet(sheet, sheet?.initialStatus ?? EMPTY_STATUS), bond = bondFor(p, hero);
    return { id: p.id, name: p.name,
      ...(bond && hero ? { bond: { hero: hero.name, trust: bond.trust, affinity: bond.affinity, completed: (sheet?.relationships?.milestones ?? []).filter(m => bond.completed.includes(m.id)).map(m => m.label) } } : {}),
      attributes: (sheet?.attributes ?? []).map(a => ({ id: a.id, label: a.label, value: a.initial })),
      state: { action: state.action, condition: state.condition, goal: state.goal, relationship: state.relationship, stats: state.stats.map(s => ({ ...s })) },
    };
  }) };
}
