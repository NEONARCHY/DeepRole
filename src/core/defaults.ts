import type { DeepRoleSettings } from "./types";

export const DEFAULT_SETTINGS: DeepRoleSettings = {
  locale:
    typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")
      ? "ru"
      : "en",
  onboardingComplete: false,
  characterSheetsEnabled: true,
  characterSpritesEnabled: true,
  portraitLayoutResetAt: 0,
  characterEmotions: ["neutral", "happy", "sad", "angry", "surprised", "worried"],
  sceneChoicesEnabled: true,
  showChatContextMeter: true,
  showMemoryContextIndicator: true,
  contextBudget: 2000,
  relevanceThreshold: 6,
  suggestionInterval: 20,
  suggestionsEnabled: true,
  recentMessageCount: 4,
  animationsEnabled: true,
  confirmDeletions: true,
};

export const BOOK_COLORS = [
  "#58a6ff",
  "#8b7cff",
  "#31c7a1",
  "#f1a65a",
  "#e975a8",
  "#8ea1b5",
];

export const APP_VERSION = "0.1.0";
