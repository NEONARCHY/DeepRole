import type { ContinuationDraft } from "../core/continuation-flow";
import type { StoryGameInput, StoryGameSnapshot } from "../core/story-game";
import type { ChatBinding, DataRecord, DeepRoleSettings, SceneEntity, WorldProfile } from "../core/types";
import { characterInChat, characterRevision } from "../core/characters";
import { automationMarker, validStoryAutomationCapture } from "../core/story-automation";
import { explicitOutOfCharacter } from "../core/story-message-mode";
import { planStoryGame, type ContinuationOpeningPermission } from "./story-game";

/** Called only after the background has matched the complete first pair to the
 * pre-send session digest, under the same guard as the transfer transaction. */
export function planRecoveredContinuationTurn(initial: DataRecord[], worldId: string, chatId: string, draft: ContinuationDraft, history: StoryGameSnapshot, settings: DeepRoleSettings): DataRecord[] {
  const world = initial.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
  if (!world?.storyAutomation || world.storyAutomation.mode === "off") return initial;
  const user = history.messages.find(m => m.identity.role === "user")!;
  const suffix = "\n\n[User message]\n" + draft.draft;
  // Exact original suffix only; markers in player prose never authorize stripping.
  if (!user.content.endsWith(suffix) || !draft.requestId) throw Error("handoff-opening-conflict");
  const context = user.content.slice(0, -suffix.length);
  const policy = draft.automation;
  const automation = policy && validStoryAutomationCapture(policy) && context.includes(automationMarker({ ...world, storyAutomation: { mode: policy.mode, revision: policy.revision } })) ? policy : undefined;
  const permission: ContinuationOpeningPermission = { userKey: user.identity.nativeMessageKey, originalDraft: draft.draft, requestId: draft.requestId,
    purpose: draft.purpose ?? (explicitOutOfCharacter(draft.draft, world.bracketedOoc === true) ? "out-of-character" : "user-turn"), automation };
  let all = initial;
  for (const operation of ["start", "sync"] as const) {
    const binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === chatId)?.data as ChatBinding | undefined;
    if (!binding || binding.worldId !== worldId) throw Error("handoff-opening-conflict");
    const entities = all.filter(r => r.kind === "entity").map(r => r.data as SceneEntity).filter(e => e.worldId === worldId && e.kind === "character" && characterInChat(e, chatId));
    const input: StoryGameInput = { operation, worldId, chatId, expectedBase: characterRevision(entities, binding.characterScenes?.[worldId]), nativeParentKey: null, manual: "stop",
      snapshot: operation === "start" ? { chatId, selectedNativeKey: null, messages: [] } : history };
    const planned = planStoryGame(all, input, settings, undefined, permission);
    const keys = new Set([...planned.records, ...planned.removed].map(r => r.kind + ":" + r.id));
    all = [...all.filter(r => !keys.has(r.kind + ":" + r.id)), ...planned.records];
  }
  return all;
}
