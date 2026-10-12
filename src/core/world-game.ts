import type { CharacterScene, ChatBinding, DataRecord, Locale, MemoryOverrides, SceneEntity, WorldProfile } from "./types";
import { validCharacterScenes } from "./characters";
import { chatId, currentChatUrl } from "./old-chat-notice";
import { validProfileSeeds, storyProfileEntities, type ProfileSeeds } from "./story-profile-view";
import { validIdentitySeeds, type IdentitySeeds } from "./story-character-identity";
import { validMergeSeeds, type MergeSeeds } from "./story-character-merge";
import { validStoryFact, type StoryFact } from "./story-update";
import type { StoryRecord } from "./story-records";
import { validStoryContinuation } from "./story-continuation";
import { validReviewResolutions } from "./story-automation";
export interface WorldGame {
  memoryBatchSources?: string[];
  pendingReviewIds?: string[];
  reviewResolutions?: import("./story-automation").ReviewResolutions;
 version: 1; id: string; revision: string; activationId: string; activeChatId: string; activeBindingId: string;
 managed: boolean; scene?: CharacterScene; memoryOverrides: MemoryOverrides;
 restartPending?: true;
 profileSeeds: ProfileSeeds; identitySeeds: IdentitySeeds; mergeSeeds: MergeSeeds;
 facts: StoryFact[];
 recentStory?: import("./types").StoryContinuation;
 recentChatId?: string;
 updatedAt: number;
}
export interface WorldGameActivation { chatId: string; chatUrl: string; worldId: string; expectedRevision: string | null; mode: "initialize" | "attach" | "resume" }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "constructor", "prototype"].includes(v);
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id);
export const validWorldGame = (v: unknown): v is WorldGame => object(v) && Object.keys(v).every(k => ["version", "id", "revision", "activationId", "activeChatId", "activeBindingId", "managed", "scene", "memoryOverrides", "profileSeeds", "identitySeeds", "mergeSeeds", "facts", "recentStory", "recentChatId", "restartPending", "updatedAt", "pendingReviewIds", "reviewResolutions", "memoryBatchSources"].includes(k)) && (v.pendingReviewIds === undefined || ids(v.pendingReviewIds)) && (v.reviewResolutions === undefined || validReviewResolutions(v.reviewResolutions)) && (v.memoryBatchSources === undefined || ids(v.memoryBatchSources) && new Set(v.memoryBatchSources).size === v.memoryBatchSources.length) && v.version === 1 && id(v.id) && id(v.activationId) && id(v.revision) && chatId(v.activeChatId) && id(v.activeBindingId) && typeof v.managed === "boolean" && (v.restartPending === undefined || v.restartPending === true) && typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt) && v.updatedAt >= 0 && (v.scene === undefined || validCharacterScenes({ shared: v.scene })) && object(v.memoryOverrides) && Object.keys(v.memoryOverrides).length === 2 && ids(v.memoryOverrides.includedIds) && ids(v.memoryOverrides.excludedIds) && validProfileSeeds(v.profileSeeds) && validIdentitySeeds(v.identitySeeds) && validMergeSeeds(v.mergeSeeds) && Array.isArray(v.facts) && v.facts.every(validStoryFact) && (v.recentStory === undefined || validStoryContinuation(v.recentStory)) && (v.recentChatId === undefined || chatId(v.recentChatId));
export const validWorldGameActivation = (v: unknown): v is WorldGameActivation => object(v) && Object.keys(v).length === 5 && ["chatId", "chatUrl", "worldId", "expectedRevision", "mode"].every(k => Object.hasOwn(v, k)) && chatId(v.chatId) && typeof v.chatUrl === "string" && v.chatUrl.length <= 2048 && id(v.worldId) && (v.expectedRevision === null || id(v.expectedRevision)) && ["initialize", "attach", "resume"].includes(String(v.mode));
/** Display only: never feed this borrowed state back to an archived branch writer. */
export function worldGameBinding(binding: ChatBinding | undefined, world: WorldProfile | undefined): ChatBinding | undefined {
 const game = world?.sharedGame;
 if (!binding || !game || binding.worldId !== world!.id || binding.id === game.activeBindingId) return binding;
 return { ...binding, memoryOverrides: game.memoryOverrides, characterScenes: { ...binding.characterScenes, ...(game.scene ? { [world!.id]: game.scene } : {}) } };
}
export function worldGamePeople(entities: SceneEntity[], world: WorldProfile | undefined, records: StoryRecord[] = []): SceneEntity[] {
 const game = world?.sharedGame;
 const active = new Set(Object.values(game?.mergeSeeds ?? {}).map(m => m.mergedId));
 const archived = new Set(world?.sharedGameArchives?.flatMap(g => Object.values(g.mergeSeeds).map(m => m.mergedId)) ?? []);
 const roster = entities.filter(p => !archived.has(p.id) || active.has(p.id));
 return game ? storyProfileEntities(roster, records, [], world!.id, game.activeChatId, game.profileSeeds, game.identitySeeds, game.mergeSeeds) : entities;
}
export function assertWorldGameWriter(all: DataRecord[], binding: ChatBinding, worldId: string) {
 const world = all.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
 if (world?.sharedGame && (world.sharedGame.activeBindingId !== binding.id || world.sharedGame.activeChatId !== binding.chatId)) throw Error("story-game-inactive");
}
export const worldGameText = (locale: Locale) => locale === "ru" ? {
 title: "Игра продолжается в другом чате", body: "У этого лора общий прогресс. Здесь можно читать историю. Чтобы продолжить игру здесь, переключите её в этот чат.", open: "Открыть актуальный чат", resume: "Продолжить здесь", failed: "Не удалось переключить игру. Прогресс сохранён; попробуйте ещё раз.", stale: "Игра уже изменилась в другом чате. Обновите панель и повторите действие.", active: "Прогресс общий для этого лора", restart: "Начать игру заново", reset: "Текущая игра будет сохранена в истории. Отношения и характеристики сбросятся к начальным значениям; лор и изображения сохранятся."
} : {
 title: "The game continues in another chat", body: "This lore has shared progress. You can read the history here. To play here, move the game to this chat.", open: "Open current chat", resume: "Continue here", failed: "Could not move the game. Progress is saved; try again.", stale: "The game changed in another chat. Refresh the panel and try again.", active: "Progress is shared across this lore", restart: "Start the game over", reset: "The current game will be saved in history. Relationships and attributes return to their initial values; lore and images are kept."
};
export const worldGameLink = (world: WorldProfile) => world.sharedGame ? currentChatUrl(world.sharedGame.activeChatId) : undefined;
