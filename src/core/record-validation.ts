import { validOldChatNoticeReceipt, chatId as validNoticeChatId } from "./old-chat-notice";
import { validWorldGame } from "./world-game";
import { validStoryAutomationPolicy } from "./story-automation";
import { validMemoryBatchPolicy } from "./story-memory-batch";
import { validateLoreMapLayout } from "./lore-categories";
import { validLoreChange, validMemoryEntry, validMemoryProposal } from "./proposal-validation";
import type { DataRecord, DeepRoleSettings } from "./types";
import { validImageAttempts } from "./image-plan";
import { DEFAULT_SETTINGS } from "./defaults";
import { validCharacterSheet, validCharacterScenes, validActions } from "./characters";
import { normalizeActionRecord, normalizeActionSettings } from "./action-compat";
import { validPortraitLayouts } from "./portrait-layout";
import { validStoryContinuation } from "./story-continuation";
import { validScenePhotos } from "./selfies";
import { validRecoveredReplies } from "./reply-recovery";
import { validIllustration } from "./image-generation";
import { validPortraitMaxEdge, validPortraitPreviewSize } from "./portrait-upload";
import { validStoryRecord } from "./story-records";
import { validServiceOperation } from "./service-operations";
import { validStoryDispatchCapture } from "./story-dispatch-capture";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const optionalId = (value: unknown) => value === undefined || value === null || id(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(id);
const time = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Same record shapes for full backups and portable worlds. Never repairs lore text. */
import { validProfileVersions } from "./story-profile-view";
export function validDataRecord(value: unknown): value is DataRecord {
  value = normalizeActionRecord(value);
  if (!object(value) || !id(value.id) || !object(value.data) || value.data.id !== value.id) return false;
  const d = value.data;
  if (d.profileFieldRevisions !== undefined && !validProfileVersions(d.profileFieldRevisions)) return false;
  if (!time(d.createdAt) || !optionalId(d.worldId)) return false;
  if (value.kind !== "snapshot" && !time(d.updatedAt)) return false;
  if (d.focusIds !== undefined && !strings(d.focusIds)) return false;
  if (d.continuationSnapshotId !== undefined && !id(d.continuationSnapshotId)) return false;
  if (value.kind === "snapshot" && d.continuation !== undefined && !validStoryContinuation(d.continuation)) return false;
  if (value.kind === "snapshot" && d.memoryOverrides !== undefined && (!object(d.memoryOverrides) || !strings(d.memoryOverrides.includedIds) || !strings(d.memoryOverrides.excludedIds))) return false;
  if (["world", "entity"].includes(String(value.kind)) && d.useDescriptionInContext !== undefined && typeof d.useDescriptionInContext !== "boolean") return false;
  switch (value.kind) {
    case "dispatch": return validStoryDispatchCapture(d);
    case "service": return validServiceOperation(d);
    case "story": return validStoryRecord(d);
    case "illustration": return validIllustration(d);
    case "world":
      if (d.storyMemoryBatch !== undefined && !validMemoryBatchPolicy(d.storyMemoryBatch)) return false;
      if (d.storyAutomation !== undefined && !validStoryAutomationPolicy(d.storyAutomation)) return false;
      if (d.sharedGame !== undefined && !validWorldGame(d.sharedGame) || d.sharedGameArchives !== undefined && (!Array.isArray(d.sharedGameArchives) || !d.sharedGameArchives.every(validWorldGame))) return false;
      if (d.autoPrepareCharacters !== undefined && typeof d.autoPrepareCharacters !== "boolean") return false;
      if (d.relationshipsEnabled !== undefined && typeof d.relationshipsEnabled !== "boolean") return false;
      if (d.characterActions !== undefined && !validActions(d.characterActions)) return false;
      if (typeof d.name !== "string" || typeof d.description !== "string" || typeof d.color !== "string" || !integer(d.contextBudget, 500, 16000) || typeof d.relevanceThreshold !== "number" || ![4, 6, 8, 9].includes(d.relevanceThreshold)) return false;
      try { if (d.mapLayout !== undefined) validateLoreMapLayout(d.mapLayout); } catch { return false; }
      return true;
    case "book": return typeof d.name === "string" && typeof d.description === "string" && typeof d.color === "string" && typeof d.active === "boolean";
    case "entry":
      return validMemoryEntry(d) && (d.mapCategory === undefined || typeof d.mapCategory === "string" && d.mapCategory.length <= 80) &&
        (d.links === undefined || Array.isArray(d.links) && d.links.length <= 100 && d.links.every((link: unknown) => object(link) && id(link.targetId) && link.targetId !== d.id && typeof link.label === "string" && link.label.length <= 160 && ["context", "reference"].includes(String(link.mode)))) &&
        object(d.source) && ["manual", "selection", "suggestion", "handoff", "import"].includes(String(d.source.type)) &&
        (["chatId", "quote", "originalTitle"] as const).every((key) => d.source[key] === undefined || typeof d.source[key] === "string") &&
        (d.source.originalImportance === undefined || ["always", "called"].includes(String(d.source.originalImportance)));
    case "entity": return id(d.worldId) && (d.sharedInWorld === undefined || d.sharedInWorld === true) && (d.playthroughChatId === undefined || typeof d.playthroughChatId === "string" && /^[\w-]{1,120}$/u.test(d.playthroughChatId)) && typeof d.name === "string" && typeof d.description === "string" && ["character", "location", "group"].includes(String(d.kind)) && strings(d.aliases) && strings(d.memberIds) && (d.characterSheet === undefined || validCharacterSheet(d.characterSheet));
    case "template": return id(d.worldId) && typeof d.name === "string" && typeof d.opening === "string" && typeof d.initialState === "string" && strings(d.focusIds);
    case "binding":
      return (d.oldChatNotice === undefined || validOldChatNoticeReceipt(d.oldChatNotice)) && (d.nextStoryMessageMode === undefined || d.nextStoryMessageMode === "out-of-character") && id(d.chatId) && typeof d.chatUrl === "string" && optionalId(d.bookId) && d.bookId !== undefined && integer(d.messageCountAtAnalysis, 0, Number.MAX_SAFE_INTEGER) &&
        (d.memoryOverrides === undefined || object(d.memoryOverrides) && strings(d.memoryOverrides.includedIds) && strings(d.memoryOverrides.excludedIds)) && (d.characterScenes === undefined || validCharacterScenes(d.characterScenes)) && (d.portraitLayouts === undefined || validPortraitLayouts(d.portraitLayouts)) && (d.recoveredReplies === undefined || validRecoveredReplies(d.recoveredReplies)) && (d.scenePhotos === undefined || validScenePhotos(d.scenePhotos)) && (d.illustrationAttempts === undefined || validImageAttempts(d.illustrationAttempts));
    case "snapshot": return (d.sharedGameRevision === undefined || typeof d.sharedGameRevision === "string" && /^[A-Za-z0-9_-]{1,160}$/u.test(d.sharedGameRevision)) && (d.targetChatId === undefined || validNoticeChatId(d.targetChatId) && d.targetChatId !== d.sourceChatId && time(d.appliedAt)) && typeof d.title === "string" && typeof d.summary === "string" && typeof d.sourceChatId === "string" && typeof d.sourceChatUrl === "string" && optionalId(d.bookId) && d.bookId !== undefined && (d.appliedAt === undefined || time(d.appliedAt)) && (d.characterScene === undefined || validCharacterScenes({ snapshot: d.characterScene }));
    case "proposal": return validMemoryProposal(d) && d.items.every((item) => !item.expectedEntry || validDataRecord({ kind: "entry", id: item.expectedEntry.id, data: item.expectedEntry }));
    case "change": return validLoreChange(d) && d.entries.every((pair) => validDataRecord({ kind: "entry", id: pair.after.id, data: pair.after }) && (!pair.before || validDataRecord({ kind: "entry", id: pair.before.id, data: pair.before })));
    default: return false;
  }
}

/** Older v1 backups may lack newer settings. Only known fields are restored. */
export function parseBackupSettings(value: unknown): DeepRoleSettings {
  value = normalizeActionSettings(value);
  if (!object(value)) throw new Error("Invalid DeepRole backup");
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof DeepRoleSettings)[]) {
    if (value[key] === undefined) continue;
    const setting = value[key];
    const valid = key === "portraitLayoutResetAt" ? time(setting) && (setting as number) <= Number.MAX_SAFE_INTEGER : key === "characterActions" ? validActions(setting) : key === "locale" ? setting === "ru" || setting === "en" :
      key === "portraitMaxEdge" ? validPortraitMaxEdge(setting) :
      key === "portraitPreviewSize" || key === "referencePreviewSize" ? validPortraitPreviewSize(setting) :
      key === "floatingPanelWidth" ? integer(setting, 200, 360) :
      key === "chatContextCapacity" ? integer(setting, 8000, 2000000) :
      key === "relationshipDisplay" ? ["both", "numbers", "stages"].includes(String(setting)) :
      key === "contextBudget" ? integer(setting, 1, 16000) :
      key === "relevanceThreshold" ? integer(setting, 1, 100) :
      key === "recentMessageCount" ? integer(setting, 0, 500) :
      key === "suggestionInterval" ? integer(setting, 1, 100000) : typeof setting === "boolean";
    if (!valid) throw new Error("Invalid DeepRole backup");
    Object.assign(result, { [key]: setting });
  }
  return result;
}
