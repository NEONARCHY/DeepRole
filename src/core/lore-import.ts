import { buildBdsImport, parseBds } from "./bds-import";
import type { ActivationMode, DataRecord, MemoryEntry, MemoryPriority } from "./types";

export interface LoreImportItem {
  title: string; content: string; keywords: string[]; activation: ActivationMode;
  enabled: boolean; priority: MemoryPriority; originalImportance?: "always" | "called";
}
export interface LoreImport {
  format: "bds" | "json"; name?: string; items: LoreImportItem[]; unsupportedFields: string[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const invalid = (): never => { throw new Error("loreImportInvalid"); };
const titles = ["title", "name", "comment"];
const texts = ["content", "text", "value"];
const modes = ["activation", "importance", "mode"];
const known = new Set([...titles, ...texts, ...modes, "keywords", "keys", "key", "constant", "enabled", "disabled", "priority", "id", "uid"]);
function stringField(row: Record<string, unknown>, keys: string[]): string | undefined {
  const present = keys.filter((key) => row[key] !== undefined);
  if (present.some((key) => typeof row[key] !== "string")) invalid();
  const values = present.map((key) => row[key] as string).filter((value) => value.trim());
  // A file with conflicting text columns needs an explicit choice, not a guess.
  if (new Set(values).size > 1) invalid();
  return values[0];
}
function activation(value: unknown): ActivationMode {
  if (value === "called" || value === "smart") return "smart";
  if (value === "always" || value === "manual") return value;
  return invalid();
}

/** Only recognizable memory containers. Arbitrary JSON is not evidence of lore. */
export function parseLoreImport(text: string): LoreImport {
  if (text.length > 10_000_000) invalid();
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { return invalid(); }
  // Keep the original strict BDS path and its lossless importance mapping.
  if (object(value) && Object.values(value).length && Object.values(value).every((row) => object(row) && "importance" in row && "value" in row && Object.keys(row).every((key) => ["importance", "value"].includes(key)))) {
    const items = parseBds(text).map((item) => ({ ...item, keywords: [], activation: item.importance === "always" ? "always" as const : "smart" as const, enabled: true, priority: "normal" as const, originalImportance: item.importance }));
    return { format: "bds", items, unsupportedFields: [] };
  }
  if (object(value) && value.format !== undefined) invalid();
  const unsupported = new Set<string>();
  let rows: unknown = value; let name: string | undefined;
  if (object(value) && "entries" in value) {
    rows = value.entries;
    if (typeof value.name === "string") name = value.name;
    for (const key of Object.keys(value)) if (!["entries", "name"].includes(key)) unsupported.add(key);
  }
  const list = Array.isArray(rows) ? rows.map((row) => [undefined, row] as const) : object(rows) ? Object.entries(rows) : invalid();
  if (!list.length || list.length > 10000) invalid();
  const items = list.map(([key, value]): LoreImportItem => {
    const raw = typeof value === "string" && key ? { content: value } : value;
    if (!object(raw)) return invalid();
    const title = stringField(raw, titles) ?? key;
    const content = stringField(raw, texts);
    if (!title?.trim() || !content?.trim()) return invalid();
    const wordFields = ["keywords", "keys", "key"].filter((field) => raw[field] !== undefined);
    const wordValues = wordFields.map((field) => {
      const words = raw[field];
      if (typeof words === "string") return words.trim() ? [words] : [];
      if (!Array.isArray(words) || words.some((word) => typeof word !== "string" || !word.trim())) return invalid();
      return words as string[];
    });
    if (new Set(wordValues.map((words) => JSON.stringify(words))).size > 1) invalid();
    const selectedModes = modes.filter((field) => raw[field] !== undefined).map((field) => activation(raw[field]));
    if (new Set(selectedModes).size > 1) invalid();
    for (const field of ["constant", "enabled", "disabled"]) if (raw[field] !== undefined && typeof raw[field] !== "boolean") invalid();
    if (raw.constant === true && selectedModes.length && selectedModes[0] !== "always") invalid();
    if (typeof raw.enabled === "boolean" && typeof raw.disabled === "boolean" && raw.enabled === raw.disabled) invalid();
    if (raw.priority !== undefined && !["low", "normal", "high"].includes(String(raw.priority))) invalid();
    for (const field of Object.keys(raw)) if (!known.has(field)) unsupported.add(field);
    return { title, content, keywords: wordValues[0] ?? [], activation: selectedModes[0] ?? (raw.constant ? "always" : "smart"), enabled: raw.enabled !== false && raw.disabled !== true, priority: (raw.priority as MemoryPriority | undefined) ?? "normal", ...(raw.importance === "always" || raw.importance === "called" ? { originalImportance: raw.importance } : {}) };
  });
  return { format: "json", name, items, unsupportedFields: [...unsupported].sort() };
}

/** No inferred canon or fabricated links; the map reads these same entries. */
export function buildLoreImport(value: LoreImport, name: string, calledMode: "smart" | "manual", targetWorldId?: string): DataRecord[] {
  const records = buildBdsImport(value.items.map((item) => ({ title: item.title, content: item.content, importance: item.originalImportance ?? (item.activation === "always" ? "always" : "called") })), name, calledMode, targetWorldId);
  let index = 0;
  return records.map((record) => {
    if (record.kind !== "entry") return record;
    const item = value.items[index++]!; const entry = record.data as MemoryEntry;
    return { ...record, data: { ...entry, activation: value.format === "bds" ? entry.activation : item.activation, keywords: [...item.keywords], enabled: item.enabled, priority: item.priority, source: { type: "import", originalTitle: item.title, ...(item.originalImportance ? { originalImportance: item.originalImportance } : {}) } } };
  });
}
