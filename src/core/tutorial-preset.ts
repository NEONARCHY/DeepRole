import { BOOK_COLORS } from "./defaults";
import { createId } from "./id";
import type { ActivationMode, Locale, MemoryBook, MemoryEntry, MemoryPriority, WorldProfile } from "./types";

interface TutorialMemory {
  title: string;
  content: string;
  keywords: string[];
  activation: ActivationMode;
  priority: MemoryPriority;
}

export interface TutorialPreset {
  profileName: string;
  profileDescription: string;
  plotTitle: string;
  plotDescription: string;
  memories: TutorialMemory[];
}

const PRESETS: Record<Locale, TutorialPreset> = {
  ru: {
    profileName: "Обсерватория Миры",
    profileDescription: "Учебный профиль: отдельное пространство памяти для одного RP-маршрута.",
    plotTitle: "Ночь без звёзд",
    plotDescription: "Мира приходит в заброшенную обсерваторию, чтобы найти карту исчезнувшего города до рассвета.",
    memories: [
      { title: "Главная цель", content: "Мира ищет карту исчезнувшего города и не хочет покидать обсерваторию без неё.", keywords: ["Мира", "карта", "обсерватория"], activation: "smart", priority: "high" },
      { title: "Тон истории", content: "Медленный мистический темп, внимание к звукам, свету и деталям окружения.", keywords: ["атмосфера", "описание", "темп"], activation: "always", priority: "normal" },
      { title: "Скрытая дверь", content: "За латунным телескопом находится дверь, которую Мира пока не заметила.", keywords: ["телескоп", "дверь"], activation: "manual", priority: "normal" },
    ],
  },
  en: {
    profileName: "Mira's Observatory",
    profileDescription: "Tutorial profile: a separate memory space for one roleplay route.",
    plotTitle: "A Starless Night",
    plotDescription: "Mira enters an abandoned observatory to find a map of a vanished city before dawn.",
    memories: [
      { title: "Main goal", content: "Mira is looking for the map of a vanished city and refuses to leave the observatory without it.", keywords: ["Mira", "map", "observatory"], activation: "smart", priority: "high" },
      { title: "Story tone", content: "Use a slow, mysterious pace with attention to sound, light, and environmental detail.", keywords: ["atmosphere", "description", "pace"], activation: "always", priority: "normal" },
      { title: "Hidden door", content: "A door is concealed behind the brass telescope, but Mira has not noticed it yet.", keywords: ["telescope", "door"], activation: "manual", priority: "normal" },
    ],
  },
};

export function getTutorialPreset(locale: Locale): TutorialPreset {
  return PRESETS[locale];
}

function createTutorialWorld(preset: TutorialPreset, id: string, now: number): WorldProfile {
  return {
    id,
    name: preset.profileName,
    description: "",
    useDescriptionInContext: false,
    color: BOOK_COLORS[1] ?? "#8b7cff",
    contextBudget: 2000,
    relevanceThreshold: 6,
    mapLayout: { positions: {}, expandedIds: [], customCategories: [] },
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTutorialPresetCopy(locale: Locale, now = Date.now()): { world: WorldProfile; book: MemoryBook; entries: MemoryEntry[] } {
  const preset = getTutorialPreset(locale);
  const worldId = createId("world");
  const bookId = createId("book");
  const world = createTutorialWorld(preset, worldId, now);
  const book: MemoryBook = {
    id: bookId,
    worldId,
    name: preset.plotTitle,
    description: preset.plotDescription,
    color: BOOK_COLORS[1] ?? "#8b7cff",
    // The book is ready to use once this separate world is connected to a chat.
    // Merely creating a tutorial copy never changes the current chat.
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const entries = preset.memories.map((memory, index) => ({
    id: createId("memory"),
    worldId,
    bookId,
    title: memory.title,
    content: memory.content,
    keywords: memory.keywords,
    activation: memory.activation,
    priority: memory.priority,
    enabled: true,
    source: { type: "manual" as const },
    createdAt: now + index,
    updatedAt: now + index,
  }));
  return { world, book, entries };
}

/** Repairs the exact, unassigned tutorial copy created by older versions without changing its lore text. */
export function repairLegacyTutorialCopy(book: MemoryBook, entries: MemoryEntry[], now = Date.now()): { world: WorldProfile; book: MemoryBook; entries: MemoryEntry[] } | null {
  if (book.worldId) return null;
  const preset = Object.values(PRESETS).find((candidate) =>
    book.name === candidate.profileName &&
    book.description === `${candidate.profileDescription}\n\n${candidate.plotTitle}: ${candidate.plotDescription}`,
  );
  if (!preset) return null;
  const bookEntries = entries.filter((entry) => entry.bookId === book.id);
  if (!preset.memories.every((memory) => bookEntries.some((entry) => entry.title === memory.title))) return null;

  const worldId = createId("world");
  return {
    world: createTutorialWorld(preset, worldId, now),
    book: { ...book, worldId, name: preset.plotTitle, description: preset.plotDescription, active: true, updatedAt: now },
    entries: bookEntries.map((entry) => ({ ...entry, worldId })),
  };
}
