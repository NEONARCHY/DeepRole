/** Bound a read without cancelling its promise or leaving a timer behind. */
export function startupDeadline<T>(task: Promise<T>, milliseconds = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup-timeout")), milliseconds);
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
