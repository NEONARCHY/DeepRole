import type { MemoryBook, MemoryEntry, SceneEntity, SceneState } from "./types";
import { normalizeText, uniqueTokens } from "./text";

export const EMPTY_SCENE: SceneState = { worldId: null, focusIds: [], bookId: null };

// A book owns its entries' scope. Old records without a world remain in Unassigned.
export function memoryWorld(entry: Pick<MemoryEntry, "worldId" | "bookId">, books: MemoryBook[]): string | null {
  if (entry.bookId) {
    const book = books.find((item) => item.id === entry.bookId);
    if (book) return book.worldId ?? null;
  }
  return entry.worldId ?? null;
}

export function isMemoryInScene(entry: MemoryEntry, scene: SceneState, books: MemoryBook[]): boolean {
  if (memoryWorld(entry, books) !== scene.worldId) return false;
  if (!entry.bookId) return true;
  const book = books.find((item) => item.id === entry.bookId);
  if (!book || !book.active) return false;
  // A world uses all enabled books by default; unassigned preserves the legacy book selection.
  return scene.worldId ? !scene.bookId || entry.bookId === scene.bookId : entry.bookId === scene.bookId;
}

export function expandFocus(ids: Iterable<string>, entities: SceneEntity[], worldId: string | null): Set<string> {
  const eligible = new Map(entities.filter((entity) => entity.worldId === worldId).map((entity) => [entity.id, entity]));
  const result = new Set<string>();
  const visit = (id: string) => {
    const entity = eligible.get(id);
    if (!entity || result.has(id)) return;
    result.add(id);
    if (entity.kind === "group") entity.memberIds.forEach(visit);
  };
  [...ids].forEach(visit);
  return result;
}

export function mentionedEntities(text: string, entities: SceneEntity[]): string[] {
  const normalized = ` ${normalizeText(text)} `;
  const words = normalized.trim().split(" ");
  const tokens = uniqueTokens(text);
  return entities.filter((entity) => [entity.name, ...entity.aliases].some((alias) => {
    const phrase = normalizeText(alias);
    if (!phrase) return false;
    if (normalized.includes(` ${phrase} `)) return true;
    // Short Russian names otherwise fall below the general stemmer's cutoff:
    // Мира/Мирой, Аска/Аской. Match whole words, never arbitrary substrings.
    if (entity.kind === "character") {
      const names = phrase.split(" ");
      const matchesName = (name: string, word: string | undefined) => {
        if (name === word) return true;
        if (!/^[а-я]{3,}[ая]$/u.test(name) || !word) return false;
        const endings = name.endsWith("а") ? ["а", "ы", "и", "е", "у", "ой", "ою"] : ["я", "и", "е", "ю", "ей", "ею"];
        return endings.some((ending) => word === name.slice(0, -1) + ending);
      };
      if (words.some((_, index) => names.every((name, offset) => matchesName(name, words[index + offset])))) return true;
    }
    const parts = [...uniqueTokens(alias)];
    return parts.length > 0 && parts.every((part) => tokens.has(part));
  })).map((entity) => entity.id);
}
