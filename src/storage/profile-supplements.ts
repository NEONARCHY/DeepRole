import { PROFILE_FIELDS, profileField, profileValues, characterProfilePrompt, readProfileProposal } from "../core/character-profile";
import { isolatedFieldResult } from "../core/isolated-character-text";
import { validSupplementInput, validSupplementRead, validSupplementApproval, storyProfileEntities, appendProfileText, type SupplementInput, type SupplementRead, type SupplementApproval, type SupplementPage, type ProfileSupplement } from "../core/profile-supplements";
import { storyReplyProse } from "../core/story-update";
import { storyRow, type StoryEvent } from "../core/story-records";
import { sameStoryValue } from "../core/story-value";
import { discoveryName } from "../core/story-character-discovery";
import type { CharacterTextRequest } from "../core/character-text";
import type { Locale } from "../core/types";
import { profileExcerpts, type DiscoveryProfileBrief } from "./discovery-profile";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { planStorySelection } from "./story-selection";
import { repository, type DeepRoleRepository } from "./repository";

export interface SupplementBrief {
  input: SupplementInput; requestId: string; prompt: string; draft: CharacterTextRequest;
  sources: DiscoveryProfileBrief["sources"]; partial: boolean;
  canonical: ProfileSupplement["canonical"]; versions: ProfileSupplement["versions"];
  source: DiscoveryProfileBrief["source"];
}
const view = (f: ReturnType<typeof scopedDiscovery>) => storyProfileEntities(f.people, f.stored, f.projection.appliedEventIds, f.binding.worldId!, f.binding.chatId, f.baseline.profileSeeds, f.baseline.identitySeeds);
function unambiguous(f: ReturnType<typeof scopedDiscovery>, entity: ReturnType<typeof scopedDiscovery>["people"][number]) {
  const names = new Set([entity.name, ...entity.aliases].map(discoveryName));
  if (f.people.some(p => p.id !== entity.id && [p.name, ...p.aliases].some(n => names.has(discoveryName(n))))) throw Error("profile-ambiguous");
}
function target(f: ReturnType<typeof scopedDiscovery>, input: SupplementInput) {
  discoveryGuard(f.guard, input.guard);
  const entity = f.people.find(p => p.id === input.entityId && !!p.characterSheet), head = f.selected.find(r => r.id === f.branch.headRevisionId);
  if (!entity || !head) throw Error("scene-changed");
  unambiguous(f, entity);
  return { entity, head, visible: view(f).find(p => p.id === entity.id)! };
}
export async function readProfileSupplements(input: SupplementRead, repo: DeepRoleRepository = repository): Promise<SupplementPage> {
  input = structuredClone(input); if (!validSupplementRead(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, input); if (input.guard) discoveryGuard(f.guard, input.guard);
    const list = f.people.filter(p => !!p.characterSheet && (!input.query.trim() || [p.name, ...p.aliases].some(n => discoveryName(n).includes(discoveryName(input.query)))));
    const offset = Math.min(input.offset, Math.max(0, Math.ceil(list.length / 40) - 1) * 40), people = list.slice(offset, offset + 40).map(p => ({ id: p.id, name: p.name }));
    const selected = view(f).find(p => p.id === input.entityId), applied = new Set(f.projection.appliedEventIds);
    const suggestions = f.stored.filter((e): e is StoryEvent => e.type === "event" && e.profileSupplement?.entityId === input.entityId && f.projection.revisionIds.includes(e.revisionId)).sort((a, b) => f.projection.revisionIds.indexOf(b.revisionId) - f.projection.revisionIds.indexOf(a.revisionId) || b.ordinal - a.ordinal).slice(0, 10).map(e => ({ eventId: e.id, supplement: e.profileSupplement!, accepted: applied.has(e.id) }));
    return { records: [], removed: [], result: { worldId: input.worldId, chatId: input.chatId, guard: f.guard, query: input.query, offset, total: list.length, next: offset + people.length < list.length ? offset + people.length : null, people, target: selected?.characterSheet ? { id: selected.id, name: selected.name, values: profileValues(selected.characterSheet), suggestions } : null } };
  });
}
export async function prepareProfileSupplement(input: SupplementInput, requestId: string, locale: Locale, repo: DeepRoleRepository = repository): Promise<SupplementBrief> {
  input = structuredClone(input); if (!validSupplementInput(input) || !/^field_[0-9a-f-]{36}$/u.test(requestId)) throw Error("invalid-brief");
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, input), { entity, visible, head } = target(f, input), canonical = profileValues(entity.characterSheet!), versions = { ...entity.profileFieldRevisions };
    const { sources, partial } = profileExcerpts(f.selected, [entity.name, ...entity.aliases], { revisionId: head.id, quote: storyReplyProse(head.content).slice(0, 1000) });
    const values = profileValues(visible.characterSheet!), draft = { field: profileField(locale, "history"), currentText: JSON.stringify(values), reference: { name: entity.name, aliases: entity.aliases, ...values } };
    const prompt = characterProfilePrompt(draft, sources.map(({ id, text }) => ({ id, text })), locale, requestId)
      + "\n[SUPPLEMENT JOB — important]\nReturn ONLY NEW lasting details to APPEND, not a rewritten full field. Current profile facts are protected. Do not repeat them or remove them. Each new detail needs an exact quote from supplied PLAYED story sources. If no additional supported detail, not-found. Conflicting sources: conflict with empty text and two exact quotes. If a current author fact conflicts and two story quotes are unavailable, not-found: do not replace the author fact. Never invent fallback, goals, age or trait scores; temporary posture, clothing changes, plans and moods are not lasting personality facts. Name/aliases select ONE stable person, never a namesake. These are bounded excerpts, not the full history.";
    return { records: [], removed: [], result: { input, requestId, prompt, draft, sources, partial, canonical, versions, source: { worldId: input.worldId, chatId: input.chatId, chatUrl: f.binding.chatUrl, bookId: f.binding.bookId } } };
  });
}
export async function profileSupplementCurrent(input: SupplementInput, repo: DeepRoleRepository = repository) {
  try { return await repo.updateRecords(all => { target(scopedDiscovery(all, input), input); return { records: [], removed: [], result: true }; }); } catch { return false; }
}
export async function applyProfileSupplement(brief: SupplementBrief, raw: string, repo: DeepRoleRepository = repository) {
  const proposal = readProfileProposal(isolatedFieldResult(raw, brief.draft, { requestId: brief.requestId, sources: brief.sources }), [...PROFILE_FIELDS]);
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, brief.input), { entity, visible, head } = target(f, brief.input);
    if (entity.name !== brief.draft.reference.name || !sameStoryValue(entity.aliases, brief.draft.reference.aliases) || !sameStoryValue(profileValues(entity.characterSheet!), brief.canonical) || !sameStoryValue(entity.profileFieldRevisions ?? {}, brief.versions) || !sameStoryValue(profileValues(visible.characterSheet!), JSON.parse(brief.draft.currentText))) throw Error("scene-changed");
    const proofs: ProfileSupplement["profile"]["proofs"] = [];
    for (const k of PROFILE_FIELDS) for (const quote of proposal[k]!.evidence) { const source = brief.sources.find(s => s.text.includes(quote))!; if (!f.selected.some(r => r.id === source.revisionId && storyReplyProse(r.content).includes(quote))) throw Error("scene-changed"); if (!proofs.some(p => p.revisionId === source.revisionId && p.quote === quote)) proofs.push({ revisionId: source.revisionId, quote }); }
    const now = Date.now(), event: StoryEvent = { format: "deeprole-story", contractVersion: 1, type: "event", id: brief.requestId, worldId: brief.input.worldId, playthroughId: f.branch.playthroughId, branchId: f.branch.id, createdAt: now, updatedAt: now, revisionId: head.id, ordinal: Math.max(-1, ...f.stored.flatMap(e => e.type === "event" && e.revisionId === head.id ? [e.ordinal] : [])) + 1, disposition: "candidate", label: "Profile supplement", quote: storyReplyProse(head.content).slice(0, 1000), participantIds: [entity.id], changes: [], profileSupplement: { entityId: entity.id, canonical: brief.canonical, versions: brief.versions, profile: { headRevisionId: head.id, name: entity.name, values: profileValues(visible.characterSheet!), proposal, proofs, partial: brief.partial } } };
    const previous = f.stored.find(e => e.id === event.id);
    if (previous) { if (previous.type !== "event" || !sameStoryValue(previous.profileSupplement, event.profileSupplement)) throw Error("invalid-result"); return { records: [], removed: [], result: undefined }; }
    return { records: [storyRow(event)], removed: [], result: undefined };
  });
}
export async function approveProfileSupplement(input: SupplementApproval, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  input = structuredClone(input); if (!validSupplementApproval(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, input); discoveryGuard(f.guard, input.guard);
    const event = f.stored.find((e): e is StoryEvent => e.type === "event" && e.id === input.eventId && !!e.profileSupplement && f.projection.revisionIds.includes(e.revisionId));
    if (!event) throw Error("story-review-stale");
    const s = event.profileSupplement!, entity = f.people.find(p => p.id === s.entityId), visible = view(f).find(p => p.id === s.entityId);
    if (!entity?.characterSheet || !visible?.characterSheet) throw Error("scene-changed");
    if (input.accept) unambiguous(f, entity);
    if (input.accept && f.projection.appliedEventIds.includes(event.id)) return { records: [], removed: [], result: { entityId: entity.id, applied: 0, skipped: [] } };
    if (input.accept && s.profile.headRevisionId !== f.guard.headRevisionId) throw Error("story-review-stale");
    const values: Partial<ProfileSupplement["canonical"]> = {}, skipped: (typeof PROFILE_FIELDS[number])[] = [];
    if (input.accept) for (const k of PROFILE_FIELDS) if (input.additions[k] !== undefined) {
      if (s.profile.proposal[k]?.status !== "found") throw Error("invalid-result");
      if (entity.characterSheet[k] !== s.canonical[k] || (entity.profileFieldRevisions?.[k] ?? "") !== (s.versions[k] ?? "") || visible.characterSheet[k] !== s.profile.values[k]) { skipped.push(k); continue; }
      if (!visible.characterSheet[k].includes(input.additions[k]!.trim())) values[k] = appendProfileText(visible.characterSheet[k], input.additions[k]!);
    }
    if (input.accept && !Object.keys(values).length) return { records: [], removed: [], result: { entityId: entity.id, applied: 0, skipped } };
    const updated = { ...event, ...(input.accept ? { profileUpdate: values } : {}), ...(event.automation ? { automation: { ...event.automation, status: input.accept ? "saved" as const : "dismissed" as const, reason: "manual" as const, at: Date.now() } } : {}), updatedAt: Date.now() };
    const changed = [...all.filter(r => !(r.kind === "story" && r.id === event.id)), storyRow(updated)], accepted = f.projection.acceptedEventIds.filter(id => id !== event.id); if (input.accept) accepted.push(event.id);
    const selection = planStorySelection(changed, f.branch.id, { headRevisionId: f.branch.headRevisionId, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: accepted });
    return { records: [storyRow(updated), ...selection.records], removed: selection.removed, result: { entityId: entity.id, applied: Object.keys(values).length, skipped } };
  }, current);
}
