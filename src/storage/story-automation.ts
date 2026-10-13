import type { DataRecord, SceneEntity, WorldProfile } from "../core/types";
import type { StoryBaseline, StoryBranch, StoryEvent, StoryRecord, StoryRevision } from "../core/story-records";
import { storyRow } from "../core/story-records";
import { createId } from "../core/id";
import { EMPTY_CHARACTER, EMPTY_STATUS, characterInChat } from "../core/characters";
import { projectStoryBranch } from "../core/story-projection";
import { profileValues, type ProfileProposal, type ProfileValues } from "../core/character-profile";
import { storyProfileEntities, appendProfileText, PROFILE_TEXT_FIELDS } from "../core/story-profile-view";
import { compactStoryFacts, type StoryFact } from "../core/story-update";
import { sameStoryValue } from "../core/story-value";
import type { StoryDispatchCapture } from "../core/story-dispatch-capture";
import { automationMode, factAutomationReason, inlineStoryPeople, normalizedFact, literalEvidence, sensitiveStoryText, conflictingStoryText, type AutomationReason, type StoryAutomationDecision, automationReviews } from "../core/story-automation";
import { storyEffectsAt } from "./story-effect-replay";
import { storyFactIdentity } from "../core/story-memory-lifecycle";
import { bindStoryRoles } from "../core/story-role-binding";

/** One completed reply is one bounded portion. Stored events are the durable work
 * receipt, and the existing selected-line replay owns every resulting effect. */
export function planStoryAccompaniment(all: DataRecord[], world: WorldProfile, baseline: StoryBaseline, branch: StoryBranch, source: StoryRevision, approved: Set<string>, capture: StoryDispatchCapture | undefined, facts: StoryFact[], raw: Record<string, unknown> | null, chatId: string, batch?: { source: StoryRevision; capture: import("../core/story-automation").StoryAutomationCapture }) {
  const stored = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord), result: DataRecord[] = [];
  const selected = projectStoryBranch(stored, branch.id, source.id, [...approved]);
  const applicable = stored.filter((e): e is StoryEvent => e.type === "event" && selected.appliedEventIds.includes(e.id)).sort((a,b) => selected.revisionIds.indexOf(a.revisionId)-selected.revisionIds.indexOf(b.revisionId) || a.ordinal-b.ordinal);
  const rawPeople = new Map(applicable.flatMap(e => e.effects?.createdEntities ?? []).map(p => [p.id, p]));
  for (const row of all) if (row.kind === "entity" && (row.data as SceneEntity).worldId === world.id && characterInChat(row.data as SceneEntity, chatId)) rawPeople.set(row.id, row.data as SceneEntity);
  let people = storyProfileEntities([...rawPeople.values()], stored, selected.appliedEventIds, world.id, chatId, baseline.profileSeeds, baseline.identitySeeds, baseline.mergeSeeds);
  const actualPolicy = world.storyAutomation;
  const permission = batch?.capture ?? capture?.accompaniment;
  const auto = actualPolicy?.mode === "automatic" && permission?.mode === "automatic" && permission.revision === actualPolicy.revision && (!!batch || capture?.origin === "local" && capture.purpose === "user-turn" && capture.delivery?.status === "accepted" && capture.injection === "context");
  const mode = auto ? "automatic" as const : "review" as const, now = Date.now();
  const decision = (reason: AutomationReason): StoryAutomationDecision => ({ mode, status: reason === "duplicate" ? "duplicate" : auto && reason === "new" ? "saved" : "review", reason: reason === "new" && !auto ? permission ? "manual" : "unverified" : reason, at: now });
  const common = { ...(batch ? { memoryBatchSourceRevisionId: batch.source.id } : {}), format: "deeprole-story" as const, contractVersion: 1 as const, type: "event" as const, worldId: source.worldId, playthroughId: source.playthroughId, branchId: branch.id, revisionId: source.id, createdAt: now, updatedAt: now, disposition: "candidate" as const };
  let ordinal = Math.max(-1, ...stored.flatMap(e => e.type === "event" && e.revisionId === source.id ? [e.ordinal] : [])) + 1;
  const previous = compactStoryFacts([...(baseline.factSeeds ?? []), ...applicable.flatMap(e => e.memory ? [e.memory] : [])]);
  const reviews = automationReviews(stored,baseline,selected);
  const held = stored.filter((e): e is StoryEvent => e.type === "event" && (selected.revisionIds.includes(e.revisionId) || reviews.pending.includes(e.id) || reviews.resolutions[e.id] === "dismissed") && (e.automation?.status === "review" || e.automation?.status === "dismissed" || reviews.resolutions[e.id] === "dismissed"));
  const protectedTexts = all.flatMap(r => r.kind === "entry" && (r.data as import("../core/types").MemoryEntry).worldId === world.id && (r.data as import("../core/types").MemoryEntry).enabled ? [(r.data as import("../core/types").MemoryEntry).content] : []).concat(people.flatMap(p => p.characterSheet ? PROFILE_TEXT_FIELDS.map(k => p.characterSheet![k]).filter(Boolean) : []));
  for (const fact of facts) {
    const original = Array.isArray(raw?.facts) ? raw.facts.find(f => f && typeof f === "object" && storyFactIdentity(f as StoryFact) === storyFactIdentity(fact) && (f as StoryFact).quote === fact.quote) as Record<string, unknown> | undefined : undefined;
    if (automationMode(world) === "off" && world.storyAutomation) continue;
    const automation = decision(factAutomationReason(fact, original?.risk, previous, protectedTexts));
    if (held.some(e => e.memory && storyFactIdentity(e.memory) === storyFactIdentity(fact))) continue;
    const event: StoryEvent = { ...common, id: createId("event"), ordinal: ordinal++, label: "Memory proposal", quote: fact.quote, participantIds: [], changes: [], memory: fact, memoryRoles: bindStoryRoles(fact,batch?.source??source), ...(world.storyAutomation ? { automation } : {}) };
    result.push(storyRow(event));
    if (automation.status === "saved") { approved.add(event.id); previous.push(fact); }
  }
  if (automationMode(world) === "off") return result;
  for (const person of inlineStoryPeople(raw?.people, (batch?.source ?? source).content)) {
    if (held.some(e => e.characterCandidate && normalizedFact(e.characterCandidate.name) === normalizedFact(person.name) || e.profileSupplement && e.profileSupplement.entityId === person.id && person.fields.every(f => e.profileSupplement!.profile.proposal[f.key]?.text === f.text))) continue;
    const owners = people.filter(p => [p.name, ...p.aliases].some(n => normalizedFact(n) === normalizedFact(person.name)));
    const exact = people.find(p => p.id === person.id), created = person.id === "new:" + person.name;
    const entity = exact ?? (created && owners.length === 1 ? owners[0] : undefined);
    let reason: AutomationReason = person.risk === "conflict" ? "conflict" : person.risk !== "ordinary" ? "uncertain" : "new";
    if (owners.length > 1 || !created && (!exact || normalizedFact(exact.name) !== normalizedFact(person.name)) || owners.length && !entity || entity && owners.some(p => p.id !== entity.id)) reason = "identity";
    const origin = entity ? rawPeople.get(entity.id) : undefined;
    const values = profileValues(entity?.characterSheet ?? EMPTY_CHARACTER), proposal: ProfileProposal = {}, proofs: { revisionId: string; quote: string }[] = [];
    const additions: Partial<ProfileValues> = {};
    for (const k of PROFILE_TEXT_FIELDS) {
      const field = person.fields.find(f => f.key === k);
      proposal[k] = { status: "not-found", text: "", evidence: [] };
      if (!field) continue;
      proposal[k] = { status: "found", text: field.text, evidence: [field.quote] }; proofs.push({ revisionId: batch?.source.id ?? source.id, quote: field.quote });
      if (entity?.characterSheet && literalEvidence(field.text, values[k])) continue;
      if (field.risk === "conflict" || conflictingStoryText(values[k], field.text)) { reason = "conflict"; continue; }
      if (field.risk !== "ordinary" || !literalEvidence(field.text, field.quote)) { reason = "unverified"; continue; }
      if (sensitiveStoryText(field.text) || entity?.characterSheet?.protectedProfileFields?.includes(k) || permission?.profileLocks[entity?.id ?? ""]?.includes(k)) { reason = "protected"; continue; }
      if (origin && all.some(r => r.kind === "entity" && r.id === origin.id) && (!permission || !Object.hasOwn(permission.profileVersions, entity!.id) || !sameStoryValue(permission.profileVersions[entity!.id]?.[k] ?? "", origin.profileFieldRevisions?.[k] ?? ""))) { reason = "protected"; continue; }
      try { additions[k] = appendProfileText(values[k], field.text); } catch { reason = "limit"; }
    }
    const profile = { headRevisionId: source.id, name: person.name, values, proposal, proofs: proofs.filter((p,i,a) => a.findIndex(other => other.quote === p.quote) === i), partial: true };
    if (entity?.characterSheet) {
      if (!person.fields.length || !Object.keys(additions).length && reason === "new") continue;
      const automation = decision(reason);
      const event: StoryEvent = { ...common, id: createId("event"), ordinal: ordinal++, label: "Profile additions", quote: person.quote, participantIds: [entity.id], changes: [], profileSupplement: { entityId: entity.id, canonical: profileValues(origin?.characterSheet ?? entity.characterSheet), versions: { ...origin?.profileFieldRevisions }, profile }, ...(automation.status === "saved" ? { profileUpdate: additions } : {}), automation };
      result.push(storyRow(event));
      if (automation.status === "saved") { approved.add(event.id); people = people.map(p => p.id === entity.id ? { ...p, characterSheet: { ...p.characterSheet!, ...additions } } : p); }
    } else {
      if (!created && reason === "new") reason = "identity";
      const automation = decision(reason), event: StoryEvent = { ...common, id: createId("event"), ordinal: ordinal++, label: "Character discovery", quote: person.quote, participantIds: [], changes: [], characterCandidate: { name: person.name, quote: person.quote, dismissed: false }, characterProfile: profile, automation };
      if (automation.status === "saved") {
        const p: SceneEntity = { id: createId("character"), kind: "character", worldId: world.id, name: person.name, aliases: [], description: "", memberIds: [], createdAt: now, updatedAt: now, playthroughChatId: chatId, characterSheet: { ...structuredClone(EMPTY_CHARACTER), ...additions } };
        const effects = storyEffectsAt(stored, baseline, selected.appliedEventIds).value;
        event.participantIds = [p.id]; event.changes = [{ entityId: p.id, before: null, after: structuredClone(EMPTY_STATUS) }]; event.effects = { before: effects, after: structuredClone(effects), createdEntities: [p], createdPhotos: [] };
        approved.add(event.id); people.push(p); rawPeople.set(p.id,p);
      }
      result.push(storyRow(event));
    }
  }
  return result;
}
