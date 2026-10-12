import { browser } from "wxt/browser";
import { repository, type DeepRoleRepository } from "../storage/repository";
import { getSettings } from "../storage/settings";
import { TabSessionStore } from "../storage/tab-session";
import { castChatReference } from "../core/cast-chat";
import { FIELD_OWNERS_KEY, FIELD_TIMEOUT, fieldSourceUrl, isolatedFieldPrompt, isolatedFieldResult, safeFieldError, validIsolatedFieldInput, type CharacterTextOutcome, type IsolatedFieldInput } from "../core/isolated-character-text";
import type { CharacterTextField } from "../core/character-text";
import type { FieldSource } from "../core/field-history";
import type { FieldServicePresentation } from "../core/field-service-screen";
import type { DeepRoleSettings } from "../core/types";
import { beginServiceOperation } from "../storage/service-operations";
import { beginRepairServiceOperation } from "../storage/service-operations";
import { beginDiscoveryServiceOperation } from "../storage/service-operations";
import { prepareCharacterDiscovery, applyCharacterDiscovery, finishCharacterDiscovery, characterDiscoveryCurrent, type CharacterDiscoveryBrief } from "../storage/story-character-discovery";
import { validCharacterDiscoveryInput, type CharacterDiscoveryInput } from "../core/story-character-discovery";
import { validDiscoveryProfileInput, type DiscoveryProfileInput } from "../core/story-character-discovery";
import { prepareDiscoveryProfile, applyDiscoveryProfile, discoveryProfileCurrent, type DiscoveryProfileBrief } from "../storage/discovery-profile";
import { validSupplementInput, type SupplementInput } from "../core/profile-supplements";
import { prepareProfileSupplement, applyProfileSupplement, profileSupplementCurrent, type SupplementBrief } from "../storage/profile-supplements";
import { prepareStoryRepair, applyStoryRepair, finishStoryRepair, storyRepairCurrent, validStoryRepairInput, type StoryRepairInput, type StoryRepairBrief } from "../storage/story-repair";
import type { ServiceOperationProgress } from "../core/service-operations";
import { ServiceAuditOutbox } from "../storage/service-outbox";
import { SERVICE_OUTBOX_PREFIX, serviceOperationId } from "../core/service-outbox";
import { validNativeStoryId } from "../core/story-transport";
import { FieldValidationError } from "../core/field-validation";
import { fieldServiceValidation, type ServiceValidation } from "../core/service-validation";
import { recordFieldServiceValidation, recordFieldWorkerRuntime, type FieldValidationBinding } from "../storage/field-service-validation";
import { FIELD_CLEANUP_WAIT, fieldWorkerStages, validFieldWorkerRuntime, type FieldWorkerRuntime, type FieldWorkerStage, type FieldWorkerVisibility } from "../core/field-runtime";
import { validDiscoveryQueueInput, type DiscoveryQueueInput } from "../core/discovery-profile-queue";
import { editDiscoveryQueue, failDiscoveryProfileTask } from "../storage/discovery-profile-queue";

export type FieldMessage =
 | { type: "DR_FIELD"; action: "discovery-queue"; input: DiscoveryQueueInput }
 | { type: "DR_FIELD"; action: "enrich-profile"; input: SupplementInput }
 | { type: "DR_FIELD"; action: "discovery-profile"; input: DiscoveryProfileInput }
 | { type: "DR_FIELD"; action: "discover"; input: CharacterDiscoveryInput }
 | { type: "DR_FIELD"; action: "repair"; input: StoryRepairInput }
 | { type: "DR_FIELD"; action: "start"; input: IsolatedFieldInput }
 | { type: "DR_FIELD"; action: "read" | "ack" | "cancel" | "cleanup"; id: string }
 | { type: "DR_FIELD_WORKER"; action: "claim"; id?: string }
 | { type: "DR_FIELD_WORKER"; action: "sent" | "authorize-cleanup"; id: string }
 | { type: "DR_FIELD_WORKER"; action: "bound"; id: string; chatId: string }
 | { type: "DR_FIELD_WORKER"; action: "reply"; id: string; chatId: string; raw: string }
 | { type: "DR_FIELD_WORKER"; action: "progress"; id: string; stage: FieldWorkerStage; visibility: FieldWorkerVisibility }
 | { type: "DR_FIELD_WORKER"; action: "error"; id: string; error: string }
 | { type: "DR_FIELD_WORKER"; action: "cleaned"; id: string; chatId?: string; ok: boolean };
interface Owner {
 id: string; sourceTab: number; source: IsolatedFieldInput["scope"]; tabId: number; chatId?: string; chatUrl?: string;
 createdAt: number; sent: boolean; phase: "running" | "result" | "error"; error?: string; cleanup?: "done" | "failed";
 runtime?: FieldWorkerRuntime; settledAt?: number; delivered?: boolean; mode?: "history" | "suggest"; fieldScope?: CharacterTextField["scope"];
 repair?: StoryRepairInput;
 discovery?: CharacterDiscoveryInput;
  discoveryProfile?: Pick<DiscoveryProfileInput, "worldId" | "chatId" | "guard" | "eventId" | "queueId">;
 enrichment?: SupplementInput;
}
interface Job { prompt: string; field: CharacterTextField; partialContext: boolean; sources: FieldSource[]; presentation: FieldServicePresentation; historyOrigin?: "native" | "visible"; text?: string; evidence?: string[]; repair?: StoryRepairBrief; discovery?: CharacterDiscoveryBrief; discoveryProfile?: DiscoveryProfileBrief; enrichment?: SupplementBrief }
type Sender = import("wxt/browser").Browser.runtime.MessageSender;

/** Text is ephemeral. Only ownership/dispatch metadata survives MV3 suspension.
 * An interrupted job is never resubmitted and cannot fall back to the game chat.
 */
export class IsolatedFieldCoordinator {
 private jobs = new Map<string, Job>();
 private auditSnapshots = new Map<string, string>();
 private queuedAudits = new Set<string>();
 private validationAudits = new Map<string, { binding: FieldValidationBinding; validation: ServiceValidation }>();
 private runtimeSnapshots = new Map<string, string>();
 private tail: Promise<unknown> = Promise.resolve();
 private sessions: TabSessionStore;
 private outbox: ServiceAuditOutbox;
 constructor(private repo: DeepRoleRepository = repository, private api: typeof browser = browser, private settings: () => Promise<DeepRoleSettings> = getSettings) { this.sessions = new TabSessionStore(api.storage.session); this.outbox = new ServiceAuditOutbox(repo, api.storage.local); }
 private enqueue<T>(task: () => Promise<T>): Promise<T> { const next = this.tail.catch(() => undefined).then(task); this.tail = next.catch(() => undefined); return next; }
 private async owners(): Promise<Owner[]> { return (await this.api.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY] as Owner[] ?? []; }
 private async audit(owner: Owner) {
  if (owner.repair && owner.phase === "error") await finishStoryRepair(owner.repair, owner.id, owner.error === "cancelled" ? "cancelled" : "failed", this.repo).catch(() => undefined);
  if (owner.discovery && owner.phase === "error") await finishCharacterDiscovery(owner.discovery, owner.id, owner.error === "cancelled" ? "cancelled" : "failed", this.repo).catch(() => undefined);
  if (owner.discoveryProfile && owner.phase === "error") await failDiscoveryProfileTask(owner.discoveryProfile, owner.id, this.repo).catch(() => undefined);
  if (owner.runtime && owner.mode && owner.fieldScope && this.runtimeSnapshots.get(owner.id) !== JSON.stringify(owner.runtime)) {
   try {
    await recordFieldWorkerRuntime({ id: owner.id, worldId: owner.source.worldId, sourceChatId: owner.source.chatId, workerChatId: owner.chatId, createdAt: owner.createdAt, mode: owner.mode, fieldScope: owner.fieldScope }, owner.runtime, this.repo);
    this.runtimeSnapshots.set(owner.id, JSON.stringify(owner.runtime));
   } catch { /* Safe stage metadata must not block result/cleanup. */ }
  }
  const validation = this.validationAudits.get(owner.id);
  if (validation) {
   // Retry only this safe metadata while this background instance is alive.
   // Raw replies/sources are never queued in storage or revived after a restart.
   try { await recordFieldServiceValidation(validation.binding, validation.validation, this.repo); this.validationAudits.delete(owner.id); }
   catch { /* Main audit/cleanup must remain possible even if details cannot be written. */ }
  }
  // Cleanup must remain possible when the encrypted repository is locked or
  // temporarily unavailable. Only opaque/fixed progress is queued outside the
  // vault; a queued audit never authorizes native completion or resending.
  const progress: Omit<ServiceOperationProgress, "at"> = { phase: owner.phase === "error" ? "failed" : owner.phase === "result" ? "result" : owner.sent ? "dispatching" : "prepared",
   workerChatId: owner.chatId ?? null, cleanup: owner.cleanup ?? "pending", error: owner.phase === "error" ? safeFieldError(owner.error) : null };
  const snapshot = JSON.stringify(progress);
  if (this.auditSnapshots.get(owner.id) === snapshot) {
   try {
    if (this.queuedAudits.has(owner.id) && !await this.repo.isLocked()) {
     await this.outbox.flush(owner.chatId ? new Map([[owner.id, owner.chatId]]) : undefined);
     if ((await this.api.storage.local.get(SERVICE_OUTBOX_PREFIX + owner.id))[SERVICE_OUTBOX_PREFIX + owner.id] === undefined) this.queuedAudits.delete(owner.id);
    }
   } catch { /* Previously queued metadata remains durable; never resend. */ }
   return true;
  }
  try {
   const status = await this.outbox.record(owner.id, { ...progress, at: Date.now() });
   if (status === "discarded") return false;
   if (status === "queued") this.queuedAudits.add(owner.id); else this.queuedAudits.delete(owner.id);
   this.auditSnapshots.set(owner.id, snapshot); return true;
  } catch { return false; }
 }
 private async save(owner: Owner) { const all = await this.owners(); await this.api.storage.session.set({ [FIELD_OWNERS_KEY]: [...all.filter(o => o.id !== owner.id), owner] }); await this.audit(owner); }
 private async sourceValid(owner: Owner) { const tab = await this.api.tabs.get(owner.sourceTab).catch(() => undefined); return !!tab && fieldSourceUrl(tab.url, owner.source.chatId) && (!owner.repair || await storyRepairCurrent(owner.repair, owner.id, this.repo)) && (!owner.discovery || await characterDiscoveryCurrent(owner.discovery, owner.id, this.repo)) && (!owner.discoveryProfile || await discoveryProfileCurrent(owner.discoveryProfile, this.repo)) && (!owner.enrichment || await profileSupplementCurrent(owner.enrichment, this.repo)); }
 private stop(owner: Owner, error: string) { owner.phase = "error"; owner.error = safeFieldError(error); owner.settledAt ??= Date.now(); this.jobs.delete(owner.id); }
 private cleanupWaitExpired(owner: Owner) { return !owner.cleanup && owner.phase !== "running" && owner.settledAt !== undefined && Date.now() - owner.settledAt >= FIELD_CLEANUP_WAIT; }
 private wake(owner: Owner) { void this.api.tabs.sendMessage(owner.tabId, { type: "DR_FIELD_CLEANUP" }).catch(() => undefined); }
 handle(message: FieldMessage, sender: Sender): Promise<any> { return this.enqueue(async () => {
  try {
   if (sender.id !== this.api.runtime.id || sender.tab?.id === undefined || sender.frameId && sender.frameId !== 0) throw new Error("untrusted");
   const tabId = sender.tab.id, tab = await this.api.tabs.get(tabId).catch(() => undefined);
    if (!tab?.url || new URL(tab.url).origin !== "https://chat.deepseek.com") throw new Error("untrusted");
    if (message.type === "DR_FIELD" && message.action === "discovery-queue") {
     if (!validDiscoveryQueueInput(message.input) || !fieldSourceUrl(tab.url, message.input.chatId) || !tab.active) throw Error("invalid-brief");
     if (await this.repo.isLocked()) throw Error("vault-locked");
     for (const owner of await this.owners()) {
      if (owner.cleanup === "done") continue;
      if (owner.phase === "running" && (!this.jobs.has(owner.id) || !await this.sourceValid(owner) || Date.now() - owner.createdAt >= FIELD_TIMEOUT)) { this.stop(owner, "interrupted"); await this.save(owner); this.wake(owner); }
      throw Error(owner.cleanup === "failed" ? "cleanup-required" : "busy");
     }
     const current = async () => { const latest = await this.api.tabs.get(tabId); if (!latest?.active || !fieldSourceUrl(latest.url, message.input.chatId)) throw Error("scene-changed"); };
     await editDiscoveryQueue(message.input, this.repo, current); return { ok: true };
    }
   if (message.type === "DR_FIELD" && (message.action === "discovery-profile" || message.action === "enrich-profile")) {
    if (!(message.action === "discovery-profile" ? validDiscoveryProfileInput(message.input) : validSupplementInput(message.input)) || !fieldSourceUrl(tab.url, message.input.chatId) || !tab.active) throw Error("invalid-brief");
    if (await this.repo.isLocked()) throw Error("vault-locked");
    await this.flushPending().catch(() => undefined);
     if ((await this.owners()).some(o => !o.cleanup || "queueId" in message.input && message.input.queueId && o.cleanup !== "done")) throw Error("busy");
    const id = "field_" + crypto.randomUUID(), input = structuredClone(message.input), settings = await this.settings(), createdAt = Date.now();
    const brief = "entityId" in input ? await prepareProfileSupplement(input, id, settings.locale, this.repo) : await prepareDiscoveryProfile(input, id, settings.locale, this.repo);
    let worker: import("wxt/browser").Browser.tabs.Tab | undefined;
    try {
     await beginServiceOperation({ id, worldId: input.worldId, sourceChatId: input.chatId, createdAt, mode: "history", fieldScope: "profile" }, this.repo);
     const popup = await this.api.windows.create({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito: !!tab.incognito });
     const tabs = popup?.tabs ?? (popup?.id !== undefined ? await this.api.tabs.query({ windowId: popup.id }) : []);
     if (tabs.length !== 1 || tabs[0]?.id === undefined || tabs[0].id === tabId) throw Error("tab-unavailable");
     worker = tabs[0];
      const owner: Owner = { id, sourceTab: tabId, source: brief.source, tabId: worker.id!, createdAt, sent: false, phase: "running", ...("entityId" in input ? { enrichment: input } : { discoveryProfile: { worldId: input.worldId, chatId: input.chatId, guard: input.guard, eventId: input.eventId, ...(input.queueId ? { queueId: input.queueId } : {}) } }), mode: "history", fieldScope: "profile", runtime: { stage: "opening", visibility: "unknown", at: createdAt } };
     await this.save(owner);
     this.jobs.set(id, { prompt: brief.prompt, field: brief.draft.field, sources: [], partialContext: brief.partial, ...("canonical" in brief ? { enrichment: brief } : { discoveryProfile: brief }), presentation: { locale: settings.locale, kind: "profile", characterName: brief.draft.reference.name as string, fieldLabel: brief.draft.field.label } });
     await this.api.tabs.update(worker.id!, { url: "https://chat.deepseek.com/?deeprole_field_job=" + encodeURIComponent(id) + "&deeprole_field_locale=" + settings.locale });
     return { ok: true, id };
    } catch {
     this.jobs.delete(id);
      if (!("entityId" in input)) await failDiscoveryProfileTask(input, id, this.repo).catch(() => undefined);
     const current = worker?.id !== undefined ? await this.api.tabs.get(worker.id).catch(() => undefined) : undefined;
     const cleaned = !current || current.url === "about:blank" && await this.api.tabs.remove(worker!.id!).then(() => true, () => false);
     const owner = (await this.owners()).find(o => o.id === id);
     if (owner) { this.stop(owner, "tab-unavailable"); owner.cleanup = cleaned ? "done" : "failed"; await this.save(owner).catch(() => undefined); }
     await this.outbox.record(id, { phase: "failed", workerChatId: null, cleanup: cleaned ? "done" : "failed", error: "tab-unavailable", at: Date.now() }).catch(() => undefined);
     throw Error("tab-unavailable");
    }
   }
   if (message.type === "DR_FIELD" && message.action === "discover") {
    if (!validCharacterDiscoveryInput(message.input) || !fieldSourceUrl(tab.url, message.input.chatId) || !tab.active) throw Error("invalid-brief");
    if (await this.repo.isLocked()) throw Error("vault-locked");
    await this.flushPending().catch(() => undefined);
    if ((await this.owners()).some(o => !o.cleanup)) throw Error("busy");
    const id = "discover_" + crypto.randomUUID(), input = structuredClone(message.input), settings = await this.settings(), createdAt = Date.now();
    const brief = await prepareCharacterDiscovery(input, id, settings.locale, this.repo);
    let worker: import("wxt/browser").Browser.tabs.Tab | undefined;
    try {
     await beginDiscoveryServiceOperation({ id, worldId: input.worldId, sourceChatId: input.chatId, createdAt }, this.repo);
     const popup = await this.api.windows.create({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito: !!tab.incognito });
     const tabs = popup?.tabs ?? (popup?.id !== undefined ? await this.api.tabs.query({ windowId: popup.id }) : []);
     if (tabs.length !== 1 || tabs[0]?.id === undefined || tabs[0].id === tabId) throw Error("tab-unavailable");
     worker = tabs[0];
     const owner: Owner = { id, sourceTab: tabId, source: brief.source, tabId: worker.id!, createdAt, sent: false, phase: "running", discovery: input, runtime: { stage: "opening", visibility: "unknown", at: createdAt } };
     await this.save(owner);
     this.jobs.set(id, { prompt: brief.prompt, field: { key: "character-discovery", scope: "scene", label: "Character discovery", maxLength: 64000, mode: "history" }, sources: [], partialContext: false, discovery: brief, presentation: { locale: settings.locale, kind: "discovery", characterName: "Story", fieldLabel: "Characters" } });
     await this.api.tabs.update(worker.id!, { url: "https://chat.deepseek.com/?deeprole_field_job=" + encodeURIComponent(id) + "&deeprole_field_locale=" + settings.locale });
     return { ok: true, id };
    } catch {
     this.jobs.delete(id); await finishCharacterDiscovery(input, id, "failed", this.repo).catch(() => undefined);
     const current = worker?.id !== undefined ? await this.api.tabs.get(worker.id).catch(() => undefined) : undefined;
     const cleaned = !current || current.url === "about:blank" && await this.api.tabs.remove(worker!.id!).then(() => true, () => false);
     const owner = (await this.owners()).find(o => o.id === id);
     if (owner) { this.stop(owner, "tab-unavailable"); owner.cleanup = cleaned ? "done" : "failed"; await this.save(owner).catch(() => undefined); }
     await this.outbox.record(id, { phase: "failed", workerChatId: null, cleanup: cleaned ? "done" : "failed", error: "tab-unavailable", at: Date.now() }).catch(() => undefined);
     throw Error("tab-unavailable");
    }
   }
   if (message.type === "DR_FIELD" && message.action === "repair") {
    if (!validStoryRepairInput(message.input) || !fieldSourceUrl(tab.url, message.input.chatId) || !tab.active) throw Error("invalid-brief");
    if (await this.repo.isLocked()) throw Error("vault-locked");
    await this.flushPending().catch(() => undefined);
    if ((await this.owners()).some(o => !o.cleanup)) throw Error("busy");
    const id = "repair_" + crypto.randomUUID(), input = structuredClone(message.input);
    const brief = await prepareStoryRepair(input, id, this.repo), settings = await this.settings(), createdAt = Date.now();
    try { await beginRepairServiceOperation({ id, worldId: input.worldId, sourceChatId: input.chatId, createdAt }, this.repo); }
    catch { await finishStoryRepair(input, id, "failed", this.repo).catch(() => undefined); throw Error("interrupted"); }
    let worker: import("wxt/browser").Browser.tabs.Tab | undefined;
    try {
     const popup = await this.api.windows.create({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito: !!tab.incognito });
     const tabs = popup?.tabs ?? (popup?.id !== undefined ? await this.api.tabs.query({ windowId: popup.id }) : []);
     if (tabs.length !== 1 || tabs[0]?.id === undefined || tabs[0].id === tabId) throw Error("tab-unavailable");
     worker = tabs[0];
     const owner: Owner = { id, sourceTab: tabId, source: brief.source, tabId: worker.id!, createdAt, sent: false, phase: "running", repair: input, runtime: { stage: "opening", visibility: "unknown", at: createdAt } };
     await this.save(owner);
     this.jobs.set(id, { prompt: brief.prompt, field: { key: "story-metadata", scope: "scene", label: "Story metadata", maxLength: 80000, mode: "history" }, sources: [], partialContext: false, repair: brief, presentation: { locale: settings.locale, kind: "repair", characterName: "Story", fieldLabel: "Metadata" } });
     await this.api.tabs.update(worker.id!, { url: "https://chat.deepseek.com/?deeprole_field_job=" + encodeURIComponent(id) + "&deeprole_field_locale=" + settings.locale });
     return { ok: true, id };
    } catch {
     this.jobs.delete(id); await finishStoryRepair(input, id, "failed", this.repo).catch(() => undefined);
     const current = worker?.id !== undefined ? await this.api.tabs.get(worker.id).catch(() => undefined) : undefined;
     const cleaned = !current || current.url === "about:blank" && await this.api.tabs.remove(worker!.id!).then(() => true, () => false);
     await this.outbox.record(id, { phase: "failed", workerChatId: null, cleanup: cleaned ? "done" : "failed", error: "tab-unavailable", at: Date.now() }).catch(() => undefined);
     throw Error("tab-unavailable");
    }
   }
   if (message.type === "DR_FIELD" && message.action === "start") {
    const input = structuredClone(message.input);
    if (!validIsolatedFieldInput(input) || !fieldSourceUrl(tab.url, input.scope.chatId)) throw new Error("invalid-brief");
    if (await this.repo.isLocked()) throw new Error("vault-locked");
    await this.flushPending().catch(() => undefined);
    const pending = (await this.owners()).find(o => !o.cleanup);
    if (pending) {
     if (pending.phase === "running" && Date.now() - pending.createdAt < FIELD_TIMEOUT) throw new Error("busy");
     if (pending.phase === "running") { this.stop(pending, "reply-timeout"); await this.save(pending); }
     this.wake(pending); throw new Error("cleanup-pending");
    }
    const records = await this.repo.rawRecords(), session = await this.sessions.get(tabId);
    const binding = records.find(r => r.kind === "binding" && (r.data as import("../core/types").ChatBinding).chatId === input.scope.chatId)?.data as import("../core/types").ChatBinding | undefined;
    const id = "field_" + crypto.randomUUID();
    const prepared = isolatedFieldPrompt(input, records, await this.settings(), id, input.scope.chatId ? binding?.memoryOverrides : session.overrides);
    if (!fieldSourceUrl((await this.api.tabs.get(tabId)).url, input.scope.chatId) || await this.repo.isLocked()) throw new Error("scene-changed");
    const createdAt = Date.now();
    try { await beginServiceOperation({ id, worldId: input.scope.worldId, sourceChatId: input.scope.chatId, mode: input.draft.field.mode ?? "suggest", fieldScope: input.draft.field.scope, createdAt }, this.repo); }
    catch { throw new Error("interrupted"); }
    let worker: import("wxt/browser").Browser.tabs.Tab;
    try {
     // An inactive same-window tab can defer the site's rendering indefinitely.
     // An unfocused popup also stalled in the live browser. Explicitly show the
     // service page; its local screen masks native content without hiding layout.
     const window = await this.api.windows.create({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito: !!tab.incognito });
     const tabs = window?.tabs ?? (window?.id !== undefined ? await this.api.tabs.query({ windowId: window.id }) : []);
     const candidate = tabs[0];
     if (tabs.length !== 1 || !candidate || candidate.id === undefined || candidate.id === tabId) throw new Error("tab-unavailable");
     worker = candidate;
    }
    catch { await this.outbox.record(id, { phase: "failed", workerChatId: null, cleanup: "done", error: "tab-unavailable", at: Date.now() }).catch(() => undefined); throw new Error("tab-unavailable"); }
    if (worker.id === undefined || worker.id === tabId) {
     await this.outbox.record(id, { phase: "failed", workerChatId: null, cleanup: worker.id === undefined ? "failed" : "done", error: "tab-unavailable", at: Date.now() }).catch(() => undefined); throw new Error("tab-unavailable");
    }
    const owner: Owner = { id, sourceTab: tabId, source: input.scope, tabId: worker.id, createdAt, sent: false, phase: "running", mode: input.draft.field.mode ?? "suggest", fieldScope: input.draft.field.scope, runtime: { stage: "opening", visibility: "unknown", at: createdAt } };
    try {
     await this.save(owner); this.jobs.set(id, { ...prepared, field: input.draft.field, historyOrigin: input.historyReference?.origin, presentation: { locale: input.locale, fieldLabel: input.draft.field.label, characterName: input.draft.reference.name as string, ...(input.draft.field.key === "character-profile" ? { kind: "profile" as const } : {}) } });
     await this.api.tabs.update(worker.id, { url: "https://chat.deepseek.com/?deeprole_field_job=" + encodeURIComponent(id) + "&deeprole_field_locale=" + input.locale });
    } catch {
     this.stop(owner, "tab-unavailable"); const current = await this.api.tabs.get(worker.id).catch(() => undefined);
     if (!current || current.url === "about:blank" && await this.api.tabs.remove(worker.id).then(() => true, () => false)) owner.cleanup = "done";
     await this.save(owner).catch(() => undefined); await this.audit(owner); throw new Error("tab-unavailable");
    }
    return { ok: true, id };
   }
   const owner = (await this.owners()).find(o => message.type === "DR_FIELD_WORKER" ? o.tabId === tabId && (!message.id || o.id === message.id) : o.id === message.id && o.sourceTab === tabId);
   if (!owner) throw new Error("unowned-tab");
   if (owner.phase !== "error" && (!(owner.delivered && owner.phase === "result") && !this.jobs.has(owner.id) || !await this.sourceValid(owner) || await this.repo.isLocked() || owner.phase === "running" && !owner.cleanup && Date.now() - owner.createdAt >= FIELD_TIMEOUT)) {
    this.stop(owner, !this.jobs.has(owner.id) ? "interrupted" : !await this.sourceValid(owner) ? "scene-changed" : await this.repo.isLocked() ? "vault-locked" : "reply-timeout"); await this.save(owner); this.wake(owner);
   }
   const job = this.jobs.get(owner.id), currentChat = castChatReference(tab.url);
   await this.audit(owner);
   if (message.type === "DR_FIELD") {
    // Only the source tab may inspect cleanup; never expose reply text after navigation.
    if (message.action === "cleanup") return { ok: true, cleanup: owner.cleanup ?? (this.cleanupWaitExpired(owner) ? "failed" : undefined), ...((owner.cleanup === "failed" || this.cleanupWaitExpired(owner)) && owner.chatUrl ? { cleanupUrl: owner.chatUrl } : {}) };
    if (message.action === "cancel") {
     // A saved discovery/profile proposal is already a result. Cancelling while
     // waiting for cleanup must not rewrite that receipt as a failed generation.
     if (owner.phase !== "result" || !owner.discovery && !owner.discoveryProfile && !owner.enrichment) { this.stop(owner, "cancelled"); await this.save(owner); }
     this.wake(owner);
    }
    if (message.action === "ack") {
     if (owner.delivered) return { ok: true };
     if (owner.phase !== "result" || !owner.cleanup && !this.cleanupWaitExpired(owner) || !job?.text) throw new Error(owner.error ?? "stale-step");
     if (!await this.audit(owner)) throw new Error("interrupted");
     this.jobs.delete(owner.id); owner.delivered = true; await this.save(owner);
     if (owner.cleanup === "done") { await this.api.storage.session.set({ [FIELD_OWNERS_KEY]: (await this.owners()).filter(o => o.id !== owner.id) }); this.auditSnapshots.delete(owner.id); this.queuedAudits.delete(owner.id); this.runtimeSnapshots.delete(owner.id); }
    }
    if (message.action === "read") {
     if (!await this.sourceValid(owner)) throw new Error("scene-changed");
     const cleanup = owner.cleanup ?? (this.cleanupWaitExpired(owner) ? "failed" : undefined);
     if (owner.phase === "error") return cleanup ? { ok: false, error: owner.error ?? "interrupted", cleanup, ...(cleanup === "failed" && owner.chatUrl ? { cleanupUrl: owner.chatUrl } : {}) } : { ok: true };
     if (job?.text && cleanup) {
      const outcome: CharacterTextOutcome = { text: job.text, partialContext: job.partialContext, cleanup, mode: job.field.mode, historyOrigin: job.historyOrigin, evidence: job.evidence, ...(cleanup === "failed" && owner.chatUrl ? { cleanupUrl: owner.chatUrl } : {}) };
      return { ok: true, outcome };
     }
    }
    return { ok: true };
   }
   if (message.action === "claim") return { ok: true, id: owner.id, phase: owner.phase, awaiting: owner.sent, chatId: owner.chatId, prompt: owner.phase === "running" ? job?.prompt : undefined, presentation: owner.phase === "running" ? job?.presentation : undefined };
   if (message.action === "progress") {
    const runtime = { stage: message.stage, visibility: message.visibility, at: Date.now() };
    if (!validFieldWorkerRuntime(runtime) || owner.runtime && fieldWorkerStages.indexOf(runtime.stage) < fieldWorkerStages.indexOf(owner.runtime.stage)) throw new Error("stale-step");
    if (owner.runtime?.stage !== runtime.stage || owner.runtime?.visibility !== runtime.visibility) { owner.runtime = runtime; await this.save(owner); }
    return { ok: true };
   }
   if (message.action === "sent") {
    if (owner.phase !== "running" || owner.sent || currentChat || new URL(tab.url).pathname !== "/") throw new Error("stale-step");
    owner.sent = true; await this.save(owner); if (!await this.audit(owner)) throw new Error("interrupted"); return { ok: true };
   }
   if (message.action === "bound") {
    if (owner.phase !== "running" || !owner.sent || !currentChat || currentChat.id !== message.chatId || message.chatId === owner.source.chatId || owner.chatId && owner.chatId !== message.chatId) throw new Error("chat-changed");
    owner.chatId = currentChat.id; owner.chatUrl = currentChat.url; await this.save(owner); return { ok: true };
   }
   if (message.action === "reply") {
    if (owner.phase !== "running" || !job || !owner.sent || owner.chatId !== message.chatId || currentChat?.id !== owner.chatId) throw new Error("chat-changed");
    try { if (job.enrichment) { await applyProfileSupplement(job.enrichment, message.raw, this.repo); job.text = "profile-supplement-prepared"; } else if (job.discoveryProfile) { await applyDiscoveryProfile(job.discoveryProfile, message.raw, this.repo); job.text = "profile-prepared"; } else if (job.discovery) { await applyCharacterDiscovery(job.discovery, message.raw, this.repo); job.text = "characters-discovered"; } else if (job.repair) { await applyStoryRepair(job.repair, message.raw, await this.settings(), this.repo); job.text = "metadata-corrected"; } else job.text = isolatedFieldResult(message.raw, { field: job.field }, { requestId: owner.id, sources: job.sources }); }
    catch (error) {
     if (error instanceof FieldValidationError && !this.validationAudits.has(owner.id)) {
      const validation = fieldServiceValidation(error, typeof message.raw === "string" ? message.raw.length : null, Date.now());
      if (validation) this.validationAudits.set(owner.id, { validation, binding: { id: owner.id, worldId: owner.source.worldId, sourceChatId: owner.source.chatId, workerChatId: owner.chatId!, mode: job.field.mode ?? "suggest", fieldScope: job.field.scope, createdAt: owner.createdAt } });
      await this.audit(owner);
     }
     throw error;
    }
    if (!job.repair && !job.discovery && job.field.mode === "history" && job.field.key !== "character-profile") {
     // Read only after the full schema/exact-quote check. Keep quotes ephemeral, without source IDs.
     const validated = JSON.parse(message.raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, "$1")) as { evidence: { quote: string }[] };
     job.evidence = [...new Set(validated.evidence.map(item => item.quote))];
    }
    job.prompt = ""; job.sources = []; job.discovery = undefined; job.discoveryProfile = undefined; job.enrichment = undefined; owner.phase = "result"; owner.settledAt = Date.now(); await this.save(owner); return { ok: true };
   }
   if (message.action === "error") { if (owner.phase === "running") { this.stop(owner, message.error); await this.save(owner); } return { ok: true }; }
   if (message.action === "authorize-cleanup") {
    if (owner.cleanup === "done" || (currentChat ? !owner.chatId || currentChat.id !== owner.chatId || currentChat.id === owner.source.chatId : new URL(tab.url).pathname !== "/")) throw new Error("chat-changed");
    return { ok: true, chatId: owner.chatId };
   }
   if (message.action === "cleaned") {
    if (owner.cleanup === "done" || message.chatId !== owner.chatId) throw new Error("chat-changed");
    if (message.ok && (currentChat || new URL(tab.url).pathname !== "/")) throw new Error("chat-changed");
    owner.cleanup = message.ok ? "done" : "failed";
    if (owner.phase === "running") this.stop(owner, "interrupted");
    await this.save(owner);
    if (message.ok) {
     // A user can navigate during the session write above. Recheck immediately
     // before closing, never close a now-foreign chat on an old URL snapshot.
     const latest = await this.api.tabs.get(owner.tabId).catch(() => undefined);
     if (latest?.url && new URL(latest.url).origin === "https://chat.deepseek.com" && new URL(latest.url).pathname === "/") await this.api.tabs.remove(owner.tabId).catch(() => undefined);
     if (owner.delivered) { await this.api.storage.session.set({ [FIELD_OWNERS_KEY]: (await this.owners()).filter(o => o.id !== owner.id) }); this.auditSnapshots.delete(owner.id); this.queuedAudits.delete(owner.id); this.runtimeSnapshots.delete(owner.id); }
    }
    return { ok: true };
   }
   throw new Error("invalid-brief");
   } catch (error) {
    const code = error instanceof Error ? error.message : error;
    // Queue storage conflicts need their existing UI copy; no arbitrary error text crosses the boundary.
    const queueError = message.type === "DR_FIELD" && message.action === "discovery-queue" && ["cleanup-required", "story-review-stale", "character-discovery-known"].includes(String(code));
    return { ok: false, error: queueError ? code : safeFieldError(code) };
   }
 }); }
 removed(tabId: number) { return this.enqueue(async () => { for (const owner of await this.owners()) {
  if (owner.sourceTab === tabId) { this.stop(owner, "tab-closed"); await this.save(owner); this.wake(owner); }
  else if (owner.tabId === tabId && owner.cleanup !== "done") { if (owner.phase === "running") this.stop(owner, "tab-closed"); owner.cleanup = "failed"; await this.save(owner); }
 } }); }
 cancelLocked() { return this.enqueue(async () => { if (await this.repo.isLocked()) for (const owner of await this.owners()) { this.stop(owner, "vault-locked"); await this.save(owner); if (!owner.cleanup) this.wake(owner); } }); }
 private async flushPending() {
  const hints = new Map<string, string>();
  for (const owner of await this.owners()) if (serviceOperationId(owner.id)) {
   // Cover a suspension between saving ownership and queuing its metadata. No
   // jobs/text are reconstructed; the session's last progress stays just an audit.
   await this.audit(owner); if (validNativeStoryId(owner.chatId)) hints.set(owner.id, owner.chatId);
  }
  return this.outbox.flush(hints);
 }
 /** Metadata only: no tab navigation, model calls, owner revival or profile edits. */
 reconcilePending() { return this.enqueue(() => this.flushPending()); }
}
