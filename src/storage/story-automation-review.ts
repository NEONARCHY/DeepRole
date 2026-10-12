import { createId } from "../core/id";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../core/characters";
import { profileValues, PROFILE_FIELDS, type ProfileValues } from "../core/character-profile";
import { automationReviews, normalizedFact, storyFactConflicts } from "../core/story-automation";
import { storyFactIdentity } from "../core/story-memory-lifecycle";
import { validAutomationReviewRead, validAutomationReviewDecision, type AutomationReviewRead, type AutomationReviewDecision, type AutomationReviewPage } from "../core/story-automation-review";
import { storyRow, type StoryEvent } from "../core/story-records";
import { storyProfileEntities, appendProfileText } from "../core/story-profile-view";
import type { SceneEntity, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { storyEffectsAt } from "./story-effect-replay";
import { planStorySelection } from "./story-selection";
function scope(all: import("../core/types").DataRecord[], input: { chatId: string; worldId: string }) {
  const f = scopedDiscovery(all, input, true, true), world = all.find(r => r.kind === "world" && r.id === input.worldId)?.data as WorldProfile;
  if (!world?.sharedGame || world.sharedGame.activeBindingId !== f.binding.id || world.sharedGame.activeChatId !== input.chatId || f.baseline.gameId !== world.sharedGame.id) throw Error("story-game-inactive");
  const reviews = automationReviews(f.stored, f.baseline, f.projection);
  const people = storyProfileEntities(f.people, f.stored, f.projection.appliedEventIds, input.worldId, input.chatId, f.baseline.profileSeeds, f.baseline.identitySeeds, f.baseline.mergeSeeds);
  return { ...f, world, reviews, people };
}
function page(f: ReturnType<typeof scope>, query: string): AutomationReviewPage {
  const head = f.selected.find(r => r.id === f.branch.headRevisionId);
  return { chatId: f.binding.chatId, worldId: f.world.id, guard: f.guard, gameRevision: f.world.sharedGame!.revision, ready: !!head && head.role === "assistant" && !Object.hasOwn(f.branch, "pausedAtRevisionId"), total: f.reviews.pending.length,
    people: f.people.filter(p => !query || normalizedFact(p.name).includes(normalizedFact(query))).slice(0,40).map(p => ({ id: p.id, name: p.name.slice(0,80) })),
    items: f.reviews.pending.slice(0,8).map(id => {
      const e = f.stored.find(r => r.id === id) as StoryEvent, profile = e.profileSupplement?.profile ?? e.characterProfile;
      return { id, type: e.memory ? "fact" : e.profileSupplement ? "profile" : "person", name: e.characterCandidate?.name ?? profile?.name ?? "", text: e.memory?.text ?? "", quote: e.quote, reason: e.automation!.reason,
        fields: Object.fromEntries(PROFILE_FIELDS.flatMap(k => profile?.proposal[k]?.status === "found" ? [[k, profile.proposal[k]!.text]] : [])) as Partial<ProfileValues>,
        ...(e.memory && e.automation?.reason !== "new" ? {conflicts:storyFactConflicts(e.memory,f.world.sharedGame!.facts).map(p => ({key:storyFactIdentity(p),text:p.text,quote:p.quote}))} : {}) };
    }) };
}
export async function readAutomationReview(input: AutomationReviewRead, repo: DeepRoleRepository = repository): Promise<AutomationReviewPage> {
  input = structuredClone(input); if (!validAutomationReviewRead(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => ({ records: [], removed: [], result: page(scope(all,input), input.query) }));
}
/** Resolve at the current scene, retaining the original source in this same game.
 * A selected resolution is reversible; old proposals and author profiles stay intact. */
export async function resolveAutomationReview(input: AutomationReviewDecision, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  input = structuredClone(input); if (!validAutomationReviewDecision(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    const f = scope(all,input); discoveryGuard(f.guard,input.guard);
    if (f.world.sharedGame!.revision !== input.gameRevision || !f.reviews.pending.includes(input.eventId)) throw Error("story-review-stale");
    const head = f.selected.find(r => r.id === f.branch.headRevisionId);
    if (!head || head.role !== "assistant" || Object.hasOwn(f.branch,"pausedAtRevisionId")) throw Error("story-checkpoint-busy");
    const origin = f.stored.find(r => r.id === input.eventId) as StoryEvent, now = Date.now();
    if (input.replaceKeys?.length && (!input.accept || !origin.memory || input.replaceKeys.some(k => !storyFactConflicts(origin.memory!,f.world.sharedGame!.facts).some(p => storyFactIdentity(p) === k)))) throw Error("story-review-stale");
    const e: StoryEvent = { format: "deeprole-story", contractVersion: 1, type: "event", id: createId("event"), worldId: f.world.id, playthroughId: f.branch.playthroughId, branchId: f.branch.id, revisionId: head.id, ordinal: Math.max(-1,...f.stored.flatMap(r => r.type === "event" && r.revisionId === head.id ? [r.ordinal] : [])) + 1, disposition: "candidate", label: origin.label, quote: origin.quote, participantIds: [], changes: [], originEventId: origin.id, automation: { mode: "review", status: input.accept ? "saved" : "dismissed", reason: "manual", at: now }, createdAt: now, updatedAt: now };
    if (input.accept && origin.memory) {
      if (input.fields.length || input.entityId || input.name) throw Error("story-review-invalid");
      e.memory = structuredClone(origin.memory);
      if (input.replaceKeys?.length) e.memory.replaces = [...input.replaceKeys];
    } else if (input.accept) {
      const profile = origin.profileSupplement?.profile ?? origin.characterProfile;
      if (!profile || input.fields.some(k => profile.proposal[k]?.status !== "found")) throw Error("story-review-invalid");
      const entityId = origin.profileSupplement?.entityId ?? input.entityId;
      const entity = entityId ? f.rawPeople.find(p => p.id === entityId) : undefined;
      const visible = entity && f.people.find(p => p.id === entity.id);
      if (entityId && (!entity?.characterSheet || !visible?.characterSheet)) throw Error("scene-changed");
      if (origin.profileSupplement && (input.entityId && input.entityId !== origin.profileSupplement.entityId || input.name)) throw Error("story-review-invalid");
      const additions = Object.fromEntries(input.fields.map(k => [k, profile.proposal[k]!.text])) as Partial<ProfileValues>;
      if (entity?.characterSheet && visible?.characterSheet) {
        if (!input.fields.length) throw Error("facts-not-found");
        e.participantIds = [entity.id];
        e.profileSupplement = { entityId: entity.id, canonical: profileValues(entity.characterSheet), versions: { ...entity.profileFieldRevisions }, profile: { ...structuredClone(profile), headRevisionId: head.id, name: entity.name, values: profileValues(visible.characterSheet) } };
        e.profileUpdate = Object.fromEntries(input.fields.map(k => [k, appendProfileText(visible.characterSheet![k], additions[k]!)]));
      } else {
        const name = input.name.trim() || origin.characterCandidate?.name || "";
        if (!name || f.people.some(p => [p.name,...p.aliases].some(n => normalizedFact(n) === normalizedFact(name)))) throw Error("profile-ambiguous");
        const person: SceneEntity = { id: createId("character"), worldId: f.world.id, kind: "character", name, aliases: [], description: "", memberIds: [], createdAt: now, updatedAt: now, playthroughChatId: input.chatId, characterSheet: { ...structuredClone(EMPTY_CHARACTER), ...additions } };
        e.characterCandidate = { ...origin.characterCandidate!, name, dismissed: false }; e.characterProfile = { ...structuredClone(profile), name, headRevisionId: head.id };
        e.participantIds = [person.id]; e.changes = [{ entityId: person.id, before: null, after: structuredClone(EMPTY_STATUS) }];
        const effects = storyEffectsAt(f.stored,f.baseline,f.projection.appliedEventIds).value;
        e.effects = { before: effects, after: structuredClone(effects), createdEntities: [person], createdPhotos: [] };
      }
    }
    const accepted = [...f.projection.acceptedEventIds,e.id], changed = [...all,storyRow(e)];
    const selection = planStorySelection(changed,f.branch.id,{ headRevisionId: f.branch.headRevisionId, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: accepted });
    return { records: [storyRow(e),...selection.records], removed: selection.removed, result: { changed: true } };
  },current);
}
