import { browser } from "wxt/browser";
import { REPOSITORY_PORT, requestJsonPort } from "./repository-stream";
import { isPhotoAddress, mapSheetPhotos } from "../core/photo-assets";
import type { DataRecord, RecordKind, RecordValue } from "../core/types";
import type { CharacterEdit, CharacterScope, CharacterSaveResult } from "./characters";
import type { CharacterTurn } from "../core/characters";
import type { PortraitLayoutEdit } from "./portrait-layout";
import type { ContinuationCapture } from "./story-continuation";
import type { HandoffSnapshot } from "../core/types";
import type { RecoveredReplyEdit } from "./recovered-replies";
import type { StoryDispatchCaptureInput } from "../core/story-dispatch-capture";
import type { NativeStoryReplyQuery } from "../core/story-native-reply";
import type { StoryCheckpointChoice, StoryCheckpointReview, StoryCheckpointScope } from "../core/story-checkpoint";
import type { StoryPreviewInput, StoryReviewInput, StoryReviewPage, StoryReviewPreview } from "../core/story-review";

export type RepositoryRequest =
  | { type: "DR_REPOSITORY"; operation: "readProfileSupplements"; input: import("../core/profile-supplements").SupplementRead; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "approveProfileSupplement"; input: import("../core/profile-supplements").SupplementApproval; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "readCharacterDiscovery"; input: import("../core/story-character-discovery").CharacterDiscoveryRead; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "approveCharacterDiscovery"; input: import("../core/story-character-discovery").CharacterDiscoveryApproval; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "approveStoryFact"; input: import("./story-facts").StoryFactApproval; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "storyGameStatus"; chatId: string; worldId: string; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "runStoryGame"; input: import("../core/story-game").StoryGameInput; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "markNonStoryMessage"; chatId: string; worldId: string; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "readStoryReview"; input: StoryReviewInput; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "previewStoryReview"; input: StoryPreviewInput; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "readStoryCheckpoint"; scope: StoryCheckpointScope; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "saveStoryCheckpoint"; choice: StoryCheckpointChoice; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "pendingDispatchReplies"; chatId: string; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "recordDispatchReply"; result: unknown; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "prepareDispatchCapture"; input: StoryDispatchCaptureInput; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "confirmDispatchCapture"; source: unknown; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "advanceDispatchCapture"; packet: unknown; chatUrl: string }
  | { type: "DR_REPOSITORY"; operation: "readPhoto"; id: string }
  | { type: "DR_REPOSITORY"; operation: "storePhoto"; image: string }
  | { type: "DR_REPOSITORY"; operation: "acknowledgeRecoveredReply"; edit: RecoveredReplyEdit }
  | { type: "DR_REPOSITORY"; operation: "saveRecoveredReply"; edit: RecoveredReplyEdit }
  | { type: "DR_REPOSITORY"; operation: "completeContinuation"; snapshot: HandoffSnapshot; token: string | null; targetChatId: string }
  | { type: "DR_REPOSITORY"; operation: "captureContinuation"; input: ContinuationCapture }
  | { type: "DR_REPOSITORY"; operation: "addCharacterAction"; scope: CharacterScope; name: string }
  | { type: "DR_REPOSITORY"; operation: "savePortraitLayout"; edit: PortraitLayoutEdit }
  | { type: "DR_REPOSITORY"; operation: "saveCharacter"; edit: CharacterEdit }
  | { type: "DR_REPOSITORY"; operation: "applyCharacterTurn"; scope: CharacterScope; turn: CharacterTurn }
  | { type: "DR_REPOSITORY"; operation: "snapshot" }
  | { type: "DR_REPOSITORY"; operation: "list"; kind: RecordKind }
  | { type: "DR_REPOSITORY"; operation: "get"; kind: RecordKind; id: string }
  | { type: "DR_REPOSITORY"; operation: "put"; kind: "entry" | "binding" | "snapshot" | "proposal"; value: RecordValue }
  | { type: "DR_REPOSITORY"; operation: "putChecked"; kind: "binding" | "snapshot"; value: RecordValue; expected: RecordValue | null }
  | { type: "DR_REPOSITORY"; operation: "isLocked" };

async function call<T>(message: RepositoryRequest): Promise<T> {
  const result = await requestJsonPort<{ ok?: boolean; error?: string; data?: T }>(browser.runtime.connect({ name: REPOSITORY_PORT }), message);
  if (!result?.ok) throw new Error(result?.error ?? "DeepRole storage unavailable");
  return result.data as T;
}

// IndexedDB in a content script belongs to the website, not the extension.
// All content access is routed to the extension-owned background repository.
export const contentRepository = {
  readProfileSupplements: (input: import("../core/profile-supplements").SupplementRead, chatUrl: string) => call<import("../core/profile-supplements").SupplementPage>({ type: "DR_REPOSITORY", operation: "readProfileSupplements", input, chatUrl }),
  approveProfileSupplement: (input: import("../core/profile-supplements").SupplementApproval, chatUrl: string) => call<{ entityId: string; applied: number; skipped: import("../core/character-profile").ProfileField[] }>({ type: "DR_REPOSITORY", operation: "approveProfileSupplement", input, chatUrl }),
  readCharacterDiscovery: (input: import("../core/story-character-discovery").CharacterDiscoveryRead, chatUrl: string) => call<import("../core/story-character-discovery").CharacterDiscoveryPage>({ type: "DR_REPOSITORY", operation: "readCharacterDiscovery", input, chatUrl }),
  approveCharacterDiscovery: (input: import("../core/story-character-discovery").CharacterDiscoveryApproval, chatUrl: string) => call<{ active: boolean; changed: boolean }>({ type: "DR_REPOSITORY", operation: "approveCharacterDiscovery", input, chatUrl }),
  approveStoryFact: (input: import("./story-facts").StoryFactApproval, chatUrl: string) => call<{ active: boolean; changed: boolean }>({ type: "DR_REPOSITORY", operation: "approveStoryFact", input, chatUrl }),
  storyGameStatus: (chatId: string, worldId: string, chatUrl: string) => call<boolean>({ type: "DR_REPOSITORY", operation: "storyGameStatus", chatId, worldId, chatUrl }),
  runStoryGame: (input: import("../core/story-game").StoryGameInput, chatUrl: string) => call<import("../core/story-game").StoryGameOutcome>({ type: "DR_REPOSITORY", operation: "runStoryGame", input, chatUrl }),
  markNonStoryMessage: (chatId: string, worldId: string, chatUrl: string) => call<{ active: boolean; changed: boolean; marked: boolean }>({ type: "DR_REPOSITORY", operation: "markNonStoryMessage", chatId, worldId, chatUrl }),
  readStoryReview: (input: StoryReviewInput, chatUrl: string) => call<StoryReviewPage>({ type: "DR_REPOSITORY", operation: "readStoryReview", input, chatUrl }),
  previewStoryReview: (input: StoryPreviewInput, chatUrl: string) => call<StoryReviewPreview>({ type: "DR_REPOSITORY", operation: "previewStoryReview", input, chatUrl }),
  readStoryCheckpoint: (scope: StoryCheckpointScope, chatUrl: string) => call<StoryCheckpointReview>({ type: "DR_REPOSITORY", operation: "readStoryCheckpoint", scope, chatUrl }),
  saveStoryCheckpoint: (choice: StoryCheckpointChoice, chatUrl: string) => call<{ branchId: string }>({ type: "DR_REPOSITORY", operation: "saveStoryCheckpoint", choice, chatUrl }),
  pendingDispatchReplies: (chatId: string, chatUrl: string) => call<NativeStoryReplyQuery[]>({ type: "DR_REPOSITORY", operation: "pendingDispatchReplies", chatId, chatUrl }),
  recordDispatchReply: (result: unknown, chatUrl: string) => call<void>({ type: "DR_REPOSITORY", operation: "recordDispatchReply", result, chatUrl }),
  prepareDispatchCapture: (input: StoryDispatchCaptureInput, chatUrl: string) => call<void>({ type: "DR_REPOSITORY", operation: "prepareDispatchCapture", input, chatUrl }),
  confirmDispatchCapture: (source: unknown, chatUrl: string) => call<void>({ type: "DR_REPOSITORY", operation: "confirmDispatchCapture", source, chatUrl }),
  advanceDispatchCapture: (packet: unknown, chatUrl: string) => call<void>({ type: "DR_REPOSITORY", operation: "advanceDispatchCapture", packet, chatUrl }),
  storePhoto: (image: string) => call<string>({ type: "DR_REPOSITORY", operation: "storePhoto", image }),
  readPhoto: (id: string) => call<string>({ type: "DR_REPOSITORY", operation: "readPhoto", id }),
  acknowledgeRecoveredReply: (edit: RecoveredReplyEdit) => call<void>({ type: "DR_REPOSITORY", operation: "acknowledgeRecoveredReply", edit }),
  saveRecoveredReply: (edit: RecoveredReplyEdit) => call<void>({ type: "DR_REPOSITORY", operation: "saveRecoveredReply", edit }),
  completeContinuation: (snapshot: HandoffSnapshot, token: string | null, targetChatId: string) => call<boolean>({ type: "DR_REPOSITORY", operation: "completeContinuation", snapshot, token, targetChatId }),
  captureContinuation: (input: ContinuationCapture) => call<HandoffSnapshot>({ type: "DR_REPOSITORY", operation: "captureContinuation", input }),
  addCharacterAction: (scope: CharacterScope, name: string) => call<string[]>({ type: "DR_REPOSITORY", operation: "addCharacterAction", scope, name }),
  savePortraitLayout: (edit: PortraitLayoutEdit) => call<void>({ type: "DR_REPOSITORY", operation: "savePortraitLayout", edit }),
  saveCharacter: async (edit: CharacterEdit) => {
    const store = (image: string) => isPhotoAddress(image) ? Promise.resolve(image) : call<string>({ type: "DR_REPOSITORY", operation: "storePhoto", image });
    let sheet = await mapSheetPhotos(edit.sheet, store);
    let original = edit.original ? { ...edit.original, sheet: await mapSheetPhotos(edit.original.sheet, store) } : undefined;
    // Missing on both sides means "not edited" to the existing three-way merge.
    // Do not ship even an immutable-address collection when it is unchanged.
    if (original) {
      const baseline = { ...original.sheet };
      sheet = { ...sheet };
      if (JSON.stringify(sheet.sprites) === JSON.stringify(baseline.sprites)) { sheet.sprites = {}; baseline.sprites = {}; }
      for (const field of ["portraitLibrary", "selfieCategories"] as const) {
        if (JSON.stringify(sheet[field]) === JSON.stringify(baseline[field])) { delete sheet[field]; delete baseline[field]; }
      }
      original = { ...original, sheet: baseline };
    }
    return call<CharacterSaveResult>({ type: "DR_REPOSITORY", operation: "saveCharacter", edit: { ...edit, sheet, ...(original ? { original } : {}) } });
  },
  applyCharacterTurn: (scope: CharacterScope, turn: CharacterTurn) => call<void>({ type: "DR_REPOSITORY", operation: "applyCharacterTurn", scope, turn }),
  rawRecords: () => call<DataRecord[]>({ type: "DR_REPOSITORY", operation: "snapshot" }),
  list: <T extends RecordValue>(kind: RecordKind) => call<T[]>({ type: "DR_REPOSITORY", operation: "list", kind }),
  get: <T extends RecordValue>(kind: RecordKind, id: string) => call<T | null>({ type: "DR_REPOSITORY", operation: "get", kind, id }),
  put: <T extends RecordValue>(kind: "entry" | "binding" | "snapshot" | "proposal", value: T) => call<void>({ type: "DR_REPOSITORY", operation: "put", kind, value }),
  putIfUnchanged: <T extends RecordValue>(kind: "binding" | "snapshot", value: T, expected: T | null) => call<void>({ type: "DR_REPOSITORY", operation: "putChecked", kind, value, expected }),
  isLocked: () => call<boolean>({ type: "DR_REPOSITORY", operation: "isLocked" }),
};
