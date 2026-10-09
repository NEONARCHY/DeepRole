import { browser } from "wxt/browser";
import { repository, type DeepRoleRepository } from "../storage/repository";
import { createCastJob, mutateCastJob, acceptCastReply, applyCastDraft } from "../storage/cast-initialization";
import { castParts, castPrompt, parseCastDraft, type CastDraft, type CastJob } from "../core/cast-initialization";
import { interruptedCastJob, parseCastBatch } from "../core/cast-batches";
import type { Locale, WorldProfile } from "../core/types";
import { getSettings } from "../storage/settings";
import { isReplacedReply } from "../core/reply-recovery";
import { castChatLink, castChatReference } from "../core/cast-chat";

export type CastMessage =
 | { type: "DR_CAST"; action: "start"; worldId: string; locale: Locale; retry?: boolean }
 | { type: "DR_CAST"; action: "status"; worldId: string }
 | { type: "DR_CAST"; action: "apply"; id: string; draft: CastDraft; selected: string[]; hero: string }
 | { type: "DR_CAST"; action: "cancel" | "cleanup" | "hide" | "show" | "confirm-cleanup" | "open"; id: string }
 | { type: "DR_CAST_WORKER"; action: "claim"; id?: string }
 | { type: "DR_CAST_WORKER"; action: "sent"; id: string; step: number }
 | { type: "DR_CAST_WORKER"; action: "bound"; id: string; chatId: string }
 | { type: "DR_CAST_WORKER"; action: "reply"; id: string; step: number; chatId: string; raw: string; repair?: boolean }
 | { type: "DR_CAST_WORKER"; action: "checkpoint"; id: string; step: number; repair: boolean; chatId: string; replyIdentity: string; raw: string }
 | { type: "DR_CAST_WORKER"; action: "error"; id: string; error: string; chatId?: string }
 | { type: "DR_CAST_WORKER"; action: "cleaned"; id: string; chatId?: string; ok: boolean }
 | { type: "DR_CAST_RETRY_CLEANUP" };
export type CastView = Omit<CastJob, "sources" | "signature" | "replyCheckpoint"> & { sourceCount: number; partCount: number; titles: Record<string,string> };
interface Ownership { id: string; tabId: number; chatId?: string }
const OWNERS = "deeprole_cast_owners";
const active = (job: CastJob) => ["opening", "reading", "analyzing"].includes(job.phase);
export function castView(job: CastJob): CastView {
  const { sources, signature: _signature, replyCheckpoint: _checkpoint, ...rest } = job;
  return { ...rest, sourceCount: sources.length, partCount: sources.length ? castParts(sources).length : 0, titles: Object.fromEntries(sources.map(s => [s.id, s.title])) };
}
export class CastCoordinator {
  private starts: Promise<unknown> = Promise.resolve();
  private ownershipWrites: Promise<unknown> = Promise.resolve();
  constructor(private repo: DeepRoleRepository = repository, private api = browser) {}
  private async owners(): Promise<Ownership[]> { return ((await this.api.storage.session.get(OWNERS))[OWNERS] as Ownership[] | undefined) ?? []; }
  private async owner(id: string, tabId?: number) { return (await this.owners()).find(o => o.id === id && (tabId === undefined || o.tabId === tabId)); }
  private changeOwners(change: (owners: Ownership[]) => Ownership[]) {
    const write = async () => this.api.storage.session.set({ [OWNERS]: change(await this.owners()) });
    const next = this.ownershipWrites.then(write, write); this.ownershipWrites = next.catch(() => undefined); return next;
  }
  private async setOwner(owner: Ownership) { await this.changeOwners(owners => [...owners.filter(o => o.id !== owner.id), owner]); }
  async removed(tabId: number) {
    const owner = (await this.owners()).find(o => o.tabId === tabId);
    if (!owner) return;
    await this.changeOwners(owners => owners.filter(o => o.tabId !== tabId));
    await mutateCastJob(owner.id, j => active(j) ? { ...interruptedCastJob(j, "tab-closed"), cleanup: j.chatId ? "failed" : "none" } : j, this.repo).catch(() => undefined);
  }
  private async trusted(message: CastMessage, sender: { id?: string; url?: string; tab?: { id?: number } }) {
    if (sender.id !== this.api.runtime.id) throw new Error("untrusted");
    if (message.type === "DR_CAST_WORKER") {
      const owners = await this.owners(), own = owners.find(o => o.tabId === sender.tab?.id && (!("id" in message) || !message.id || o.id === message.id));
      if (!own || !sender.url?.startsWith("https://chat.deepseek.com/")) throw new Error("unowned-tab");
      const tab = await this.api.tabs.get(own.tabId);
      if (!tab.url?.startsWith("https://chat.deepseek.com/")) throw new Error("unowned-tab");
      return own;
    }
    if (!sender.url?.startsWith(this.api.runtime.getURL("")) && !sender.url?.startsWith("https://chat.deepseek.com/")) throw new Error("untrusted");
    return undefined;
  }
  async handle(message: CastMessage, sender: { id?: string; url?: string; tab?: { id?: number } }): Promise<unknown> {
    try {
      const own = await this.trusted(message, sender);
      if (await this.repo.isLocked()) throw new Error("vault-locked");
      if (message.type === "DR_CAST_WORKER" && own) {
        const job = await this.repo.get<CastJob>("cast", own.id);
        const tab = await this.api.tabs.get(own.tabId);
        const currentChat = castChatReference(tab.url), currentId = currentChat?.id;
        if (own.chatId && currentId !== own.chatId && !(message.action === "cleaned" && !currentId)) throw new Error("chat-changed");
        if (!job) {
          if (message.action === "cleaned" && message.ok && !currentId && (!message.chatId || message.chatId === own.chatId)) { await this.api.tabs.remove(own.tabId); return { ok: true }; }
          throw new Error("job-missing");
        }
        if (message.action === "claim") return { ok: true, id: job.id, locale: job.locale, phase: job.phase, step: job.step, awaiting: job.awaiting, prompt: active(job) ? castPrompt(job) : "", chatId: own.chatId, repair: job.repair, replyCheckpoint: job.replyCheckpoint?.step === job.step && job.replyCheckpoint.repair === job.repair && job.replyCheckpoint.chatId === own.chatId ? job.replyCheckpoint : undefined };
        if (message.action === "bound") {
          if (!job.awaiting || !message.chatId || currentId !== message.chatId || own.chatId && own.chatId !== message.chatId) throw new Error("chat-changed");
          await this.setOwner({ ...own, chatId: message.chatId });
          await mutateCastJob(job.id, j => ({ ...j, chatId: message.chatId, chatUrl: currentChat!.url }), this.repo);
        } else if (message.action === "sent") {
          if (job.step !== message.step || job.awaiting || !active(job)) throw new Error("stale-step");
          await mutateCastJob(job.id, j => ({ ...j, phase: j.step < castParts(j.sources).length ? "reading" : "analyzing", awaiting: true, replyCheckpoint: undefined }), this.repo);
        } else if (message.action === "checkpoint") {
          if (own.chatId !== message.chatId || currentId !== message.chatId) throw new Error("chat-changed");
          if (!active(job) || !job.awaiting || job.step !== message.step || job.repair !== message.repair || job.step < castParts(job.sources).length) throw new Error("stale-step");
          if (typeof message.replyIdentity !== "string" || message.replyIdentity.length > 512 || typeof message.raw !== "string") throw new Error("invalid-result");
          let identity: unknown; try { identity = JSON.parse(message.replyIdentity); } catch { throw new Error("invalid-result"); }
          if (!Array.isArray(identity) || identity.length !== 2 || !["message", "virtual"].includes(identity[0]) || typeof identity[1] !== "string" || !identity[1]) throw new Error("invalid-result");
          // Checkpoints can contain a complete batch or finished character objects.
          // Missing batch completion does not authorize another request.
          parseCastDraft(message.raw, job.id, job.sources);
          if (job.batchSize) parseCastBatch(message.raw, job.id, job.sources, job.batchSize);
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
          await acceptCastReply(job.id, message.step, message.raw, this.repo);
        } else if (message.action === "error") {
          if (active(job) && job.awaiting && job.replyCheckpoint?.step === job.step && job.replyCheckpoint.chatId === own.chatId && job.replyCheckpoint.repair === job.repair) await acceptCastReply(job.id, job.step, job.replyCheckpoint.raw, this.repo).catch(() => undefined);
          if (message.chatId && currentId === message.chatId && job.awaiting && (!own.chatId || own.chatId === message.chatId)) {
            await this.setOwner({ ...own, chatId: message.chatId });
            await mutateCastJob(job.id, j => ({ ...j, chatId: message.chatId, chatUrl: currentChat!.url }), this.repo);
          }
          await mutateCastJob(job.id, j => active(j) ? { ...j, phase: "error", error: message.error.slice(0,80), awaiting: false } : j, this.repo);
        } else if (message.action === "cleaned") {
          if (message.chatId && message.chatId !== own.chatId) throw new Error("chat-changed");
          await mutateCastJob(job.id, j => {
            if (j.cleanup === "done") throw new Error("cleanup-finished");
            return { ...j, cleanup: message.ok ? "done" : "failed" };
          }, this.repo);
          if (message.ok && await this.owner(job.id, own.tabId)) await this.api.tabs.remove(own.tabId);
        }
        return { ok: true };
      }
      if (message.type !== "DR_CAST") return { ok: false };
      if (message.action === "start") {
        const start = () => this.start(message.worldId, message.locale, !!message.retry);
        const result = this.starts.then(start, start); this.starts = result.catch(() => undefined);
        return { ok: true, job: await result };
      }
      if (message.action === "status") {
        let job = (await this.repo.list<CastJob>("cast")).filter(j => j.worldId === message.worldId).sort((a,b) => b.createdAt - a.createdAt)[0];
        if (job && active(job) && Date.now() - job.updatedAt > 30000 && !await this.owner(job.id)) job = await mutateCastJob(job.id, j => ({ ...interruptedCastJob(j, "interrupted"), cleanup: j.chatId ? "failed" : "none" }), this.repo);
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
        await this.changeOwners(owners => owners.filter(o => o.id !== message.id));
        return { ok: true, job: castView(job) };
      }
      if (message.action === "cancel") await mutateCastJob(message.id, j => ({ ...j, phase: "cancelled", awaiting: false, replyCheckpoint: undefined }), this.repo);
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
      return;
    }
    const url = castChatLink(job.chatId, job.chatUrl);
    if (!url) throw new Error("temporary-chat-address-missing");
    // An inspection tab is deliberately not a worker owner: it must not submit
    // prompts or automatically delete the conversation on load.
    await this.api.tabs.create({ url, active: true });
  }
  private async start(worldId: string, locale: Locale, retry: boolean): Promise<CastView> {
    if (!["ru", "en"].includes(locale) || !worldId) throw new Error("invalid-request");
    const jobs = await this.repo.list<CastJob>("cast");
    if (jobs.some(j => j.worldId !== worldId && active(j))) throw new Error("busy");
    const job = await createCastJob(worldId, locale, retry, this.repo);
    if (!active(job) || await this.owner(job.id)) return castView(job);
    let tabId: number | undefined;
    try {
      const tab = await this.api.tabs.create({ url: "about:blank", active: false }); tabId = tab.id;
      if (tabId === undefined) throw new Error("tab-unavailable");
      await this.setOwner({ id: job.id, tabId });
      await this.api.tabs.update(tabId, { url: "https://chat.deepseek.com/?deeprole_cast_job=" + encodeURIComponent(job.id) });
    } catch {
      await mutateCastJob(job.id, j => ({ ...j, phase: "error", error: "tab-unavailable", cleanup: "none" }), this.repo);
      if (tabId !== undefined) await this.api.tabs.remove(tabId).catch(() => undefined);
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
