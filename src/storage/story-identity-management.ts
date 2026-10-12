import { identityRows, identityReferences, identityKey, validIdentityRead, validIdentityApproval, type IdentityRead, type IdentityApproval, type IdentityPage } from "../core/story-identity-management";
import { identityOwners, identityCanonical } from "../core/story-character-identity";
import { sameStoryValue } from "../core/story-value";
import { storyRow, type StoryEvent } from "../core/story-records";
import { repository, type DeepRoleRepository } from "./repository";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { planStorySelection } from "./story-selection";

function page(all: Parameters<typeof scopedDiscovery>[0], input: IdentityRead): IdentityPage {
  const f = scopedDiscovery(all, input, true);
  const rows = identityRows(f.rawPeople, f.people, f.baseline, f.stored, f.projection.appliedEventIds);
  const offset = Math.min(input.offset, Math.max(0, Math.ceil(rows.length / 40) - 1) * 40);
  return { ...input, offset, guard: f.guard, paused: Object.hasOwn(f.branch, "pausedAtRevisionId"), total: rows.length, rows: rows.slice(offset, offset + 40), next: offset + 40 < rows.length ? offset + 40 : null };
}
export async function readStoryIdentities(input: IdentityRead, repo: DeepRoleRepository = repository) {
  input = structuredClone(input); if (!validIdentityRead(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => ({ records: [], removed: [], result: page(all, input) }));
}
export async function approveStoryIdentity(input: IdentityApproval, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  input = structuredClone(input); if (!validIdentityApproval(input)) throw Error("story-review-invalid");
  await repo.updateRecords(all => {
    const f = scopedDiscovery(all, input); discoveryGuard(f.guard, input.guard);
    const sources = identityReferences(f.baseline, f.stored, f.projection.appliedEventIds);
    const reference = sources.find(r => sameStoryValue(r.reference, input.reference));
    const person = f.rawPeople.find(p => p.id === input.reference.entityId);
    if (!reference || (person?.updatedAt ?? null) !== input.expectedUpdatedAt) throw Error("story-review-stale");
    const row = identityRows(f.rawPeople, f.people, f.baseline, f.stored, f.projection.appliedEventIds).find(r => identityKey(r.reference.entityId, r.reference.alias) === identityKey(input.reference.entityId, input.reference.alias))!;
    if (row.status === "canonical") throw Error("identity-canonical");
    if (input.enabled) {
      if (!person || !sameStoryValue(identityCanonical(person), reference.canonical)) throw Error("story-review-stale");
      if (identityOwners(f.people, input.reference.alias).some(p => p.id !== person.id)) throw Error("identity-ambiguous");
    }
    if (input.enabled === (row.status === "active") || !input.enabled && row.status === "disabled") return { records: [], removed: [], result: undefined };
    const revisionId = f.branch.headRevisionId ?? f.baseline.id, now = Date.now();
    const event: StoryEvent = { format: "deeprole-story", contractVersion: 1, type: "event", id: crypto.randomUUID(), worldId: input.worldId, playthroughId: f.baseline.playthroughId, branchId: f.branch.id, createdAt: now, updatedAt: now, revisionId, ordinal: Math.max(-1, ...f.stored.flatMap(e => e.type === "event" && e.revisionId === revisionId ? [e.ordinal] : [])) + 1, disposition: "candidate", label: "Borrowed name decision", quote: input.reference.alias, participantIds: [], changes: [], identityControl: { ...input.reference, enabled: input.enabled } };
    const changed = [...all, storyRow(event)];
    const selection = planStorySelection(changed, f.branch.id, { headRevisionId: f.branch.headRevisionId, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: [...f.projection.acceptedEventIds, event.id] });
    return { records: [storyRow(event), ...selection.records], removed: selection.removed, result: undefined };
  }, current);
  return readStoryIdentities({ worldId: input.worldId, chatId: input.chatId, offset: input.offset }, repo);
}
