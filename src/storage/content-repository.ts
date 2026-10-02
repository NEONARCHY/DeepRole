import { browser } from "wxt/browser";
import type { DataRecord, RecordKind, RecordValue } from "../core/types";

export type RepositoryRequest =
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
  rawRecords: () => call<DataRecord[]>({ type: "DR_REPOSITORY", operation: "snapshot" }),
  list: <T extends RecordValue>(kind: RecordKind) => call<T[]>({ type: "DR_REPOSITORY", operation: "list", kind }),
  get: <T extends RecordValue>(kind: RecordKind, id: string) => call<T | null>({ type: "DR_REPOSITORY", operation: "get", kind, id }),
  put: <T extends RecordValue>(kind: "entry" | "binding" | "snapshot" | "proposal", value: T) => call<void>({ type: "DR_REPOSITORY", operation: "put", kind, value }),
  putIfUnchanged: <T extends RecordValue>(kind: "binding" | "snapshot", value: T, expected: T | null) => call<void>({ type: "DR_REPOSITORY", operation: "putChecked", kind, value, expected }),
  isLocked: () => call<boolean>({ type: "DR_REPOSITORY", operation: "isLocked" }),
};
