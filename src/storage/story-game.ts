import { characterRevision, actionsFor, characterInChat, type CharacterRequestReceipt } from "../core/characters";
import { createId } from "../core/id";
import { validStoryGameInput, type StoryGameInput } from "../core/story-game";
import { projectStoryBranch } from "../core/story-projection";
import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryProjection, type StoryRecord, type StoryRevision } from "../core/story-records";
import { sameStoryValue } from "../core/story-value";
import type { CharacterScene, ChatBinding, DataRecord, DeepRoleSettings, SceneEntity, ScenePhoto, WorldProfile } from "../core/types";
import { planCharacterTurn } from "./characters";
import { captureStoryBaselineEffects, planStoryEffects, storyEffectsAt } from "./story-effect-replay";
import { legacyStorySnapshot, planLegacyStory } from "./story-history";
import { planStorySelection } from "./story-selection";
import { repository, type DeepRoleRepository } from "./repository";
import { confirmedDispatchText, type StoryDispatchCapture } from "../core/story-dispatch-capture";
import { parseStoryUpdate, type StoryUpdateDiagnostic } from "../core/story-update";
import { currentStoryProfileEntities, type ProfileSeeds, PROFILE_TEXT_FIELDS } from "../core/story-profile-view";
import { profileValues } from "../core/character-profile";

const rows = (all: DataRecord[]) => all.filter(r => r.kind === "story").map(r => r.data as StoryRecord);
const people = (all: DataRecord[], world: string, chat: string) => all.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === world && (r.data as SceneEntity).kind === "character" && characterInChat(r.data as SceneEntity, chat)).map(r => r.data as SceneEntity);
const state = (scene?: CharacterScene) => ({ states: scene?.states ?? {}, presentIds: scene?.presentIds ?? [], partnerIds: scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : []) });
export async function storyGameStatus(chatId: string, worldId: string, repo: DeepRoleRepository = repository) {
  return repo.updateRecords(all => {
    const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === chatId && (r.data as ChatBinding).worldId === worldId);
    return { records: [], removed: [], result: bindings.length === 1 && rows(all).some(r => r.type === "branch" && r.gameManaged && r.worldId === worldId && rows(all).some(b => b.type === "baseline" && b.id === r.baselineId && b.origin.bindingId === bindings[0]!.id && b.origin.chatId === chatId)) };
  }, undefined, ["story", "world", "binding"]);
}
/** Runtime-only permission, never accepted from the page/backup/model. */
export interface StoryImagePermission { ownerTabId: number; receipt: CharacterRequestReceipt; enabled: boolean }
export async function runStoryGame(input: StoryGameInput, settings: DeepRoleSettings, repo: DeepRoleRepository = repository, stillCurrent?: () => Promise<void>, imagePermission?: StoryImagePermission) {
  input = structuredClone(input);
  if (!validStoryGameInput(input)) throw Error("story-game-invalid");
  return repo.updateRecords<{ active: boolean; changed: boolean; freshPhotos?: ScenePhoto[]; preparedParentKey?: string | null; update?: StoryUpdateDiagnostic; revisionId?: string; repairAttempted?: boolean }>(all => planStoryGame(all, input, settings, imagePermission), stillCurrent);
}
export async function markNonStoryMessage(chatId: string, worldId: string, repo: DeepRoleRepository = repository, stillCurrent?: () => Promise<void>) {
  return repo.updateRecords(all => {
    const binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === chatId && (r.data as ChatBinding).worldId === worldId)?.data as ChatBinding | undefined;
    if (!binding || !rows(all).some(r => r.type === "branch" && r.gameManaged && rows(all).some(b => b.type === "baseline" && b.branchId === r.id && b.origin.bindingId === binding.id))) throw Error("story-binding-conflict");
    const marked = binding.nextStoryMessageMode !== "out-of-character", next = { ...binding, nextStoryMessageMode: marked ? "out-of-character" as const : undefined };
    return { records: [{ kind: "binding" as const, id: binding.id, data: next }], removed: [], result: { active: true, changed: true, marked } };
  }, stillCurrent, ["binding", "story", "world"]);
}
/** One writer for sources, events, profiles, portraits, photos and selected state.
 * The site owns its transcript; this never sends/deletes/changes a site message. */
export function planStoryGame(initial: DataRecord[], input: StoryGameInput, settings: DeepRoleSettings, imagePermission?: StoryImagePermission) {
  if (!validStoryGameInput(input)) throw Error("story-game-invalid");
  let all = structuredClone(initial);
  const freshPhotos: ScenePhoto[] = [];
  let preparedParentKey: string | null | undefined;
  assertStoryGraph(all);
  const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === input.chatId);
  let binding = bindings[0]?.data as ChatBinding | undefined;
  const world = all.find(r => r.kind === "world" && r.id === input.worldId)?.data as WorldProfile | undefined;
  if (bindings.length !== 1 || !binding || binding.worldId !== input.worldId || !world) throw Error("story-binding-conflict");
  if (characterRevision(people(all, input.worldId, input.chatId), binding.characterScenes?.[input.worldId]) !== input.expectedBase) throw Error("story-review-stale");
  const write = (changes: DataRecord[], removed: { kind: string; id: string }[] = []) => {
    const keys = new Set([...changes, ...removed].map(r => r.kind + ":" + r.id));
    all = [...all.filter(r => !keys.has(r.kind + ":" + r.id)), ...structuredClone(changes)];
    binding = all.find(r => r.kind === "binding" && r.id === binding!.id)!.data as ChatBinding;
  };
  let baseline = rows(all).find((r): r is StoryBaseline => r.type === "baseline" && r.worldId === input.worldId && r.origin.bindingId === binding!.id);
  if (input.operation === "start" || input.operation === "restart") {
    const inheritedProfiles: ProfileSeeds = {};
    const prior = baseline && rows(all).find(r => r.id === baseline!.branchId) as StoryBranch | undefined;
    if (prior?.gameManaged && input.operation !== "restart") return { records: [], removed: [], result: { active: true, changed: false } };
    if (baseline && (input.operation === "restart" || prior?.headRevisionId !== null || prior?.projectionId
      || !sameStoryValue(state(binding.characterScenes?.[input.worldId]), stateFromSnapshot(baseline.snapshot))
      || !sameStoryValue(captureStoryBaselineEffects(binding, input.worldId), baseline.legacyEffects)
      || baseline.origin.nativeAnchor && baseline.origin.nativeAnchor.nativeMessageKey !== input.snapshot.selectedNativeKey)) {
      // Preserve old sources/checkpoints unchanged. Rotate only the live binding's
      // identity, atomically; another tab cannot keep writing the archived owner.
      const rawPeople = people(all, input.worldId, input.chatId), rawById = new Map(rawPeople.map(p => [p.id, p]));
      for (const p of currentStoryProfileEntities(rawPeople, rows(all), input.worldId, input.chatId, binding.id)) {
        const raw = rawById.get(p.id)!; if (!raw.characterSheet || !p.characterSheet) continue;
        const values = Object.fromEntries(PROFILE_TEXT_FIELDS.filter(k => p.characterSheet![k] !== raw.characterSheet![k]).map(k => [k, p.characterSheet![k]]));
        if (Object.keys(values).length) inheritedProfiles[p.id] = { canonical: profileValues(raw.characterSheet), versions: { ...raw.profileFieldRevisions }, values };
      }
      const oldId = binding.id, next = { ...binding, id: createId("binding"), updatedAt: Date.now() };
      all = all.filter(r => !(r.kind === "binding" && r.id === oldId)); binding = next; all.push({ kind: "binding", id: next.id, data: next }); baseline = undefined;
    }
    if (!baseline) {
      write(planLegacyStory(all, { worldId: input.worldId, bindingId: binding.id }).records); baseline = rows(all).find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === binding!.id && r.worldId === input.worldId)!;
      if (Object.keys(inheritedProfiles).length) { baseline = { ...baseline, profileSeeds: inheritedProfiles }; write([storyRow(baseline)]); }
    }
    const branch = rows(all).find(r => r.id === baseline!.branchId) as StoryBranch;
    if (branch.gameManaged) return { records: [], removed: [], result: { active: true, changed: false } };
    if (branch.headRevisionId !== null || branch.projectionId || !sameStoryValue(state(binding.characterScenes?.[input.worldId]), stateFromSnapshot(baseline.snapshot))
      || !sameStoryValue(captureStoryBaselineEffects(binding, input.worldId), baseline.legacyEffects)) throw Error("story-start-stale");
    const anchor = input.snapshot.selectedNativeKey;
    if (anchor !== null && !input.snapshot.messages.some(m => m.identity.nativeMessageKey === anchor && m.identity.role === "assistant" && m.completion === "complete")) throw Error("story-source-incomplete");
    if (baseline.origin.nativeAnchor && baseline.origin.nativeAnchor.nativeMessageKey !== anchor) throw Error("story-start-stale");
    write([storyRow({ ...baseline, origin: { ...baseline.origin, nativeAnchor: { nativeMessageKey: anchor, role: anchor === null ? null : "assistant" } } }), storyRow({ ...branch, gameManaged: true })]);
    const chosen = planStorySelection(all, branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: branch.selectionVersion, acceptedEventIds: [] });
    write(chosen.records, chosen.removed);
  } else {
    if (!baseline?.origin.nativeAnchor) return { records: [], removed: [], result: { active: false, changed: false } };
    const branch = rows(all).find(r => r.id === baseline!.branchId) as StoryBranch;
    if (!branch.gameManaged) return { records: [], removed: [], result: { active: false, changed: false } };
    const old = rows(all).find(r => r.id === branch.projectionId) as StoryProjection;
    if (!old) throw Error("story-projection-missing");
    if (input.operation === "undo") {
      const head = rows(all).find(r => r.id === branch.headRevisionId) as StoryRevision | undefined;
      const user = head?.role === "assistant" ? rows(all).find(r => r.id === head.parentRevisionId) as StoryRevision : head;
      const target = user?.parentRevisionId ?? null;
      const chosen = planStorySelection(all, branch.id, { headRevisionId: target, expectedHeadRevisionId: branch.headRevisionId, expectedSelectionVersion: branch.selectionVersion, acceptedEventIds: old.acceptedEventIds });
      write(chosen.records, chosen.removed); write([storyRow({ ...chosen.result.branch, pausedAtRevisionId: target })]);
      assertStoryGraph(all);
      const records = all.filter(r => !initial.some(old => old.kind === r.kind && old.id === r.id && sameStoryValue(old.data, r.data)));
      const removed = initial.filter(r => !all.some(next => next.kind === r.kind && next.id === r.id)).map(r => ({ kind: r.kind, id: r.id }));
      return { records, removed, result: { active: true, changed: !!records.length || !!removed.length } };
    }
    if (Object.hasOwn(branch, "pausedAtRevisionId")) {
      if (input.operation !== "resume") throw Error("story-game-paused");
      delete branch.pausedAtRevisionId; write([storyRow(branch)]);
    }
    const manualScene = structuredClone(binding!.characterScenes?.[input.worldId]);
    const manualState = state(manualScene);
    const manualDifference = !sameStoryValue(manualState, stateFromSnapshot(old.snapshot)) || manualScene?.revision !== old.bindingRevision;
    if (manualDifference && input.manual !== "keep") throw Error("story-manual-conflict");
    if (manualDifference) {
      const effects = storyEffectsAt(rows(all), baseline, old.appliedEventIds).value;
      // Explicit preservation can reconcile character edits, never untracked photos.
      if (!sameStoryValue(captureStoryBaselineEffects(binding!, input.worldId).photos, effects.photos)) throw Error("story-effects-untracked");
      const normalizedScene = { ...effects.scene, ...stateFromSnapshot(old.snapshot), partnerId: old.snapshot.partnerIds[0] ?? null, revision: old.bindingRevision, updatedAt: Date.now() };
      write([{ kind: "binding", id: binding!.id, data: { ...binding!, characterScenes: { ...binding!.characterScenes, [input.worldId]: normalizedScene } } }]);
    }
    const samples = new Map(input.snapshot.messages.map(m => [m.identity.nativeMessageKey, m]));
    const edited = input.operation === "edit" ? samples.get(input.nativeParentKey ?? "") : undefined;
    if (input.operation === "edit" && (!edited || edited.identity.role !== "user" || edited.completion !== "complete")) throw Error("story-native-line-unavailable");
    if (edited) preparedParentKey = edited.identity.nativeParentKey;
    const desiredKey = edited ? edited.identity.nativeParentKey : input.operation === "parent" ? input.nativeParentKey : input.snapshot.selectedNativeKey;
    const line: import("../core/story-transport").NativeStorySample[] = [], seen = new Set<string>();
    let key = desiredKey;
    while (key !== baseline.origin.nativeAnchor.nativeMessageKey) {
      if (key === null || seen.has(key)) throw Error("story-native-line-unavailable");
      seen.add(key);
      const sample = samples.get(key);
      if (!sample) throw Error("story-native-line-unavailable");
      if (sample.completion !== "complete") throw Error("story-source-incomplete");
      line.push(sample); key = sample.identity.nativeParentKey;
    }
    line.reverse();
    if (line.some((s, i) => s.identity.role !== (i % 2 === 0 ? "user" : "assistant"))) throw Error("story-native-line-unavailable");
    let parent: string | null = null;
    const approved = new Set(old.acceptedEventIds);
    for (const sample of line) {
      // Native parents define ancestry. Whole-send equality may restore the
      // user's draft for a fetch receipt without a wire ID; it does not infer
      // ancestry, approve an event or grant a paid-image permission.
      const captures = sample.identity.role === "user" ? all.filter(r => r.kind === "dispatch").map(r => r.data as StoryDispatchCapture).filter(c => c.bindingId === binding!.id && c.worldId === input.worldId && c.identity.chatId === input.chatId && c.identity.nativeParentKey === sample.identity.nativeParentKey && c.delivery?.status === "accepted" && confirmedDispatchText(c) === sample.content
        && (c.wire.link ? c.wire.link.userMessageKey === sample.identity.nativeMessageKey : c.transport === "fetch" && c.injection === "context")) : [];
      if (captures.some(c => c.purpose !== captures[0]!.purpose || c.originalDraft !== captures[0]!.originalDraft)) throw Error("story-native-line-unavailable");
      const capture = captures[0];
      const content = capture?.originalDraft ?? sample.content;
      let revision = rows(all).find((r): r is StoryRevision => r.type === "revision" && r.branchId === branch.id && r.nativeMessageKey === sample.identity.nativeMessageKey && r.parentRevisionId === parent && r.content === content && r.completion === "complete");
      if (!revision) {
        const now = Date.now(), common = { format: "deeprole-story" as const, contractVersion: 1 as const, worldId: branch.worldId, playthroughId: branch.playthroughId, branchId: branch.id, createdAt: now, updatedAt: now };
        const earlier = rows(all).find((r): r is StoryRevision => r.type === "revision" && r.branchId === branch.id && r.nativeMessageKey === sample.identity.nativeMessageKey);
        const parentSource = rows(all).find(r => r.id === parent) as StoryRevision | undefined;
        const storyPurpose = sample.identity.role === "user" ? capture?.purpose === "out-of-character" ? "out-of-character" : "game" : parentSource?.storyPurpose ?? "game";
        revision = { ...common, type: "revision", id: createId("revision"), messageId: earlier?.messageId ?? createId("message"), nativeMessageKey: sample.identity.nativeMessageKey, role: sample.identity.role, content, completion: "complete", parentRevisionId: parent, requestId: null, storyPurpose };
        write([storyRow(revision)]);
        if (sample.identity.role === "assistant" && storyPurpose === "game") {
          const prefix = projectStoryBranch(rows(all), branch.id, parent, [...approved]);
          const prefixEffects = planStoryEffects(all, binding!, baseline, old.appliedEventIds, prefix.appliedEventIds, input.manual === "keep", freshPhotos);
          const prefixScene = { ...prefixEffects.metadata, ...stateFromSnapshot(prefix.snapshot), partnerId: prefix.snapshot.partnerIds[0] ?? null, revision: createId("prefix"), updatedAt: now };
          const prefixBinding = { ...binding!, scenePhotos: prefixEffects.photos, characterScenes: { ...binding!.characterScenes, [input.worldId]: prefixScene } };
          const virtual = [...all.filter(r => r.id !== binding!.id && !prefixEffects.removed.some(x => x.kind === r.kind && x.id === r.id) && !prefixEffects.records.some(x => x.kind === r.kind && x.id === r.id)), ...prefixEffects.records, { kind: "binding" as const, id: binding!.id, data: prefixBinding }];
          const base = characterRevision(people(virtual, input.worldId, input.chatId), prefixScene);
          const parentSample = samples.get(sample.identity.nativeParentKey!);
          const parentCapture = parentSample && all.find(r => r.kind === "dispatch" && (r.data as StoryDispatchCapture).bindingId === binding!.id && (r.data as StoryDispatchCapture).worldId === input.worldId && (r.data as StoryDispatchCapture).identity.chatId === input.chatId && (r.data as StoryDispatchCapture).identity.nativeParentKey === parentSample.identity.nativeParentKey && (r.data as StoryDispatchCapture).delivery?.status === "accepted" && confirmedDispatchText(r.data as StoryDispatchCapture) === parentSample.content && ((r.data as StoryDispatchCapture).wire.link?.userMessageKey === parentSample.identity.nativeMessageKey || !(r.data as StoryDispatchCapture).wire.link && (r.data as StoryDispatchCapture).transport === "fetch" && (r.data as StoryDispatchCapture).injection === "context"))?.data as StoryDispatchCapture | undefined;
          const parsed = parseStoryUpdate(sample.content, { world: input.worldId, chat: input.chatId, branch: branch.id, base, entities: people(virtual, input.worldId, input.chatId), scene: prefixScene, requestId: parentCapture?.id });
          revision = { ...revision, updateDiagnostic: parsed.diagnostic }; write([storyRow(revision)]);
          const turn = settings.characterSheetsEnabled !== false ? parsed.turn : null;
          if (turn) {
          const bound = { ...turn, world: input.worldId, chat: input.chatId, base };
          const receipt = imagePermission?.receipt;
          const paidCapture = receipt && all.find(r => r.kind === "dispatch" && (r.data as StoryDispatchCapture).id === receipt.id)?.data as StoryDispatchCapture | undefined;
          const imagesAllowed = !!imagePermission?.enabled && !!receipt?.accepted && receipt.generatedSelfiesEnabled === true
            && receipt.worldId === input.worldId && receipt.chatId === input.chatId && turn.request === receipt.id
            && Date.now() >= receipt.createdAt && Date.now() - receipt.createdAt <= 10 * 60_000
            && !rows(initial).some(r => r.type === "revision" && r.branchId === branch.id && r.nativeMessageKey === sample.identity.nativeMessageKey)
            && input.operation === "sync" && sample.identity.nativeMessageKey === desiredKey
            && paidCapture?.origin === "local" && paidCapture.ownerTabId === imagePermission.ownerTabId && paidCapture.bindingId === binding!.id && paidCapture.worldId === input.worldId
            && paidCapture.delivery?.status === "accepted" && paidCapture.wire.phase === "closed" && paidCapture.wire.sawFinish
            && paidCapture.wire.link?.assistantMessageKey === sample.identity.nativeMessageKey && paidCapture.wire.link.userMessageKey === sample.identity.nativeParentKey
            && parentSample?.content === confirmedDispatchText(paidCapture);
          const planned = planCharacterTurn(virtual, { worldId: input.worldId, chatId: input.chatId, base, chatUrl: binding!.chatUrl, replyText: sample.content, replyIdentity: sample.identity.nativeMessageKey }, bound,
            actionsFor(world.characterActions ?? settings.characterActions), false, settings.relationshipsEnabled !== false && world.relationshipsEnabled !== false,
            imagesAllowed, true); // Replay/import cannot grant paid image permission.
          for (const row of planned.records) if (row.kind === "entity" && !virtual.some(v => v.kind === "entity" && v.id === row.id)) (row.data as SceneEntity).playthroughChatId = input.chatId;
          const next = planned.records.find(r => r.kind === "binding")!.data as ChatBinding;
          const policyRejected = next.characterScenes?.[input.worldId]?.progress?.rejected ?? 0;
          if (policyRejected) {
            parsed.diagnostic.accepted = Math.max(0, parsed.diagnostic.accepted - policyRejected); parsed.diagnostic.skipped += policyRejected; parsed.diagnostic.status = "partial";
            if (parsed.diagnostic.issues.length < 60) parsed.diagnostic.issues.push({ path: "$", rule: "policy", actual: "number" });
            revision = { ...revision, updateDiagnostic: parsed.diagnostic }; write([storyRow(revision)]);
          }
          if (imagesAllowed) freshPhotos.push(...(next.scenePhotos ?? []).filter(p => p.generation?.status === "queued" && !prefixBinding.scenePhotos.some(old => old.imageKey === p.imageKey)));
          const after = legacyStorySnapshot([...virtual.filter(r => !planned.records.some(p => p.kind === r.kind && p.id === r.id)), ...planned.records], input.worldId, next);
          const ids = [...new Set([...Object.keys(prefix.snapshot.states), ...Object.keys(after.states), ...prefix.snapshot.presentIds, ...after.presentIds])];
          const event: StoryEvent = { ...common, type: "event", id: createId("event"), revisionId: revision.id, ordinal: 0, disposition: "candidate", label: "Character scene", quote: sample.content.slice(0, 4000), participantIds: ids,
            changes: ids.filter(id => !sameStoryValue(prefix.snapshot.states[id] ?? null, after.states[id] ?? null)).map(id => ({ entityId: id, before: prefix.snapshot.states[id] ?? null, after: after.states[id] ?? null })),
            sceneChange: { before: { presentIds: prefix.snapshot.presentIds, partnerIds: prefix.snapshot.partnerIds }, after: { presentIds: after.presentIds, partnerIds: after.partnerIds } },
            effects: { before: captureStoryBaselineEffects(prefixBinding, input.worldId), after: captureStoryBaselineEffects(next, input.worldId), createdEntities: planned.records.filter(r => r.kind === "entity" && !virtual.some(v => v.kind === "entity" && v.id === r.id)).map(r => r.data as SceneEntity), createdPhotos: (next.scenePhotos ?? []).filter(p => !prefixBinding.scenePhotos.some(old => sameStoryValue(old, p))) } };
          write([storyRow(event)]); approved.add(event.id);
          }
          for (const [index, fact] of parsed.facts.entries()) write([storyRow({ ...common, type: "event", id: createId("event"), revisionId: revision.id, ordinal: index + 1, disposition: "candidate", label: "Memory proposal", quote: fact.quote, participantIds: [], changes: [], memory: fact })]);
        }
      }
      for (const event of rows(all)) if (event.type === "event" && event.revisionId === revision.id && event.effects) approved.add(event.id);
      parent = revision.id;
    }
    // Explicit keep preserves only the user's delta, not cancelled story states.
    if (input.manual === "keep" && manualDifference) {
      if (!parent) throw Error("story-manual-baseline-conflict");
      const target = projectStoryBranch(rows(all), branch.id, parent, [...approved]), live = manualState;
      const changes: StoryEvent["changes"] = [];
      for (const id of new Set([...Object.keys(old.snapshot.states), ...Object.keys(live.states)])) {
        const before = target.snapshot.states[id] ?? null, original = old.snapshot.states[id], current = live.states[id];
        if (sameStoryValue(original ?? null, current ?? null)) continue;
        const after = current && original && before ? { ...before, ...Object.fromEntries([...new Set([...Object.keys(current), ...Object.keys(original)])].filter(k => !sameStoryValue(current[k as keyof typeof current], original[k as keyof typeof original])).map(k => [k, current[k as keyof typeof current]])) } : current ?? null;
        changes.push({ entityId: id, before, after });
      }
      const source = rows(all).find(r => r.id === parent) as StoryRevision, now = Date.now();
      const presentIds = [...target.snapshot.presentIds.filter(id => !old.snapshot.presentIds.includes(id) || live.presentIds.includes(id)), ...live.presentIds.filter(id => !old.snapshot.presentIds.includes(id) && !target.snapshot.presentIds.includes(id))];
      const partnerIds = [...target.snapshot.partnerIds.filter(id => !old.snapshot.partnerIds.includes(id) || live.partnerIds.includes(id)), ...live.partnerIds.filter(id => !old.snapshot.partnerIds.includes(id) && !target.snapshot.partnerIds.includes(id))].filter(id => presentIds.includes(id));
      const event: StoryEvent = { format: "deeprole-story", contractVersion: 1, type: "event", id: createId("event"), worldId: branch.worldId, playthroughId: branch.playthroughId, branchId: branch.id, createdAt: now, updatedAt: now, revisionId: parent, ordinal: Math.max(-1, ...rows(all).flatMap(e => e.type === "event" && e.revisionId === parent ? [e.ordinal] : [])) + 1, disposition: "candidate", label: "Manual edits kept", quote: source.content.slice(0, 4000), participantIds: [...new Set([...changes.map(c => c.entityId), ...target.snapshot.presentIds, ...presentIds])], changes,
        sceneChange: { before: { presentIds: target.snapshot.presentIds, partnerIds: target.snapshot.partnerIds }, after: { presentIds, partnerIds } } };
      write([storyRow(event)]); approved.add(event.id);
    }
    const chosen = planStorySelection(all, branch.id, { headRevisionId: parent, expectedHeadRevisionId: branch.headRevisionId, expectedSelectionVersion: branch.selectionVersion, acceptedEventIds: [...approved] }, input.manual === "keep", freshPhotos);
    write(chosen.records, chosen.removed);
  }
  assertStoryGraph(all);
  const records = all.filter(r => !initial.some(old => old.kind === r.kind && old.id === r.id && sameStoryValue(old.data, r.data)));
  const removed = initial.filter(r => !all.some(next => next.kind === r.kind && next.id === r.id)).map(r => ({ kind: r.kind, id: r.id }));
  const head = rows(all).find(r => r.type === "branch" && r.id === baseline!.branchId) as StoryBranch;
  const source = rows(all).find(r => r.id === head.headRevisionId) as StoryRevision | undefined;
  return { records, removed, result: { active: true, changed: !!records.length || !!removed.length, freshPhotos, ...(preparedParentKey !== undefined ? { preparedParentKey } : {}), ...(source?.updateDiagnostic ? { update: source.repairDiagnostic ?? source.updateDiagnostic, revisionId: source.id, repairAttempted: !!source.metadataRepair } : {}) } };
}
function stateFromSnapshot(value: import("../core/story-records").StorySnapshot) { return { states: structuredClone(value.states), presentIds: [...value.presentIds], partnerIds: [...value.partnerIds] }; }
