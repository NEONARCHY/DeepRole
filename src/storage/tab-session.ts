import type { TabSessionState, TabSessionGuard } from "../core/messages";

interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** Only the background worker owns the per-tab session metadata. No lore text. */
export class TabSessionStore {
  private readonly tails = new Map<number, Promise<unknown>>();
  private readonly closed = new Set<number>();
  constructor(private readonly area: SessionArea) {}
  private async read(tabId: number): Promise<TabSessionState> {
    const key = `deeprole_tab_state_${tabId}`;
    return (await this.area.get(key))[key] as TabSessionState ?? {};
  }
  get(tabId: number): Promise<TabSessionState> {
    return this.enqueue(tabId, () => this.closed.has(tabId) ? Promise.resolve({}) : this.read(tabId));
  }
  patch(tabId: number, patch: TabSessionState, expected?: TabSessionGuard): Promise<{ ok: boolean }> {
    return this.enqueue(tabId, async () => {
      if (this.closed.has(tabId)) return { ok: false };
      const previous = await this.read(tabId);
      if (this.closed.has(tabId)) return { ok: false };
      if (expected && Object.entries(expected).some(([key, value]) => JSON.stringify((key === "serviceId" ? previous.service?.id : key === "characterRequestId" ? previous.characterRequest?.id : previous[key as keyof TabSessionState]) ?? null) !== JSON.stringify(value ?? null))) return { ok: false };
      await this.area.set({ [`deeprole_tab_state_${tabId}`]: { ...previous, ...patch } });
      return { ok: true };
    });
  }
  remove(tabId: number) {
    this.closed.add(tabId);
    return this.enqueue(tabId, () => this.area.remove([`deeprole_draft_scene_${tabId}`, `deeprole_tab_state_${tabId}`]));
  }
  private enqueue<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
    const task = (this.tails.get(tabId) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.tails.set(tabId, task);
    void task.finally(() => { if (this.tails.get(tabId) === task) this.tails.delete(tabId); }).catch(() => undefined);
    return task;
  }
}
