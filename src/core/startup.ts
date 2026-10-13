/** Bound a read without cancelling its promise or leaving a timer behind. */
export function startupDeadline<T>(task: Promise<T>, milliseconds = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup-timeout")), milliseconds);
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** One deadline across startup phases. Late phases must check active before
 * applying results or starting another read; callers invalidate in-flight loads. */
export async function startupBudget<T>(work: (active: () => boolean) => Promise<T>, milliseconds = 8000): Promise<T> {
  let active = true;
  try { return await startupDeadline(Promise.resolve().then(() => work(() => active)), milliseconds); }
  finally { active = false; }
}
