// All extension windows and the worker share one origin and vault configuration.
// Encrypting a snapshot outside an IDB transaction must not race a library edit.
const fallbackTails = new Map<string, Promise<unknown>>();
const LOCK_NAME = "deeprole-library-vault";

export async function withLibraryLock<T>(mode: "shared" | "exclusive", operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, { mode }, operation);
  }
  // Unit tests / non-browser previews have no Web Locks. Coordinate all repository
  // instances in that runtime; supported browsers use the cross-window lock above.
  const previous = fallbackTails.get(LOCK_NAME) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  fallbackTails.set(LOCK_NAME, task);
  void task.finally(() => { if (fallbackTails.get(LOCK_NAME) === task) fallbackTails.delete(LOCK_NAME); }).catch(() => undefined);
  return task;
}
