import { readNativeStoryHistory } from "./story-native-history";
import { nativeStoryMessageKey, validNativeStoryId } from "./story-transport";
import { storyText } from "./story-continuation";
import type { StoryContinuation } from "./types";

export interface FieldSource { id: string; role?: "user" | "assistant"; text: string }
export interface FieldHistoryReference { origin: "native" | "visible"; partial: true; sources: FieldSource[] }
export interface FieldHistoryQuery { name: string; aliases: string[]; field: string; relatedNames?: string[] }
const MAX_REFERENCE = 48_000;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const normalize = (s: string) => s.toLocaleLowerCase().replace(/ё/gu, "е");
export function validFieldHistoryQuery(v: unknown): v is FieldHistoryQuery {
  if (!record(v)) return false;
  return Object.keys(v).every(k => ["name", "aliases", "field", "relatedNames"].includes(k)) && typeof v.name === "string" && !!v.name.trim() && v.name.length <= 80 && typeof v.field === "string" && !!v.field.trim() && v.field.length <= 200
    && Array.isArray(v.aliases) && v.aliases.length <= 20 && v.aliases.every(a => typeof a === "string" && !!a.trim() && a.length <= 80)
    && (v.relatedNames === undefined || Array.isArray(v.relatedNames) && v.relatedNames.length <= 12 && v.relatedNames.every(a => typeof a === "string" && !!a.trim() && a.length <= 80));
}
/** Related people are retrieval hints, never aliases/identity of the new character. */
export function profileRelatedNames(reference: Record<string, unknown>, entities: { name: string; aliases: string[] }[]): string[] {
 const seed = normalize([reference.description, reference.appearance, reference.personality, reference.goals, reference.background].filter(v => typeof v === "string").join("\n"));
 const own = typeof reference.name === "string" ? normalize(reference.name) : "";
 const mentioned = (name: string) => {
  const base = normalize(name), forms = [base];
  // Bounded Russian case variants for retrieval only, not an identity decision.
  if (base.length >= 3 && /[ая]$/u.test(base)) forms.push(...(base.endsWith("а") ? ["ы", "е", "у", "ой", "ою"] : ["и", "е", "ю", "ей", "ею"]).map(ending => base.slice(0, -1) + ending));
  return forms.some(n => { let offset = seed.indexOf(n); while (offset >= 0) { if (!/[\p{L}\p{N}]/u.test(seed[offset - 1] ?? "") && !/[\p{L}\p{N}]/u.test(seed[offset + n.length] ?? "")) return true; offset = seed.indexOf(n, offset + n.length); } return false; });
 };
 return [...new Set(entities.flatMap(e => [e.name, ...e.aliases].flatMap(n => [n, ...(n.includes(" ") ? [n.split(" ")[0]!] : [])])).filter(n => n.trim() && n.length <= 80 && normalize(n) !== own && mentioned(n)))].slice(0, 12);
}
export function validFieldHistoryReference(v: unknown): v is FieldHistoryReference {
  if (!record(v) || Object.keys(v).some(k => !["origin", "partial", "sources"].includes(k)) || !["native", "visible"].includes(String(v.origin)) || v.partial !== true || !Array.isArray(v.sources) || v.sources.length > 40) return false;
  const ids = new Set<string>(); let size = 0;
  return v.sources.every(s => {
    if (!record(s) || Object.keys(s).some(k => !["id", "role", "text"].includes(k)) || typeof s.id !== "string" || !/^h\d+$/u.test(s.id) || ids.has(s.id) || typeof s.text !== "string" || !s.text.trim() || s.text.length > 12_000 || !["user", "assistant"].includes(String(s.role))) return false;
    ids.add(s.id); size += JSON.stringify(s).length; return size <= MAX_REFERENCE;
  });
}
const hints: Record<string, string[]> = {
  appearance: ["внешн", "волос", "глаз", "одеж", "пальто", "рост", "лицо", "hair", "eyes", "wear", "coat", "height", "appearance"],
  personality: ["характер", "дружелюб", "терпел", "споко", "personality", "friendly", "patient", "calm"],
  goals: ["цель", "хочет", "мечт", "план", "goal", "want", "dream", "plan"],
  background: ["раньше", "прошл", "родил", "семья", "истори", "past", "born", "family", "history"],
};
/** Ranking is only retrieval, never identity, ancestry or a claim that a passage is canon.
 * Scan the whole received path before bounding: an early appearance need not fit the latest 12k.
 */
export function selectFieldHistory(turns: { role: "user" | "assistant"; text: string }[], query: FieldHistoryQuery, origin: FieldHistoryReference["origin"]): FieldHistoryReference {
  const names = [query.name, ...query.aliases].map(normalize), related = (query.relatedNames ?? []).map(normalize), terms = query.field === "character-profile" ? Object.values(hints).flat() : hints[query.field] ?? [];
  const candidates = turns.flatMap((turn, index) => {
    const full = storyText(turn.text); if (!full || /^\[DeepRole Service\]/u.test(full) || full.includes("[DeepRole Character Text]")) return [];
    const lower = normalize(full), at = names.map(n => lower.indexOf(n)).filter(n => n >= 0).sort((a, b) => a - b)[0];
    const relatedAt = related.map(n => lower.indexOf(n)).filter(n => n >= 0).sort((a, b) => a - b)[0], matchAt = at ?? relatedAt;
    // Include a little recent context, but prioritize matching named characters anywhere in history.
    if (matchAt === undefined && index < turns.length - 3) return [];
    const start = full.length > 10_000 && matchAt !== undefined ? Math.max(0, matchAt - 1500) : 0;
    const text = full.slice(start, start + 10_000), sample = normalize(text);
    return [{ id: `h${index}`, role: turn.role, text, index, score: (at !== undefined ? 20 : relatedAt !== undefined ? 8 : 0) + terms.filter(t => sample.includes(t)).length * 3 }];
  }).sort((a, b) => b.score - a.score || b.index - a.index);
  let used = 0; const selected: typeof candidates = [];
  for (const item of candidates) {
    const size = JSON.stringify({ id: item.id, role: item.role, text: item.text }).length;
    if (selected.length === 40 || used + size > MAX_REFERENCE) continue;
    selected.push(item); used += size;
  }
  return { origin, partial: true, sources: selected.sort((a, b) => a.index - b.index).map(({ id, role, text }) => ({ id, role, text })) };
}
function finalText(message: Record<string, unknown>): string {
  if (Array.isArray(message.fragments)) return message.fragments.flatMap(f => {
    // Unknown fragment kinds may contain reasoning. Fail closed, do not expose them.
    if (!record(f) || !["RESPONSE", "TEXT"].includes(String(f.type ?? f.fragment_type).toUpperCase())) return [];
    const value = f.content ?? f.text ?? f.fragment_content; return typeof value === "string" ? [value] : [];
  }).join("\n");
  return typeof message.content === "string" ? message.content : "";
}
/** Explicit reference read only. Does not create story records or infer completion.
 * No fallback to a leaf, numeric order, text similarity or an unrelated branch.
 */
export function readFieldHistory(value: unknown, chatId: string, anchorId: string, query: FieldHistoryQuery): FieldHistoryReference | null {
  if (!validNativeStoryId(anchorId) || !validFieldHistoryQuery(query)) return null;
  const decoded = readNativeStoryHistory(value, chatId); if (!decoded.messages) return null;
  const layers: Record<string, unknown>[] = []; if (record(value)) { layers.push(value); if (record(value.data)) { layers.push(value.data); if (record(value.data.biz_data)) layers.push(value.data.biz_data); } }
  const list = layers.flatMap(layer => ["chat_messages", "messages", "chat_message_list", "history", "message_list"].flatMap(key => Array.isArray(layer[key]) ? [layer[key]] : []))[0];
  if (!Array.isArray(list)) return null;
  const textByKey = new Map<string, string>();
  for (const m of list) if (record(m)) textByKey.set(nativeStoryMessageKey(String(m.message_id ?? m.id)), finalText(m));
  const identities = new Map(decoded.messages.map(m => [m.nativeMessageKey, m]));
  let cursor = identities.get(nativeStoryMessageKey(anchorId)); if (!cursor) return null;
  const path: typeof decoded.messages = [];
  while (cursor) { path.push(cursor); cursor = cursor.nativeParentKey === null ? undefined : identities.get(cursor.nativeParentKey); }
  path.reverse();
  const turns = path.flatMap(m => {
    const text = textByKey.get(m.nativeMessageKey) ?? "";
    // Exclude an old service's assistant by its exact parent, not by similar reply prose.
    const parent = m.nativeParentKey && textByKey.get(m.nativeParentKey);
    if (text.trimStart().startsWith("[DeepRole Service]") || m.role === "assistant" && parent && parent.trimStart().startsWith("[DeepRole Service]")) return [];
    return [{ role: m.role, text }];
  });
  return selectFieldHistory(turns, query, "native");
}
export const visibleFieldHistory = (story: StoryContinuation, query: FieldHistoryQuery) => selectFieldHistory(story.turns, query, "visible");
