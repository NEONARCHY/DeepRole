// Serialize native window reservations across coordinators, not the model generation.
// The worker can still report progress and cleanup while a start is being validated.
let tail: Promise<unknown> = Promise.resolve();
export function nativeStartLane<T>(work: () => Promise<T>): Promise<T> {
 const result = tail.catch(() => undefined).then(work); tail = result.catch(() => undefined); return result;
}
