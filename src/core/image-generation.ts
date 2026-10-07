import type { Locale } from "./types";
import { validPortrait } from "./portrait-variations";

// One entry defines the type, validator and both labels. These are presets, not prompt filters.
export const IMAGE_CONTENT_LEVELS = [
  { id: "off", ru: "Обычные изображения", en: "Ordinary images" },
  { id: "suggestive", ru: "Неоткровенная романтика", en: "Non-explicit romance" },
] as const satisfies readonly { id: string; ru: string; en: string }[];
export type ImageContentLevel = typeof IMAGE_CONTENT_LEVELS[number]["id"];
export const validImageContentLevel = (v: unknown): v is ImageContentLevel => IMAGE_CONTENT_LEVELS.some(level => level.id === v);
export const imageContentLabel = (level: ImageContentLevel, locale: Locale) => IMAGE_CONTENT_LEVELS.find(item => item.id === level)![locale];
export type ImageProviderKind = "openai-images" | "venice-native";
export interface ImageProviderConfig {
  id: string; label: string; kind: ImageProviderKind; baseUrl: string;
  modelId: string; editModelId?: string; maxReferences: number;
  extraParams?: Record<string, unknown>; enabled: boolean;
}
export interface ImageSettings {
  enabled: boolean; contentLevel: ImageContentLevel;
  profiles: ImageProviderConfig[];
  profileByLevel: Partial<Record<ImageContentLevel, string>>;
  stylePrefix: string; styleSuffix: string;
}
export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { enabled: false, contentLevel: "off", profiles: [], profileByLevel: {}, stylePrefix: "", styleSuffix: "" };
export interface ImageModelInfo {
  id: string; label: string; privacy?: "private" | "anonymized"; priceUsd?: number;
  maxInputImages?: number; promptLimit?: number; supportsEdit?: boolean;
  constraints?: Record<string, unknown>;
}
export const IMAGE_RESPONSE_HEADERS = ["x-venice-is-blurred", "x-venice-is-content-violation", "x-venice-model-deprecation-warning"] as const;
export type ImageResponseHeaders = Partial<Record<typeof IMAGE_RESPONSE_HEADERS[number], string>>;
export interface ImageResult { image: string; headers: ImageResponseHeaders; seed?: number }
export interface GenerateInput { prompt: string; seed?: number }
export interface EditInput extends GenerateInput { images: string[] }
export interface ImageProvider {
  listModels(): Promise<ImageModelInfo[]>;
  generate(input: GenerateInput): Promise<ImageResult>;
  edit(input: EditInput): Promise<ImageResult>;
}
export interface Illustration {
  id: string; worldId: string; chatId: string; messageKey: string; entityId?: string;
  providerId: string; modelId: string; prompt: string; referenceKeys?: string[];
  seed?: number; contentLevel: ImageContentLevel; image: string;
  headers?: ImageResponseHeaders; createdAt: number; updatedAt: number;
}
export interface CharacterImagePrompt { canonical: string; sceneDelta: string; prefix: string; suffix: string; format: "prose" | "tags"; seed?: number }
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export const imageKey = (v: unknown): v is string => text(v, 160) && !!v.trim() && !["__proto__", "prototype", "constructor"].includes(v);
export const validProviderId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validImageBaseUrl(v: unknown): v is string {
  if (!text(v, 2048)) return false;
  try { const u = new URL(v); return v === v.trim() && !u.username && !u.password && !u.search && !u.hash && (u.protocol === "https:" || u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)); }
  catch { return false; }
}
// This is a denylist of transport-owned fields, NOT a model-parameter allowlist.
const RESERVED_PARAMS = new Set(["model", "modelid", "prompt", "image", "images", "authorization", "api_key", "apikey", "headers"]);
function jsonValue(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (v === null || typeof v === "boolean" || typeof v === "string") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(item => jsonValue(item, depth + 1));
  return object(v) && Object.getPrototypeOf(v) === Object.prototype && Object.entries(v).every(([k, item]) => !["__proto__", "prototype", "constructor"].includes(k) && jsonValue(item, depth + 1));
}
export function validExtraParams(v: unknown): v is Record<string, unknown> {
  if (!object(v) || Object.keys(v).length > 32 || !jsonValue(v) || Object.keys(v).some(k => RESERVED_PARAMS.has(k.toLowerCase()))) return false;
  return JSON.stringify(v).length <= 32_000;
}
export function validImageProviderConfig(v: unknown): v is ImageProviderConfig {
  return object(v) && validProviderId(v.id) && text(v.label, 80) && !!v.label.trim() && ["openai-images", "venice-native"].includes(String(v.kind))
    && validImageBaseUrl(v.baseUrl) && text(v.modelId, 200) && (v.editModelId === undefined || text(v.editModelId, 200))
    && Number.isInteger(v.maxReferences) && Number(v.maxReferences) >= 1 && Number(v.maxReferences) <= 128
    && typeof v.enabled === "boolean" && (v.extraParams === undefined || validExtraParams(v.extraParams))
    && Object.keys(v).every(k => ["id", "label", "kind", "baseUrl", "modelId", "editModelId", "maxReferences", "extraParams", "enabled"].includes(k));
}
export const validImageProviders = (v: unknown): v is ImageProviderConfig[] => Array.isArray(v) && v.length <= 8 && v.every(validImageProviderConfig) && new Set(v.map(p => p.id)).size === v.length;
export function validImageSettings(v: unknown): v is ImageSettings {
  if (!object(v) || !validImageProviders(v.profiles)) return false;
  const profiles = v.profiles;
  return typeof v.enabled === "boolean" && validImageContentLevel(v.contentLevel)
    && object(v.profileByLevel) && Object.entries(v.profileByLevel).every(([level, id]) => validImageContentLevel(level) && validProviderId(id) && profiles.some(p => p.id === id))
    && text(v.stylePrefix, 1200) && text(v.styleSuffix, 1200)
    && Object.keys(v).every(k => ["enabled", "contentLevel", "profiles", "profileByLevel", "stylePrefix", "styleSuffix"].includes(k));
}
export function validCharacterImagePrompt(v: unknown): v is CharacterImagePrompt {
  return object(v) && ["canonical", "sceneDelta", "prefix", "suffix"].every(k => text(v[k], 1200)) && ["prose", "tags"].includes(String(v.format)) && validImageSeed(v.seed);
}
export const validImageSeed = (v: unknown) => v === undefined || Number.isSafeInteger(v) && Number(v) >= 0;
export function validImageHeaders(v: unknown): v is ImageResponseHeaders {
  return object(v) && Object.entries(v).every(([k, value]) => IMAGE_RESPONSE_HEADERS.includes(k as typeof IMAGE_RESPONSE_HEADERS[number]) && text(value, 1000));
}
export function validIllustration(v: unknown): v is Illustration {
  return object(v) && ["id", "worldId", "chatId"].every(k => imageKey(v[k])) && text(v.messageKey, 1000) && !!v.messageKey
    && (v.entityId === undefined || imageKey(v.entityId)) && validProviderId(v.providerId) && text(v.modelId, 200) && !!v.modelId
    && text(v.prompt, 12_000) && !!v.prompt.trim() && validImageSeed(v.seed) && validImageContentLevel(v.contentLevel) && validPortrait(v.image)
    && (v.referenceKeys === undefined || Array.isArray(v.referenceKeys) && v.referenceKeys.length <= 128 && v.referenceKeys.every(imageKey))
    && (v.headers === undefined || validImageHeaders(v.headers)) && ["createdAt", "updatedAt"].every(k => typeof v[k] === "number" && Number.isFinite(v[k]) && Number(v[k]) >= 0);
}
