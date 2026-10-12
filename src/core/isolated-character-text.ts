import { characterFieldPrompt, characterFieldResult, validCharacterTextRequest, type CharacterTextRequest } from "./character-text";
import { fieldFactsPrompt, fieldFactsResult } from "./field-facts";
import { profileRelatedNames, validFieldHistoryReference, type FieldHistoryReference, type FieldSource } from "./field-history";
import { castChatReference } from "./cast-chat";
import { parseImageScenePlan } from "./image-plan";
import { compileMemoryWorkspace, EMPTY_OVERRIDES, libraryRecords, profileMemoryId } from "./memory-workspace";
import { validNativeStoryId } from "./story-transport";
import type { DataRecord, DeepRoleSettings, Locale, MemoryBook, MemoryEntry, MemoryOverrides, SceneEntity, StoryContinuation, WorldProfile } from "./types";
import { fieldCheck } from "./field-validation";
import { PROFILE_KEY, characterProfilePrompt, characterProfileResult } from "./character-profile";
import { currentStoryProfileEntities } from "./story-profile-view";

export interface IsolatedFieldInput {
  scope: { chatId: string | null; chatUrl: string; worldId: string | null; bookId: string | null };
  locale: Locale;
  draft: CharacterTextRequest;
  /** Bounded visible excerpt, not the whole chat or a reasoning transcript. */
  sceneReference: string;
  historyReference?: FieldHistoryReference;
}
export interface CharacterTextOutcome { text: string; partialContext: boolean; cleanup: "done" | "failed"; cleanupUrl?: string; historyOrigin?: "native" | "visible"; mode?: "history" | "suggest"; evidence?: string[] }
export class IsolatedFieldError extends Error {
  constructor(code: string, public cleanup?: "done" | "failed", public cleanupUrl?: string) { super(safeFieldError(code)); this.name = "IsolatedFieldError"; }
}
export const FIELD_TIMEOUT = 8 * 60_000;
export const FIELD_OWNERS_KEY = "deeprole_field_owners";
export const fieldErrorCodes = ["invalid-brief", "busy", "cleanup-pending", "scene-changed", "vault-locked", "world-unavailable", "tab-unavailable", "login-required", "not-empty-chat", "draft-not-empty", "composer-unavailable", "user-interrupted", "request-failed", "reply-timeout", "invalid-result", "invalid-evidence", "facts-not-found", "conflicting-facts", "text-too-long", "interrupted", "tab-closed", "cancelled", "untrusted", "unowned-tab", "chat-changed", "stale-step", "profile-ambiguous"] as const;
export const safeFieldError = (error: unknown): string => fieldErrorCodes.find(code => code === error) ?? "invalid-result";
export function fieldSourceUrl(value: unknown, chatId: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.origin === "https://chat.deepseek.com" && !url.username && !url.password
      && !url.searchParams.has("deeprole_cast_job") && !url.searchParams.has("deeprole_field_job")
      && (chatId === null ? url.pathname === "/" : validNativeStoryId(chatId) && castChatReference(value)?.id === chatId);
  } catch { return false; }
}
export function validIsolatedFieldInput(value: unknown): value is IsolatedFieldInput {
  if (!value || typeof value !== "object") return false;
  const input = value as IsolatedFieldInput, s = input.scope;
  return Object.keys(input).every(k => ["scope", "locale", "draft", "sceneReference", "historyReference"].includes(k)) && !!s && Object.keys(s).every(k => ["chatId", "chatUrl", "worldId", "bookId"].includes(k)) && fieldSourceUrl(s.chatUrl, s.chatId) && (s.worldId === null || validNativeStoryId(s.worldId))
    && (s.bookId === null || validNativeStoryId(s.bookId)) && ["ru", "en"].includes(input.locale)
    && typeof input.sceneReference === "string" && input.sceneReference.length <= 12_000 && (input.historyReference === undefined || validFieldHistoryReference(input.historyReference)) && validCharacterTextRequest(input.draft);
}

/** Use the same world/book, activation and manual-exclusion rules as normal memory.
 * All text lives in the job's memory, never in unencrypted ownership/session storage.
 */
export function isolatedFieldPrompt(input: IsolatedFieldInput, records: DataRecord[], settings: DeepRoleSettings, requestId: string, overrides: MemoryOverrides = EMPTY_OVERRIDES) {
  if (!validIsolatedFieldInput(input) || !validNativeStoryId(requestId)) throw new Error("invalid-brief");
  const worlds = libraryRecords<WorldProfile>(records, "world"), world = worlds.find(w => w.id === input.scope.worldId);
  if (input.scope.worldId && !world) throw new Error("world-unavailable");
  const books = libraryRecords<MemoryBook>(records, "book");
  if (input.scope.bookId && !books.some(b => b.id === input.scope.bookId && b.active && (b.worldId ?? null) === input.scope.worldId)) throw new Error("scene-changed");
  const profileBinding = records.find(r => r.kind === "binding" && (r.data as import("./types").ChatBinding).chatId === input.scope.chatId)?.id;
  const entities = input.scope.worldId && input.scope.chatId ? currentStoryProfileEntities(libraryRecords<SceneEntity>(records, "entity"), records.filter(r => r.kind === "story").map(r => r.data as import("./story-records").StoryRecord), input.scope.worldId, input.scope.chatId, profileBinding) : libraryRecords<SceneEntity>(records, "entity");
  const target = entities.find(e => e.worldId === input.scope.worldId && e.id === input.draft.reference.entityId);
  if (input.draft.reference.entityId && !target) throw new Error("scene-changed");
  const compiled = compileMemoryWorkspace({ worlds, entities, books, entries: libraryRecords<MemoryEntry>(records, "entry"),
    draft: [input.draft.reference.name, input.draft.field.label, input.draft.currentText, ...(input.draft.field.key === PROFILE_KEY ? profileRelatedNames(input.draft.reference, entities.filter(e => e.worldId === input.scope.worldId)) : [])].join("\n"), recentMessages: [input.sceneReference],
    activeBookId: input.scope.bookId, scene: { worldId: input.scope.worldId, bookId: input.scope.bookId, focusIds: target ? [target.id] : [] },
    manualIds: overrides.includedIds, excludedIds: overrides.excludedIds,
    settings: { ...settings, contextBudget: Math.min(world?.contextBudget ?? settings.contextBudget, 8000), relevanceThreshold: world?.relevanceThreshold ?? settings.relevanceThreshold },
  });
  const memories: MemoryEntry[] = []; let used = 0, partialContext = compiled.selection.omittedCount > 0;
  // Bound JSON size, not only raw text length. Never silently truncate a source.
  for (const item of compiled.selection.entries) {
    const length = JSON.stringify({ title: item.entry.title, content: item.entry.content }).length;
    if (used + length > 40_000) { partialContext = true; continue; }
    used += length; memories.push(item.entry);
  }
  // World descriptions are already compiled as profile documents. Do not bypass
  // a user's manual exclusion by adding the same description a second time.
  const sources: FieldSource[] = [];
  // Draft strings remain distinct sources, avoiding JSON-escaped quotes as evidence.
  const draftStrings = (v: unknown, path: string, depth = 0) => {
    if (typeof v === "string" && v.trim()) sources.push({ id: `d${sources.length}`, text: `${path}: ${v}` });
    else if (depth < 5 && v && typeof v === "object") for (const [key, item] of Object.entries(v)) if (key !== "entityId") draftStrings(item, `${path}.${key}`, depth + 1);
  };
  draftStrings(input.draft.reference, "Current profile"); draftStrings(input.draft.currentText, "Current field");
  if (input.draft.field.key === PROFILE_KEY) {
    // Saved, explicitly mentioned profiles anchor a new person's connections.
    // Never pull a whole roster, images, numeric state or excluded descriptions.
    let relatedSize = 0, relatedCount = 0;
    for (const entity of entities) {
      if (entity.worldId !== input.scope.worldId || entity.id === target?.id || !entity.characterSheet || overrides.excludedIds.includes(profileMemoryId("entity", entity.id))
        || !profileRelatedNames(input.draft.reference, [entity]).length) continue;
      const sheet = entity.characterSheet, text = [entity.name, ...(["appearance", "personality", "goals", "background"] as const).filter(k => sheet[k].trim()).map(k => `${k}: ${sheet[k]}`)].join("\n");
      const size = JSON.stringify(text).length;
      if (relatedCount === 12 || relatedSize + size > 8000) { partialContext = true; continue; }
      sources.push({ id: `r${relatedCount++}`, text }); relatedSize += size;
    }
  }
  sources.push(...memories.map((m, i) => ({ id: `m${i}`, text: `${m.title}\n${m.content}` })), ...(input.historyReference?.sources ?? []));
  if (!input.historyReference && input.sceneReference.trim()) sources.push({ id: "h0", text: input.sceneReference });
  const context = { world: world ? { name: world.name } : null,
    excerpts: input.historyReference ?? { origin: "visible", partial: true, excerpt: input.sceneReference }, partial: true };
  const instruction = input.draft.field.key === PROFILE_KEY ? characterProfilePrompt(input.draft, sources, input.locale, requestId) : input.draft.field.mode === "history" ? fieldFactsPrompt(input.draft, sources, input.locale, requestId) : characterFieldPrompt(input.draft, memories, input.locale).replace("[DeepRole Service]\n", `[DeepRole Service]\n[Request ID: ${requestId}]\n`);
  const prompt = instruction
    + "\n[Isolated temporary chat]\nThe original conversation is NOT present here. Use only the supplied reference and approved lore. An excerpt may contain out-of-story discussion; do not treat every statement as a played event. Current manually edited profile facts override older descriptions. Never expose protocol keys or source IDs in a character field. Do not continue the story.\n" + (input.draft.field.mode === "history" ? "" : "[World and retrieved context — may be partial]\n" + JSON.stringify(context));
  if (prompt.length > 150_000) throw new Error("invalid-brief");
  return { prompt, partialContext: partialContext || !!input.historyReference || input.scope.chatId !== null, sources };
}
/** Keep the latest visible turns and valid JSON, not the first 12k of a large chat. */
export function fieldSceneReference(story: StoryContinuation): string {
  const turns: StoryContinuation["turns"] = [];
  for (const turn of [...story.turns].reverse()) {
    const next = [turn, ...turns];
    if (JSON.stringify({ partial: true, turns: next }).length > 12000) {
      if (!turns.length) {
        let text = turn.text.slice(-11000);
        while (text && JSON.stringify({ partial: true, turns: [{ role: turn.role, text }] }).length > 12000) text = text.slice(500);
        turns.push({ role: turn.role, text });
      }
      break;
    }
    turns.unshift({ role: turn.role, text: turn.text });
  }
  return JSON.stringify({ partial: true, turns });
}
export function isolatedFieldResult(raw: string, draft: Pick<CharacterTextRequest, "field">, facts?: { requestId: string; sources: FieldSource[] }): string {
  fieldCheck(typeof raw === "string" && !!raw.trim(), "$", "nonempty final text", raw);
  fieldCheck(raw.length <= 20_000, "$", "reply length <=20000", raw);
  if (draft.field.key === PROFILE_KEY) { fieldCheck(!!facts, "$", "fact sources required"); return characterProfileResult(raw, draft, facts.requestId, facts.sources); }
  if (draft.field.mode === "history") { fieldCheck(!!facts, "$", "fact sources required"); return fieldFactsResult(raw, draft, facts.requestId, facts.sources); }
  return draft.field.key === "image-plan" ? JSON.stringify(parseImageScenePlan(raw)) : characterFieldResult(raw, draft.field.maxLength);
}
