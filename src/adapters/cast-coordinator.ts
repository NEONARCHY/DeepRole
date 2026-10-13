import { browser } from "wxt/browser";
import { nativeStartLane } from "./native-start-lane";
import { FIELD_OWNERS_KEY } from "../core/isolated-character-text";
import { repository, type DeepRoleRepository } from "../storage/repository";
import { createCastJob, mutateCastJob, acceptCastReply, applyCastDraft } from "../storage/cast-initialization";
import { castDiagnostic, castParts, castPrompt, parseCastDraft, type CastDraft, type CastJob } from "../core/cast-initialization";
import { interruptedCastJob, parseCastBatch } from "../core/cast-batches";
import type { Locale, WorldProfile } from "../core/types";
import { getSettings } from "../storage/settings";
import { isReplacedReply } from "../core/reply-recovery";
import { castChatLink, castChatReference } from "../core/cast-chat";
import { castServiceProgress } from "../core/cast-service";
import { validServiceOperation, type ServiceOperation, type ServiceOperationProgress } from "../core/service-operations";
import { nextServicePending, servicePending } from "../core/service-outbox";
import { beginCastServiceOperation } from "../storage/service-operations";
import { ServiceAuditOutbox } from "../storage/service-outbox";
import { reconcileCastServiceJobs } from "../storage/cast-service";
import { recordCastServiceValidation } from "../storage/service-validation";
import { acceptLargeCastReply } from "../core/cast-large-lore";
import type { WorldResetRequest } from "../core/world-reset";
import { confirmWorldReset, applyWorldReset } from "../storage/world-reset";
import {parseResetEntryReply} from "../core/world-reset-entries";

export type CastMessage =
 | { type: "DR_CAST"; action: "start"; worldId: string; locale: Locale; retry?: boolean; restart?: boolean; reset?: WorldResetRequest }
 | { type: "DR_CAST"; action: "status"; worldId: string; reset?: boolean }
 | { type: "DR_CAST"; action: "confirm-reset"; id: string; draft: CastDraft; entries: string[] }
 | { type: "DR_CAST"; action: "apply-reset"; id: string; token: string; worldName: string }
 | { type: "DR_CAST"; action: "open-reset-chat"; id: string }
 | { type: "DR_CAST"; action: "apply"; id: string; draft: CastDraft; selected: string[]; hero: string }
 | { type: "DR_CAST"; action: "cancel" | "cleanup" | "hide" | "show" | "confirm-cleanup" | "open"; id: string }
 | { type: "DR_CAST_WORKER"; action: "claim"; id?: string }
 | { type: "DR_CAST_WORKER"; action: "reasoning"; id: string; status: "enabled" | "unavailable" | "unverified"; changed:boolean }
 | { type: "DR_CAST_WORKER"; action: "sent"; id: string; step: number }
 | { type: "DR_CAST_WORKER"; action: "bound"; id: string; chatId: string }
 | { type: "DR_CAST_WORKER"; action: "reply"; id: string; step: number; chatId: string; raw: string; repair?: boolean }
 | { type: "DR_CAST_WORKER"; action: "checkpoint"; id: string; step: number; repair: boolean; chatId: string; replyIdentity: string; raw: string }
 | { type: "DR_CAST_WORKER"; action: "error"; id: string; error: string; chatId?: string }
 | { type: "DR_CAST_WORKER"; action: "authorize-cleanup"; id: string; chatId?: string }
 | { type: "DR_CAST_WORKER"; action: "cleaned"; id: string; chatId?: string; ok: boolean }
 | { type: "DR_CAST_RETRY_CLEANUP" }
 | { type: "DR_CAST_REVEAL" };
export type CastView = Omit<CastJob, "sources" | "signature" | "resetGuard" | "replyCheckpoint" | "large"> & { sourceCount: number; partCount: number; titles: Record<string,string>; large?: Omit<NonNullable<CastJob["large"]>, "candidates"> & { found: number } };
interface Ownership { id: string; tabId: number; chatId?: string; audit?: ServiceOperationProgress }
const OWNERS = "deeprole_cast_owners";
const active = (job: CastJob) => ["opening", "reading", "analyzing"].includes(job.phase);
export function castView(job: CastJob): CastView {
  const { sources, signature: _signature, resetGuard:_resetGuard, replyCheckpoint: _checkpoint, large, ...rest } = job;
  return { ...rest, sourceCount: sources.length, partCount: large ? 0 : sources.length ? castParts(sources).length : 0, titles: Object.fromEntries(sources.map(s => [s.id, s.title])), ...(large ? { large: { stage: large.stage, source: large.source, offset: large.offset, prepared: large.prepared, found: large.candidates.length } } : {}) };
}
export class CastCoordinator {
  private starts: Promise<unknown> = Promise.resolve();
  private resetNavigation:Promise<unknown>=Promise.resolve();
  private ownershipWrites: Promise<unknown> = Promise.resolve();
  private auditSnapshots = new Map<string, string>();
  private knownAudits = new Set<string>();
  private outbox: ServiceAuditOutbox;
  private reconciliation: Promise<unknown> = Promise.resolve();
  constructor(private repo: DeepRoleRepository = repository, private api = browser) { this.outbox = new ServiceAuditOutbox(repo, api.storage.local); }
  private async audit(job: CastJob) {
    const progress = castServiceProgress(job), { at: _at, ...state } = progress, snapshot = JSON.stringify(state);
    try {
      if (!this.knownAudits.has(job.id)) {
        const previous = await this.repo.get<ServiceOperation>("service", job.id);
        // Never backfill old/foreign jobs or resurrect an imported operation.
        if (!previous || previous.operation !== "cast-preparation" || previous.origin !== "local") return;
        this.knownAudits.add(job.id);
      }
      await this.remember(job.id, progress);
      // A repair can add a validation error without changing the coarse stage.
      // Keep it separately; failed diagnostic storage cannot block coarse audit.
      await recordCastServiceValidation(job.id, this.repo).catch(() => undefined);
      if (this.auditSnapshots.get(job.id) === snapshot) return;
      if (await this.outbox.record(job.id, progress) !== "discarded") this.auditSnapshots.set(job.id, snapshot);
    } catch { /* Durable CastJob still retains progress; reconciliation never sends. */ }
  }
  reconcilePending() {
    const work = async () => {
      const owners = await this.owners();
      for (const own of owners) if (own.audit) await this.outbox.record(own.id, own.audit).catch(() => undefined);
      const hints = new Map(owners.filter(o => o.chatId).map(o => [o.id, o.chatId!]));
      if (!await this.repo.isLocked()) for (const job of await this.repo.list<CastJob>("cast")) if (job.chatId) {
        const audit = await this.repo.get<ServiceOperation>("service", job.id);
        if (validServiceOperation(audit) && audit.operation === "cast-preparation" && audit.origin === "local" && audit.worldId === job.worldId && audit.createdAt === job.createdAt
          && (audit.workerChatId === null || audit.workerChatId === job.chatId)) hints.set(job.id, job.chatId);
      }
      await this.outbox.flush(hints);
      if (!await this.repo.isLocked()) {
        await reconcileCastServiceJobs(this.repo);
        for (const job of await this.repo.list<CastJob>("cast")) await this.audit(job);
      }
      return this.outbox.flush(hints);
    };
    const next = this.reconciliation.then(work, work); this.reconciliation = next.catch(() => undefined); return next;
  }
  private async owners(): Promise<Ownership[]> { return ((await this.api.storage.session.get(OWNERS))[OWNERS] as Ownership[] | undefined) ?? []; }
  private async owner(id: string, tabId?: number) { return (await this.owners()).find(o => o.id === id && (tabId === undefined || o.tabId === tabId)); }
  private changeOwners(change: (owners: Ownership[]) => Ownership[]) {
    const write = async () => this.api.storage.session.set({ [OWNERS]: change(await this.owners()) });
    const next = this.ownershipWrites.then(write, write); this.ownershipWrites = next.catch(() => undefined); return next;
  }
  private async setOwner(owner: Ownership) { await this.changeOwners(owners => [...owners.filter(o => o.id !== owner.id), owner]); }
  private remember(id: string, progress: ServiceOperationProgress) {
    servicePending(id, progress); // Validate fixed metadata; never copy arbitrary worker text.
    return this.changeOwners(owners => owners.map(own => {
      if (own.id !== id) return own;
      if (progress.workerChatId !== (own.chatId ?? null)) throw new Error("chat-changed");
      if (own.audit && !nextServicePending(servicePending(id, own.audit), servicePending(id, progress))) throw new Error("stale-step");
      return { ...own, audit: structuredClone(progress) };
    }));
  }
  private terminal(own: Ownership, error: string): ServiceOperationProgress {
    if (!own.audit) throw new Error("cleanup-unavailable");
    servicePending(own.id, own.audit);
    return { ...own.audit, ...(["prepared", "dispatching"].includes(own.audit.phase) ? { phase: "failed" as const, error } : {}), at: Math.max(Date.now(), own.audit.at) };
  }
  async cancelLocked() {
    if (!await this.repo.isLocked()) return;
    for (const own of await this.owners()) {
      if (!own.audit || own.audit.cleanup === "done") continue;
      const progress = this.terminal(own, "vault-locked");
      await this.remember(own.id, progress);
      await this.outbox.record(own.id, progress).catch(() => undefined);
      await this.api.tabs.sendMessage(own.tabId, { type: "DR_CAST_RETRY_CLEANUP" }).catch(() => undefined);
    }
  }
  async removed(tabId: number) {
    const owner = (await this.owners()).find(o => o.tabId === tabId);
    if (!owner) return;
    if (await this.repo.isLocked()) {
      if (!owner.audit) return;
      const progress = this.terminal(owner, "tab-closed");
      // A missing tab is not proof that its native conversation was deleted.
      if (progress.cleanup !== "done") progress.cleanup = owner.chatId || owner.audit?.phase !== "prepared" ? "failed" : "done";
      await this.remember(owner.id, progress);
      await this.outbox.record(owner.id, progress).catch(() => undefined);
      return; // Retain the binding in session until it can reach the journal.
    }
    await this.reconcilePending().catch(() => undefined);
    const job = await mutateCastJob(owner.id, j => j.cleanup === "done" ? j : { ...(active(j) ? interruptedCastJob(j, "tab-closed") : j), cleanup: j.chatId || j.awaiting || j.step > 0 ? "failed" : "none" }, this.repo).catch(() => undefined);
    if (job) await this.audit(job);
    await this.changeOwners(owners => owners.filter(o => o.tabId !== tabId));
  }
  private async closeCleanedTab(own: Ownership) {
    if (!await this.owner(own.id, own.tabId)) return;
    const latest = await this.api.tabs.get(own.tabId).catch(() => undefined);
    if (latest?.url && new URL(latest.url).origin === "https://chat.deepseek.com" && new URL(latest.url).pathname === "/") await this.api.tabs.remove(own.tabId);
  }
  private async trusted(message: CastMessage, sender: { id?: string; url?: string; tab?: { id?: number }; frameId?: number }) {
    if (sender.id !== this.api.runtime.id) throw new Error("untrusted");
    if (message.type === "DR_CAST_WORKER") {
      if (sender.frameId !== undefined && sender.frameId !== 0) throw new Error("unowned-tab");
      const owners = await this.owners(), own = owners.find(o => o.tabId === sender.tab?.id && (!("id" in message) || !message.id || o.id === message.id));
      if (!own || !sender.url?.startsWith("https://chat.deepseek.com/")) throw new Error("unowned-tab");
      const tab = await this.api.tabs.get(own.tabId);
      if (!tab.url?.startsWith("https://chat.deepseek.com/")) throw new Error("unowned-tab");
      return own;
    }
    if (!sender.url?.startsWith(this.api.runtime.getURL("")) && !sender.url?.startsWith("https://chat.deepseek.com/")) throw new Error("untrusted");
    return undefined;
  }
  async handle(message: CastMessage, sender: { id?: string; url?: string; tab?: { id?: number }; frameId?: number }): Promise<unknown> {
    try {
      const own = await this.trusted(message, sender);
      const locked = await this.repo.isLocked();
      if (message.type === "DR_CAST_WORKER" && own && (locked || message.action === "authorize-cleanup")) {
        const tab = await this.api.tabs.get(own.tabId), currentId = castChatReference(tab.url)?.id;
        if (message.action === "claim" && locked && own.audit) return { ok: true, id: own.id, chatId: own.chatId, phase: "error", prompt: "", cleanupOnly: true };
        if (message.action !== "authorize-cleanup" && message.action !== "cleaned") throw new Error("vault-locked");
        if (message.chatId !== own.chatId || message.action === "authorize-cleanup" && (currentId !== own.chatId || !own.chatId && new URL(tab.url!).pathname !== "/")) throw new Error("chat-changed");
        if (message.action === "cleaned" && (typeof message.ok !== "boolean" || message.ok && (currentId || new URL(tab.url!).pathname !== "/"))) throw new Error("chat-changed");
        if (!locked) {
          const job = await this.repo.get<CastJob>("cast", own.id);
          if (job && active(job)) await this.audit(await mutateCastJob(job.id, j => interruptedCastJob(j, "interrupted"), this.repo));
          else if (job) await this.audit(job);
        }
        const latest = await this.owner(own.id, own.tabId);
        if (!latest) throw new Error("unowned-tab");
        const progress = this.terminal(latest, locked ? "vault-locked" : "interrupted");
        if (message.action === "cleaned") progress.cleanup = message.ok ? "done" : "failed";
        await this.remember(own.id, progress);
        await this.outbox.record(own.id, progress);
        if (message.action === "cleaned" && message.ok) await this.closeCleanedTab(own);
        return { ok: true, chatId: own.chatId };
      }
      if (locked) throw new Error("vault-locked");
      if (message.type === "DR_CAST_WORKER" && own) {
        const job = await this.repo.get<CastJob>("cast", own.id);
        const tab = await this.api.tabs.get(own.tabId);
        const currentChat = castChatReference(tab.url), currentId = currentChat?.id;
        if (own.chatId && currentId !== own.chatId && message.action !== "cleaned") throw new Error("chat-changed");
        if (!job) {
          if (message.action === "cleaned" && message.ok && !currentId && (!message.chatId || message.chatId === own.chatId) && await this.owner(own.id, own.tabId)) {
            const latest = await this.api.tabs.get(own.tabId).catch(() => undefined);
            if (latest?.url && new URL(latest.url).origin === "https://chat.deepseek.com" && new URL(latest.url).pathname === "/") await this.api.tabs.remove(own.tabId);
            return { ok: true };
          }
          throw new Error("job-missing");
        }
        // A terminal session marker blocks late results while delivery to the
        // protected job is pending. Unlock/reload is never permission to resume.
        if (active(job) && own.audit && ["result", "failed"].includes(own.audit.phase)) {
          if (message.action === "claim") return { ok: true, id: own.id, chatId: own.chatId, phase: "error", prompt: "", cleanupOnly: true };
          if (message.action !== "cleaned") throw new Error("stale-step");
        }
        if (message.action === "claim") return { ok: true, id: job.id, locale: job.locale, phase: job.phase, step: job.step, awaiting: job.awaiting, prompt: active(job) ? castPrompt(job) : "", chatId: own.chatId, repair: job.repair, reasoningChanged:job.reasoningChanged, replyCheckpoint: job.replyCheckpoint?.step === job.step && job.replyCheckpoint.repair === job.repair && job.replyCheckpoint.chatId === own.chatId ? job.replyCheckpoint : undefined };
        if (message.action === "reasoning") {
          if (!active(job) || job.awaiting || typeof message.changed !== "boolean" || !["enabled", "unavailable", "unverified"].includes(message.status)) throw new Error("stale-step");
          await mutateCastJob(job.id, j => ({ ...j, reasoning: message.status, reasoningChanged:!!j.reasoningChanged || message.changed }), this.repo);
        } else if (message.action === "bound") {
          if (!job.awaiting || !message.chatId || currentId !== message.chatId || own.chatId && own.chatId !== message.chatId) throw new Error("chat-changed");
          await this.setOwner({ ...own, chatId: message.chatId });
          await this.audit(await mutateCastJob(job.id, j => ({ ...j, chatId: message.chatId, chatUrl: currentChat!.url }), this.repo));
        } else if (message.action === "sent") {
          if (job.step !== message.step || job.awaiting || !active(job)) throw new Error("stale-step");
          await this.audit(await mutateCastJob(job.id, j => ({ ...j, phase: j.large ? j.large.stage === "scan" ? "reading" : "analyzing" : j.step < castParts(j.sources).length ? "reading" : "analyzing", awaiting: true, replyCheckpoint: undefined }), this.repo));
        } else if (message.action === "checkpoint") {
          if (own.chatId !== message.chatId || currentId !== message.chatId) throw new Error("chat-changed");
          if (!active(job) || !job.awaiting || job.step !== message.step || job.repair !== message.repair || !job.large && job.step < castParts(job.sources).length) throw new Error("stale-step");
          if (typeof message.replyIdentity !== "string" || message.replyIdentity.length > 512 || typeof message.raw !== "string") throw new Error("invalid-result");
          let identity: unknown; try { identity = JSON.parse(message.replyIdentity); } catch { throw new Error("invalid-result"); }
          if (!Array.isArray(identity) || identity.length !== 2 || !["message", "virtual"].includes(identity[0]) || typeof identity[1] !== "string" || !identity[1]) throw new Error("invalid-result");
          // Checkpoints can contain a complete batch or finished character objects.
          // Missing batch completion does not authorize another request.
          if(job.reset?.entryOffset!==undefined&&job.reset.entryOffset<job.reset.entries.length)parseResetEntryReply(job,message.raw);
          else if (job.large) acceptLargeCastReply(job, message.raw);
          else if (job.batchSize) parseCastBatch(message.raw, job.id, job.sources, job.batchSize, job.draft);
          else parseCastDraft(message.raw, job.id, job.sources);
          await mutateCastJob(job.id, j => {
            if (!active(j) || !j.awaiting || j.step !== message.step || j.repair !== message.repair) throw new Error("stale-step");
            return { ...j, replyCheckpoint: { step: message.step, repair: message.repair, chatId: message.chatId, replyIdentity: message.replyIdentity, raw: message.raw } };
          }, this.repo);
        } else if (message.action === "reply") {
          if (job.repair !== (message.repair ?? false)) throw new Error("stale-step");
          if (!/^[\w-]{1,120}$/u.test(message.chatId) || currentId !== message.chatId || own.chatId && own.chatId !== message.chatId) throw new Error("chat-changed");
          if (typeof message.raw !== "string" || !message.raw.trim() || message.raw.length > 180000 || isReplacedReply(message.raw)) throw new Error("model-refusal");
          await this.setOwner({ ...own, chatId: message.chatId });
          await mutateCastJob(job.id, j => ({ ...j, chatId: message.chatId, chatUrl: currentChat!.url }), this.repo);
          await this.audit(await acceptCastReply(job.id, message.step, message.raw, this.repo));
        } else if (message.action === "error") {
          if (active(job) && job.awaiting && job.replyCheckpoint?.step === job.step && job.replyCheckpoint.chatId === own.chatId && job.replyCheckpoint.repair === job.repair) await acceptCastReply(job.id, job.step, job.replyCheckpoint.raw, this.repo).catch(() => undefined);
          if (message.chatId && currentId === message.chatId && job.awaiting && (!own.chatId || own.chatId === message.chatId)) {
            await this.setOwner({ ...own, chatId: message.chatId });
            await mutateCastJob(job.id, j => ({ ...j, chatId: message.chatId, chatUrl: currentChat!.url }), this.repo);
          }
          await this.audit(await mutateCastJob(job.id, j => active(j) ? { ...castDiagnostic(j, message.error, [], {stage:"worker"}), phase: "error", error: message.error.slice(0,80), awaiting: false } : j, this.repo));
        } else if (message.action === "cleaned") {
          if (message.chatId && message.chatId !== own.chatId) throw new Error("chat-changed");
          if (typeof message.ok !== "boolean") throw new Error("invalid-request");
          if (message.ok && (currentId || new URL(tab.url!).pathname !== "/")) throw new Error("chat-changed");
          if (job.cleanup === "done" && message.ok) { await this.closeCleanedTab(own); return { ok: true }; }
          await this.audit(await mutateCastJob(job.id, j => {
            if (j.cleanup === "done") throw new Error("cleanup-finished");
            return { ...(active(j) ? interruptedCastJob(j, "interrupted") : j), cleanup: message.ok ? "done" : "failed" };
          }, this.repo));
          if (message.ok && await this.owner(job.id, own.tabId)) {
            const latest = await this.api.tabs.get(own.tabId).catch(() => undefined);
            if (latest?.url && new URL(latest.url).origin === "https://chat.deepseek.com" && new URL(latest.url).pathname === "/") await this.api.tabs.remove(own.tabId);
          }
          if (message.ok && job.phase === "ready" && job.large && job.large.stage !== "done") {
            try {
              if (await this.api.tabs.get(own.tabId).catch(() => undefined)) throw Error("user-interrupted");
              const next = () => this.start(job.worldId, job.locale, true, undefined, job.id);
              const work = this.starts.then(next, next); this.starts = work.catch(() => undefined); await work;
            } catch (error) {
              const code = error instanceof Error ? error.message : "interrupted";
              const stopped = await mutateCastJob(job.id, j => j.phase === "ready" ? { ...j, phase: "error", error: code } : j, this.repo).catch(() => undefined);
              if (stopped) await this.audit(stopped);
            }
          }
        }
        return { ok: true };
      }
      if (message.type !== "DR_CAST") return { ok: false };
      if((message.action==="start"&&message.reset||["confirm-reset","apply-reset","open-reset-chat"].includes(message.action))&&!sender.url?.startsWith(this.api.runtime.getURL("")))throw Error("untrusted");
      if(message.action==="confirm-reset")return {ok:true,token:await confirmWorldReset(message.id,message.draft,message.entries,this.repo)};
      if(message.action==="apply-reset"){
        const snapshot=await applyWorldReset(message.id,message.token,message.worldName,this.repo);
        try{await this.openResetChat(snapshot.id);}catch{return {ok:true,chatOpened:false};}return {ok:true,chatOpened:true};
      }
      if(message.action==="open-reset-chat"){const job=await this.repo.get<CastJob>("cast",message.id);if(job?.phase!=="applied"||!job.reset?.snapshotId)throw Error("reset-not-ready");await this.openResetChat(job.reset.snapshotId);return {ok:true};}
      if (message.action === "start") {
        if (message.restart !== undefined && typeof message.restart !== "boolean") throw Error("invalid-request");
        const start = () => this.start(message.worldId, message.locale, !!message.retry, sender.tab?.id, undefined, !!message.restart,message.reset);
        const result = this.starts.then(start, start); this.starts = result.catch(() => undefined);
        return { ok: true, job: await result };
      }
      if (message.action === "status") {
        await this.reconcilePending();
        let job = (await this.repo.list<CastJob>("cast")).filter(j => j.worldId === message.worldId&&!!j.reset===!!message.reset).sort((a,b) => b.createdAt - a.createdAt)[0];
        if (job && active(job) && Date.now() - job.updatedAt > 30000 && !await this.owner(job.id)) job = await mutateCastJob(job.id, j => ({ ...interruptedCastJob(j, "interrupted"), cleanup: j.chatId || j.awaiting || j.step > 0 ? "failed" : "none" }), this.repo);
        if (job) await this.audit(job);
        await this.outbox.flush().catch(() => undefined);
        return { ok: true, job: job ? castView(job) : null };
      }
      if (message.action === "apply") return { ok: true, count: await applyCastDraft(message.id, message.draft, message.selected, message.hero, this.repo) };
      if (message.action === "open") { await this.openChat(message.id); return { ok: true }; }
      if (message.action === "hide" || message.action === "show") {
        const job = await mutateCastJob(message.id, j => ({ ...j, statusHidden: message.action === "hide" }), this.repo);
        return { ok: true, job: castView(job) };
      }
      if (message.action === "confirm-cleanup") {
        // Explicit human acknowledgement, not proof of server-side deletion. Never
        // delete/navigate a tab here, or infer that a missing worker means no chat.
        const job = await mutateCastJob(message.id, j => {
          if (active(j)) throw new Error("preparation-active");
          return { ...j, cleanup: "done" };
        }, this.repo);
        await this.audit(job);
        await this.changeOwners(owners => owners.filter(o => o.id !== message.id));
        return { ok: true, job: castView(job) };
      }
      if (message.action === "cancel") await this.audit(await mutateCastJob(message.id, j => ({ ...j, phase: "cancelled", awaiting: false, replyCheckpoint: undefined }), this.repo));
      const owner = await this.owner(message.id);
      if (owner) await this.api.tabs.sendMessage(owner.tabId, { type: "DR_CAST_RETRY_CLEANUP" });
      else if (message.action === "cleanup") throw new Error("cleanup-unavailable");
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "preparation-failed" }; }
  }
  private async openChat(id: string) {
    const job = await this.repo.get<CastJob>("cast", id);
    if (!job) throw new Error("job-missing");
    if (job.cleanup === "done") throw new Error("temporary-chat-removed");
    if (active(job)) throw new Error("preparation-active");
    const own = await this.owner(id);
    const tab = own ? await this.api.tabs.get(own.tabId).catch(() => undefined) : undefined;
    const observed = castChatReference(tab?.url), expectedId = job.chatId ?? own?.chatId;
    if (tab?.id !== undefined && observed && observed.id === expectedId && (!own?.chatId || own.chatId === expectedId)) {
      await mutateCastJob(id, j => ({ ...j, chatId: observed.id, chatUrl: observed.url }), this.repo);
      await this.api.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) await this.api.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
      await this.api.tabs.sendMessage(tab.id, { type: "DR_CAST_REVEAL" }).catch(() => undefined);
      return;
    }
    const url = castChatLink(job.chatId, job.chatUrl);
    if (!url) throw new Error("temporary-chat-address-missing");
    // An inspection tab is deliberately not a worker owner: it must not submit
    // prompts or automatically delete the conversation on load.
    await this.api.tabs.create({ url, active: true });
  }
  private openResetChat(snapshotId:string){
    const work=async()=>{
      const snapshot=await this.repo.get<import("../core/types").HandoffSnapshot>("snapshot",snapshotId),world=snapshot?.worldId?await this.repo.get<WorldProfile>("world",snapshot.worldId):null;
      if(!snapshot?.resetGameId||world?.sharedGame?.id!==snapshot.resetGameId||!snapshot.appliedAt&&world.sharedGame.revision!==snapshot.sharedGameRevision)throw Error("reset-stale");
      const key="deeprole_reset_chat_"+snapshot.id,oldId=(await this.api.storage.session.get(key))[key] as number|undefined,old=oldId===undefined?undefined:await this.api.tabs.get(oldId).catch(()=>undefined);
      const target=snapshot.appliedAt?"https://chat.deepseek.com/a/chat/s/"+encodeURIComponent(world.sharedGame.activeChatId):"https://chat.deepseek.com/";
      if(old?.id!==undefined&&old.url===target){await this.api.tabs.update(old.id,{active:true});return;}
      if(snapshot.appliedAt){await this.api.tabs.create({url:target,active:true});return;}
      const tab=await this.api.tabs.create({url:"about:blank",active:false});if(tab.id===undefined)throw Error("tab-unavailable");
      await this.api.storage.session.set({[key]:tab.id,["deeprole_tab_state_"+tab.id]:{snapshotId:snapshot.id,snapshotToken:crypto.randomUUID(),continueOnFreshChat:true,continueUntil:Date.now()+45000,overrides:{includedIds:[],excludedIds:[]}},["deeprole_draft_scene_"+tab.id]:{worldId:snapshot.worldId,bookId:null,focusIds:[]}});
      await this.api.tabs.update(tab.id,{url:target,active:true});
    };
    const next=this.resetNavigation.then(work,work);this.resetNavigation=next.catch(()=>undefined);return next;
  }
  private async start(worldId: string, locale: Locale, retry: boolean, sourceTabId?: number, continuationOf?: string, restart = false, reset?:WorldResetRequest): Promise<CastView> {
    return nativeStartLane(() => this.startInside(worldId, locale, retry, sourceTabId, continuationOf, restart,reset));
  }
  private async startInside(worldId: string, locale: Locale, retry: boolean, sourceTabId?: number, continuationOf?: string, restart = false, reset?:WorldResetRequest): Promise<CastView> {
    if (((await this.api.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY] as { memoryBatch?: unknown; cleanup?: string }[] | undefined)?.some(o => o.memoryBatch && o.cleanup !== "done")) throw Error("busy");
    if (!["ru", "en"].includes(locale) || !worldId) throw new Error("invalid-request");
    await this.reconcilePending().catch(() => undefined);
    const jobs = await this.repo.list<CastJob>("cast");
    if (jobs.some(j => j.worldId !== worldId && active(j))) throw new Error("busy");
    if(reset&&jobs.some(j=>!j.reset&&(active(j)||["pending","failed"].includes(j.cleanup))))throw Error("busy");
    const job = await createCastJob(worldId, locale, retry, this.repo, continuationOf, restart,reset);
    if (!active(job) || await this.owner(job.id)) return castView(job);
    if (jobs.some(j => j.id === job.id)) {
      // A stored active job without its owner is not permission to open/send again.
      const stopped = await mutateCastJob(job.id, j => ({ ...interruptedCastJob(j, "interrupted"), cleanup: j.chatId || j.awaiting || j.step > 0 ? "failed" : "none" }), this.repo);
      await this.audit(stopped); return castView(stopped);
    }
    await this.outbox.flush().catch(() => undefined);
    try { await beginCastServiceOperation({ id: job.id, worldId: job.worldId, createdAt: job.createdAt }, this.repo); this.knownAudits.add(job.id); }
    catch { await mutateCastJob(job.id, j => ({ ...j, phase: "error", error: "interrupted", cleanup: "none" }), this.repo).catch(() => undefined); throw new Error("interrupted"); }
    let tabId: number | undefined;
    const workerUrl = "https://chat.deepseek.com/?deeprole_cast_job=" + encodeURIComponent(job.id) + "&deeprole_cast_locale=" + locale;
    try {
      const source = sourceTabId === undefined ? await this.api.windows.getLastFocused().catch(() => undefined) : await this.api.tabs.get(sourceTabId).catch(() => undefined);
      const incognito = job.incognito ?? !!source?.incognito;
      await mutateCastJob(job.id, j => ({ ...j, incognito }), this.repo);
      const window = await this.api.windows.create({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito });
      tabId = window?.tabs?.[0]?.id;
      if (tabId === undefined) throw new Error("tab-unavailable");
      await this.setOwner({ id: job.id, tabId, audit: castServiceProgress(job) });
      await this.api.tabs.update(tabId, { url: workerUrl });
    } catch {
      let closed = tabId === undefined;
      if (tabId !== undefined) {
        const latest = await this.api.tabs.get(tabId).catch(() => undefined);
        if (!latest) closed = true;
        else if (latest.url === "about:blank" || latest.url === workerUrl) closed = await this.api.tabs.remove(tabId).then(() => true, () => false);
      }
      const failed: CastJob = { ...job, phase: "error", error: "tab-unavailable", cleanup: closed ? "none" : "failed", updatedAt: Date.now() };
      await mutateCastJob(job.id, () => failed, this.repo).catch(() => undefined); await this.audit(failed);
      throw new Error("tab-unavailable");
    }
    return castView(job);
  }
  async auto() {
    if (await this.repo.isLocked()) return;
    for (const w of await this.repo.list<WorldProfile>("world")) if (w.autoPrepareCharacters) {
      try { const locale = (await getSettings()).locale; const work = () => this.start(w.id, locale, false); const next = this.starts.then(work, work); this.starts = next.catch(() => undefined); await next; } catch { /* Empty lore waits for its first saved records; UI can show other errors. */ }
    }
  }
}
