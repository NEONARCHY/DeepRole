import { browser } from "wxt/browser";
import type { DataRecord, RecordKind, RecordValue } from "../core/types";
import type { CharacterEdit, CharacterScope, CharacterSaveResult } from "./characters";
import type { CharacterTurn } from "../core/characters";
import type { PortraitLayoutEdit } from "./portrait-layout";
import type { ContinuationCapture } from "./story-continuation";
import type { HandoffSnapshot } from "../core/types";

export type RepositoryRequest =
  | { type: "DR_REPOSITORY"; operation: "completeContinuation"; snapshot: HandoffSnapshot; token: string | null; targetChatId: string }
  | { type: "DR_REPOSITORY"; operation: "captureContinuation"; input: ContinuationCapture }
  | { type: "DR_REPOSITORY"; operation: "addCharacterEmotion"; scope: CharacterScope; name: string }
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
  const result = await browser.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error ?? "DeepRole storage unavailable");
  return result.data as T;
}

// IndexedDB in a content script belongs to the website, not the extension.
// All content access is routed to the extension-owned background repository.
export const contentRepository = {
  completeContinuation: (snapshot: HandoffSnapshot, token: string | null, targetChatId: string) => call<boolean>({ type: "DR_REPOSITORY", operation: "completeContinuation", snapshot, token, targetChatId }),
  captureContinuation: (input: ContinuationCapture) => call<HandoffSnapshot>({ type: "DR_REPOSITORY", operation: "captureContinuation", input }),
  addCharacterEmotion: (scope: CharacterScope, name: string) => call<string[]>({ type: "DR_REPOSITORY", operation: "addCharacterEmotion", scope, name }),
  savePortraitLayout: (edit: PortraitLayoutEdit) => call<void>({ type: "DR_REPOSITORY", operation: "savePortraitLayout", edit }),
  saveCharacter: (edit: CharacterEdit) => call<CharacterSaveResult>({ type: "DR_REPOSITORY", operation: "saveCharacter", edit }),
  applyCharacterTurn: (scope: CharacterScope, turn: CharacterTurn) => call<void>({ type: "DR_REPOSITORY", operation: "applyCharacterTurn", scope, turn }),
  rawRecords: () => call<DataRecord[]>({ type: "DR_REPOSITORY", operation: "snapshot" }),
  list: <T extends RecordValue>(kind: RecordKind) => call<T[]>({ type: "DR_REPOSITORY", operation: "list", kind }),
  get: <T extends RecordValue>(kind: RecordKind, id: string) => call<T | null>({ type: "DR_REPOSITORY", operation: "get", kind, id }),
  put: <T extends RecordValue>(kind: "entry" | "binding" | "snapshot" | "proposal", value: T) => call<void>({ type: "DR_REPOSITORY", operation: "put", kind, value }),
  putIfUnchanged: <T extends RecordValue>(kind: "binding" | "snapshot", value: T, expected: T | null) => call<void>({ type: "DR_REPOSITORY", operation: "putChecked", kind, value, expected }),
  isLocked: () => call<boolean>({ type: "DR_REPOSITORY", operation: "isLocked" }),
};
