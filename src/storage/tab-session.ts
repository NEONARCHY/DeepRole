import type { TabSessionState, TabSessionGuard } from "../core/messages";
import { continuationKey, continuationDraftKey, continuationTargetKey, matchingContinuationDraft } from "../core/continuation-flow";

interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** Background-owned session RAM. Recovery holds only the original user draft,
 * never injected lore; it is not part of the persistent library or backups. */
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
      if (expected && Object.entries(expected).some(([key, value]) => key === "retryContinuationTarget"
        ? continuationTargetKey(previous.retryContinuationTarget) !== continuationTargetKey(value as TabSessionState["retryContinuationTarget"])
        : JSON.stringify((key === "continuationKey" ? continuationKey(previous.continuation) : key === "continuationDraftKey" ? continuationDraftKey(previous.continuationDraft) : key === "serviceId" ? previous.service?.id : key === "characterRequestId" ? previous.characterRequest?.id : previous[key as keyof TabSessionState]) ?? null) !== JSON.stringify(value ?? null))) return { ok: false };
      const next = { ...previous, ...patch };
      if (next.snapshotId !== previous.snapshotId || next.snapshotToken !== previous.snapshotToken || !next.snapshotId) next.continuationOverrides = null;
      if (patch.continuationOverrides && !next.snapshotId) return { ok: false };
      if (patch.continuationDraft && (next.continuationReceipt || !matchingContinuationDraft(patch.continuationDraft, next.snapshotId ?? undefined, next.snapshotToken ?? null, next.retryContinuationTarget))) return { ok: false };
      if (next.continuationDraft && (next.continuationReceipt || !matchingContinuationDraft(next.continuationDraft, next.snapshotId ?? undefined, next.snapshotToken ?? null, next.retryContinuationTarget))) next.continuationDraft = null;
      await this.area.set({ [`deeprole_tab_state_${tabId}`]: next });
      return { ok: true };
    });
  }
  remove(tabId: number) {
    this.closed.add(tabId);
    return this.enqueue(tabId, () => this.area.remove([`deeprole_draft_scene_${tabId}`, `deeprole_tab_state_${tabId}`]));
  }
  /** The same transaction records the verified first turn and the transfer.
   * Keep its proof on failure so retry reads history instead of resending. */
  completeRecoveredSnapshot(tabId: number, snapshotId: string, token: string, targetChatId: string, draftKey: string, commit: (draft: import("../core/continuation-flow").ContinuationDraft, overrides?: import("../core/types").MemoryOverrides) => Promise<void>): Promise<boolean> {
    return this.enqueue(tabId, async () => {
      if (this.closed.has(tabId)) return false;
      const previous = await this.read(tabId);
      const draft = matchingContinuationDraft(previous.continuationDraft, snapshotId, token, previous.retryContinuationTarget);
      if (this.closed.has(tabId) || previous.snapshotId !== snapshotId || previous.snapshotToken !== token || previous.continuationReceipt
        || !draft || draft.targetChatId !== targetChatId || continuationDraftKey(draft) !== draftKey) return false;
      await commit(structuredClone(draft), previous.continuationOverrides ? structuredClone(previous.continuationOverrides) : undefined);
      if (!this.closed.has(tabId)) await this.area.set({ [`deeprole_tab_state_${tabId}`]: { ...previous, continuationOverrides: null, continuationReceipt: null, continuationDraft: null, retryContinuationTarget: null, snapshotId: null, snapshotToken: null, continueOnFreshChat: false, continueUntil: null } });
      return true;
    });
  }
  /** Keep the token guard held while committing the destination library state.
   * A later snapshot cannot slip between a checked read and the branch write.
   */
  completeSnapshot(tabId: number, snapshotId: string, token: string | null, commit: (overrides?: import("../core/types").MemoryOverrides) => Promise<void>, targetChatId?: string, retry = false): Promise<boolean> {
    return this.enqueue(tabId, async () => {
      if (this.closed.has(tabId)) return false;
      const previous = await this.read(tabId);
      if (previous.snapshotId !== snapshotId || (previous.snapshotToken ?? null) !== token || this.closed.has(tabId)) return false;
      const old = previous.continuationReceipt;
      if (retry && (!old || old.snapshotId !== snapshotId || old.snapshotToken !== token || old.targetChatId !== targetChatId)) return false;
      if (targetChatId !== undefined) {
        if (!/^[\w-]{1,120}$/u.test(targetChatId)) throw Error("handoff-invalid");
        if (old?.snapshotId === snapshotId && old.snapshotToken === token && old.targetChatId !== targetChatId) throw Error("handoff-conflict");
        const retryTarget = previous.retryContinuationTarget;
        if (retryTarget?.snapshotId === snapshotId && retryTarget.snapshotToken === token && retryTarget.targetChatId !== targetChatId) throw Error("handoff-conflict");
        // Keep the accepted target if the library transaction fails, so reload
        // can finish locally without another model call.
        await this.area.set({ [`deeprole_tab_state_${tabId}`]: { ...previous, continuationDraft: null, continuationReceipt: { snapshotId, snapshotToken: token, targetChatId } } });
        if (this.closed.has(tabId)) return false;
      }
      await commit(previous.continuationOverrides ? structuredClone(previous.continuationOverrides) : undefined);
      if (this.closed.has(tabId)) return true;
      await this.area.set({ [`deeprole_tab_state_${tabId}`]: { ...previous, ...(targetChatId !== undefined ? { continuationReceipt: null } : {}), continuationOverrides: null, continuationDraft: null, retryContinuationTarget: null, snapshotId: null, snapshotToken: null, continueOnFreshChat: false, continueUntil: null } });
      return true;
    });
  }
  private enqueue<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
    const task = (this.tails.get(tabId) ?? Promise.resolve()).catch(() => undefined).then(operation);
    this.tails.set(tabId, task);
    void task.finally(() => { if (this.tails.get(tabId) === task) this.tails.delete(tabId); }).catch(() => undefined);
    return task;
  }
}
