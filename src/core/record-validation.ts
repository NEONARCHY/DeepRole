import { validateLoreMapLayout } from "./lore-categories";
import { validLoreChange, validMemoryEntry, validMemoryProposal } from "./proposal-validation";
import type { DataRecord, DeepRoleSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const optionalId = (value: unknown) => value === undefined || value === null || id(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(id);
const time = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Same record shapes for full backups and portable worlds. Never repairs lore text. */
export function validDataRecord(value: unknown): value is DataRecord {
  if (!object(value) || !id(value.id) || !object(value.data) || value.data.id !== value.id) return false;
  const d = value.data;
  if (!time(d.createdAt) || !optionalId(d.worldId)) return false;
  if (value.kind !== "snapshot" && !time(d.updatedAt)) return false;
  if (d.focusIds !== undefined && !strings(d.focusIds)) return false;
  if (["world", "entity"].includes(String(value.kind)) && d.useDescriptionInContext !== undefined && typeof d.useDescriptionInContext !== "boolean") return false;
  switch (value.kind) {
    case "world":
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
    case "entity": return id(d.worldId) && typeof d.name === "string" && typeof d.description === "string" && ["character", "location", "group"].includes(String(d.kind)) && strings(d.aliases) && strings(d.memberIds);
    case "template": return id(d.worldId) && typeof d.name === "string" && typeof d.opening === "string" && typeof d.initialState === "string" && strings(d.focusIds);
    case "binding":
      return id(d.chatId) && typeof d.chatUrl === "string" && optionalId(d.bookId) && d.bookId !== undefined && integer(d.messageCountAtAnalysis, 0, Number.MAX_SAFE_INTEGER) &&
        (d.memoryOverrides === undefined || object(d.memoryOverrides) && strings(d.memoryOverrides.includedIds) && strings(d.memoryOverrides.excludedIds));
    case "snapshot": return typeof d.title === "string" && typeof d.summary === "string" && typeof d.sourceChatId === "string" && typeof d.sourceChatUrl === "string" && optionalId(d.bookId) && d.bookId !== undefined && (d.appliedAt === undefined || time(d.appliedAt));
    case "proposal": return validMemoryProposal(d) && d.items.every((item) => !item.expectedEntry || validDataRecord({ kind: "entry", id: item.expectedEntry.id, data: item.expectedEntry }));
    case "change": return validLoreChange(d) && d.entries.every((pair) => validDataRecord({ kind: "entry", id: pair.after.id, data: pair.after }) && (!pair.before || validDataRecord({ kind: "entry", id: pair.before.id, data: pair.before })));
    default: return false;
  }
}

/** Older v1 backups may lack newer settings. Only known fields are restored. */
export function parseBackupSettings(value: unknown): DeepRoleSettings {
  if (!object(value)) throw new Error("Invalid DeepRole backup");
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof DeepRoleSettings)[]) {
    if (value[key] === undefined) continue;
    const setting = value[key];
    const valid = key === "locale" ? setting === "ru" || setting === "en" :
      key === "contextBudget" ? integer(setting, 1, 16000) :
      key === "relevanceThreshold" ? integer(setting, 1, 100) :
      key === "recentMessageCount" ? integer(setting, 0, 500) :
      key === "suggestionInterval" ? integer(setting, 1, 100000) : typeof setting === "boolean";
    if (!valid) throw new Error("Invalid DeepRole backup");
    Object.assign(result, { [key]: setting });
  }
  return result;
}
