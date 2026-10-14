import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import type { CastMessage, CastView } from "../../adapters/cast-coordinator";

export const sendCastMessage = (message: CastMessage): Promise<any> => browser.runtime.sendMessage(message);

/** Read saved work even when its dialog is closed; never start or apply a reset. */
export function useWorldResetJob(worldId: string, send = sendCastMessage) {
  const [value, setValue] = useState<{ worldId: string; job: CastView | null; failed: boolean }>();
  const refresh = useCallback(async () => {
    const result = await send({ type: "DR_CAST", action: "status", worldId, reset: true });
    if (!result?.ok) throw Error(result?.error ?? "failed");
    return (result.job ?? null) as CastView | null;
  }, [worldId, send]);
  useEffect(() => {
    let disposed = false, pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try { const job = await refresh(); if (!disposed) setValue(old => {
        if(old?.worldId===worldId&&old.job&&job&&(old.job.createdAt>job.createdAt||old.job.id===job.id&&old.job.updatedAt>job.updatedAt))return old;
        return { worldId, job, failed: false };
      }); }
      catch { if (!disposed) setValue(old => ({ worldId, job: old?.worldId === worldId ? old.job : null, failed: true })); }
      finally { pending = false; }
    };
    void update();
    const timer = setInterval(() => { if (!document.hidden) void update(); }, 2500);
    const visible = () => { if (!document.hidden) void update(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [worldId, refresh]);
  return { job: value?.worldId === worldId ? value.job : null, loaded: value?.worldId === worldId, failed: value?.worldId === worldId && value.failed, refresh,
    setJob: (job: CastView | null) => setValue({ worldId, job, failed: false }) };
}
