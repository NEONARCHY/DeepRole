// All extension windows and the worker share one origin and vault configuration.
// Encrypting a snapshot outside an IDB transaction must not race a library edit.
const fallbackTails = new Map<string, Promise<unknown>>();
const LOCK_NAME = "deeprole-library-vault";

export async function withLibraryLock<T>(mode: "shared" | "exclusive", operation: () => Promise<T>): Promise<T> {
  return withNamedLock(LOCK_NAME, mode, operation);
}

export async function withNamedLock<T>(name: string, mode: "shared" | "exclusive", operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(name, { mode }, operation);
  }
  // Unit tests / non-browser previews have no Web Locks. Coordinate all repository
  // instances in that runtime; supported browsers use the cross-window lock above.
  const previous = fallbackTails.get(name) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  fallbackTails.set(name, task);
  void task.finally(() => { if (fallbackTails.get(name) === task) fallbackTails.delete(name); }).catch(() => undefined);
  return task;
}
