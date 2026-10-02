import { normalizeText, uniqueTokens } from "./text";
import type { MemoryEntry, SceneEntity, Locale, LoreMapLayout } from "./types";

export const LORE_CATEGORIES = [
  { id: "rules", parentId: null, ru: "Правила и настройки", en: "Rules & settings", color: "#85bfff" },
  { id: "world-rules", parentId: "rules", ru: "Правила мира", en: "World rules", words: ["правила мира", "законы мира", "world rules", "worldbuilding", "лор", "lore"] },
  { id: "user-settings", parentId: "rules", ru: "Настройки пользователя", en: "User settings", words: ["настройки пользователя", "юзер", "user settings", "user preferences", "persona", "персона пользователя"] },
  { id: "corrections", parentId: "rules", ru: "Правки и ограничения", en: "Corrections & limits", words: ["правки", "исправление", "запрет", "ограничения", "correction", "restriction", "boundaries", "constraints"] },
  { id: "storytelling", parentId: "rules", ru: "Сторителлинг", en: "Storytelling", words: ["сторителлинг", "повествование", "нарратив", "storytelling", "narration", "принцип повествования", "темп", "pacing", "writing style", "narrative rules"] },
  { id: "chat-rules", parentId: "rules", ru: "Ведение чата", en: "Chat rules", words: ["правила чата", "ведение чата", "формат ответа", "chat rules", "response format", "dialogue format", "chat behavior"] },
  { id: "roleplay-rules", parentId: "rules", ru: "Правила отыгрыша", en: "Roleplay rules", words: ["отыгрыш", "правила рп", "roleplay rules", "roleplaying", "rp rules"] },
  { id: "extra-rules", parentId: "rules", ru: "Дополнительные правила", en: "Extra rules", words: ["дополнительные правила", "доп правила", "additional rules", "extra rules", "принцип", "principle", "правило", "rule", "instruction"] },
  { id: "characters", parentId: null, ru: "Персонажи", en: "Characters", color: "#cfb0ff" },
  { id: "character-info", parentId: "characters", ru: "Сведения и характеристики", en: "Identity & traits", words: ["персонаж", "биография", "характеристики", "character", "biography", "profile", "возраст", "age", "character sheet", "character traits"] },
  { id: "body", parentId: "characters", ru: "Тело", en: "Body", words: ["тело", "телосложение", "body", "physique", "telo"] },
  { id: "appearance", parentId: "characters", ru: "Внешность", en: "Appearance", words: ["внешность", "внешние черты", "волосы", "глаза", "appearance", "hair", "eyes", "looks", "portrait", "clothing", "одежда"] },
  { id: "personality", parentId: "characters", ru: "Характер", en: "Personality", words: ["характер", "темперамент", "personality", "temperament", "характеры"] },
  { id: "thoughts", parentId: "characters", ru: "Мысли и чувства", en: "Thoughts & feelings", words: ["мысли", "чувства", "мысль", "thoughts", "feelings", "emotion"] },
  { id: "relationships", parentId: null, ru: "Отношения и связи", en: "Relationships", color: "#f0b5cf", words: ["отношения", "связь", "связи", "дружба", "семья", "родство", "relationship", "relation", "connection", "friendship", "family", "bond", "kinship"] },
  { id: "locations", parentId: null, ru: "Места и обстановка", en: "Places & setting", color: "#7dd9c2", words: ["локация", "местоположение", "обстановка", "комната", "город", "башня", "озеро", "мост", "дверь", "дом", "школа", "лес", "обсерватория", "location", "setting", "room", "city", "tower", "lake", "bridge", "door", "house", "home", "school", "forest", "village", "observatory"] },
  { id: "timeline", parentId: null, ru: "Хронология и сюжет", en: "Timeline & story", color: "#ffd08f" },
  { id: "days", parentId: "timeline", ru: "Дни", en: "Days", words: ["день", "дни", "day", "days", "утро", "вечер", "morning", "evening", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
  { id: "weeks", parentId: "timeline", ru: "Недели", en: "Weeks", words: ["неделя", "недели", "week", "weeks"] },
  { id: "events", parentId: "timeline", ru: "События и сцены", en: "Events & scenes", words: ["событие", "сцена", "момент", "флэшбек", "event", "scene", "flashback", "episode"] },
  { id: "preferences", parentId: null, ru: "Предпочтения и темы", en: "Preferences & themes", color: "#edb983" },
  { id: "fetishes", parentId: "preferences", ru: "Фетиши", en: "Fetishes", words: ["фетиш", "фетиши", "fetish", "fetishes", "kink"] },
  { id: "groups", parentId: null, ru: "Группы", en: "Groups", color: "#a2c5eb", words: ["группа", "фракция", "гильдия", "организация", "group", "faction", "guild", "organization"] },
  { id: "templates", parentId: null, ru: "Заготовки", en: "Story starters", color: "#b9cda0" },
  { id: "unclassified", parentId: null, ru: "Разобрать", en: "To organize", color: "#bac6d5" },
] as const;

/** Naming conventions are normalized only for recognition, never in stored strings. */
export function loreTitleParts(title: string): string[] {
  return title.normalize("NFKC").replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2").replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2").replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, "$1$3 $2$4").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
const singularEnglish = (text: string) => text.replace(/\b([a-z]+)ies\b/gi, "$1y");
export function loreTitleMentions(title: string, name: string): boolean {
  return (" " + normalizeText(loreTitleParts(title).join(" ")) + " ").includes(" " + normalizeText(name) + " ");
}

/** A leading, named age statement is evidence of a profile, not an incidental age in a scene. */
function hasNamedAgeOpening(title: string, content: string): boolean {
  const match = content.trim().match(/^([\p{L}][\p{L}'’-]*(?: [\p{L}][\p{L}'’-]*){0,2})(?:,\s*|\s+)(?:(?:is|aged)\s+)?\d{1,3}\s+(?:лет|года?|years? old)(?=[\s.,;!?]|$)/iu);
  if (!match) return false;
  const subject = normalizeText(match[1]!).replace(/ (is|aged)$/u, "");
  if (loreTitleMentions(title, subject)) return true;
  // Small-name Russian case endings (Мира → Мире, Олег → Олегу) are too short
  // for the general stemmer. Keep this local to display classification.
  const first = normalizeText(loreTitleParts(title)[0] ?? "");
  return /^[а-я]{3,}$/u.test(subject) && /^[а-я]{3,}$/u.test(first)
    && subject.replace(/[аяеуыию]$/u, "") === first.replace(/[аяеуыию]$/u, "");
}

export function classifyLoreEntry(entry: Pick<MemoryEntry, "title" | "content" | "keywords" | "mapCategory">): { categoryId: string; confidence: "manual" | "title" | "text" | "uncertain"; matches: string[] } {
  if (entry.mapCategory) return { categoryId: entry.mapCategory, confidence: "manual", matches: [] };
  const cleanTitle = singularEnglish(loreTitleParts(entry.title).join(" "));
  const title = ` ${normalizeText(cleanTitle)} `;
  const body = ` ${normalizeText(entry.content.slice(0, 20000))} `;
  const titleTokens = uniqueTokens(cleanTitle);
  const bodyTokens = uniqueTokens(entry.content.slice(0, 20000));
  const keywordTokens = uniqueTokens(singularEnglish(entry.keywords.join(" ").replaceAll("_", " ")));
  const namedAge = hasNamedAgeOpening(entry.title, entry.content);
  const scores = LORE_CATEGORIES.flatMap((category) => {
    if (!("words" in category)) return [];
    let titleScore = 0; let keywordScore = 0; let bodyScore = 0; let titleMatch = false; const matches: string[] = [];
    for (const term of category.words) {
      const normalized = normalizeText(term); const tokens = [...uniqueTokens(term)];
      const titleHit = title.includes(` ${normalized} `) || (tokens.length > 0 && tokens.every((token) => titleTokens.has(token)));
      const keywordHit = tokens.length > 0 && tokens.every((token) => keywordTokens.has(token));
      const bodyHit = normalized.includes(" ") ? body.includes(` ${normalized} `) : tokens.some((token) => bodyTokens.has(token));
      if (titleHit) { titleScore = Math.max(titleScore, normalized.includes(" ") ? 16 : 10); titleMatch = true; matches.push(term); }
      else if (keywordHit) { keywordScore = Math.max(keywordScore, 7); matches.push(term); }
      else if (bodyHit) { bodyScore += normalized.includes(" ") ? 4 : 1; matches.push(term); }
    }
    // Repeated synonyms in prose cannot overpower an explicit subject in a title.
    let score = titleScore + Math.min(2, keywordScore) + Math.min(2, bodyScore);
    if (!titleMatch) score = keywordScore || Math.min(4, bodyScore);
    if (category.id === "character-info" && namedAge) { score = Math.max(score, 8); matches.push("named age statement"); }
    // Rule prefixes outrank a body/character topic occurring in the same title.
    if (category.parentId === "rules" && titleMatch && /^ (принцип|правил[аоы]?|principle|rules?) /u.test(title)) score += 18;
    const prefix = normalizeText(loreTitleParts(entry.title)[0] ?? "");
    const topic = /^(сцена|событие|момент|флэшбек|scene|event|flashback|episode)$/u.test(prefix) ? "events" :
      /^(связь|связи|отношения|семья|relationship|relationships|relation|relations|connection|connections|friendship|family|bond)$/u.test(prefix) ? "relationships" :
      /^(день|дни|day|days)$/u.test(prefix) ? "days" : /^(неделя|недели|week|weeks)$/u.test(prefix) ? "weeks" : null;
    if (category.id === topic && titleMatch) score += 24;
    if (category.id === "extra-rules" && matches.every((term) => ["принцип", "principle", "правило", "rule"].includes(term))) score -= 1;
    return [{ categoryId: category.id, score, titleMatch, matches }];
  }).sort((a, b) => b.score - a.score || a.categoryId.localeCompare(b.categoryId));
  const best = scores[0];
  if (!best || best.score < 4 || (best.score === scores[1]?.score && !best.titleMatch)) return { categoryId: "unclassified", confidence: "uncertain", matches: [] };
  return { categoryId: best.categoryId, confidence: best.titleMatch ? "title" : "text", matches: best.matches };
}

/** Display-only name clusters; never create canonical characters automatically. */
export function inferTitlePeople(entries: MemoryEntry[], entities: SceneEntity[], minimumRecords = 2): { token: string; name: string; aliases?: string[]; entryIds: string[] }[] {
  const generic = new Set(["связь", "сцена", "момент", "флэшбек", "принцип", "правило", "правила", "тело", "внешность", "проект", "описание", "настройки", "память", "событие", "день", "неделя", "тайна", "секрет", "характер", "мысли", "чувства", "отношения", "character", "body", "scene", "rule", "rules", "story", "memory", "event", "link", "relation", "personality", "thoughts", "appearance", "telo", "profile", "age", "hair", "eyes", "looks", "portrait", "clothing", "одежда"]);
  const known = new Set(entities.flatMap((entity) => [entity.name, ...entity.aliases]).map(normalizeText));
  const groups = new Map<string, { name: string; aliases: string[]; entryIds: string[] }>();
  // A recognizable character record anchors the name; arbitrary scene words cannot seed profiles.
  for (const entry of entries) {
    // Folders are decorative: organizing the map must not change name matching.
    const classification = classifyLoreEntry({ ...entry, mapCategory: undefined });
    if (!LORE_CATEGORIES.some((category) => category.id === classification.categoryId && category.parentId === "characters")) continue;
    const parts = loreTitleParts(entry.title);
    const descriptor = (part: string) => generic.has(normalizeText(singularEnglish(part))) || ["биография", "возраст", "biography", "traits", "identity"].includes(normalizeText(part));
    if (parts[0] && descriptor(parts[0])) parts.shift();
    if (normalizeText(parts[0] ?? "") === "of") parts.shift();
    const first = parts[0] ?? ""; const second = parts[1] ?? "";
    let name = first;
    // Preserve two-part proper names, but do not swallow lowercase description words.
    if (/^\p{Lu}/u.test(first) && /^\p{Lu}/u.test(second) && !descriptor(second) && ((/^[a-z]+$/iu.test(first) && /^[a-z]+$/iu.test(second)) || (/^[а-я]+$/iu.test(first) && /^[а-я]+$/iu.test(second)))) name += " " + second;
    const token = normalizeText(name);
    if (!/^[\p{L}\p{N}]{2,24}( [\p{L}]{2,24})?$/u.test(token) || !/\p{L}/u.test(token) || generic.has(token) || known.has(token)) continue;
    const value = groups.get(token) ?? { name: name.charAt(0).toLocaleUpperCase() + name.slice(1), aliases: [], entryIds: [] };
    const alias = normalizeText(second);
    if (/^[a-z]{3,24}$/u.test(alias) && /^[а-я]+$/u.test(token) && !generic.has(alias)) value.aliases.push(alias);
    value.entryIds.push(entry.id); groups.set(token, value);
  }
  const tokenGroups = new Map<string, string[]>();
  for (const [token, group] of groups) for (const alias of [token, ...group.aliases]) tokenGroups.set(alias, [...new Set([...(tokenGroups.get(alias) ?? []), token])]);
  for (const entry of entries) {
    const category = classifyLoreEntry({ ...entry, mapCategory: undefined }).categoryId;
    if (LORE_CATEGORIES.some((c) => c.id === category && c.parentId === "rules")) continue;
    const matches = [...tokenGroups].filter(([alias, owners]) => owners.length === 1 && loreTitleMentions(entry.title, alias));
    for (const [alias, owners] of matches) {
      if (matches.some(([other]) => other !== alias && other.includes(alias) && other.length > alias.length)) continue;
      const group = groups.get(owners[0]!)!;
      group.entryIds.push(entry.id);
    }
  }
  return [...groups].map(([token, group]) => ({ token, name: group.name, ...(group.aliases.length ? { aliases: [...new Set(group.aliases)] } : {}), entryIds: [...new Set(group.entryIds)] })).filter((group) => group.entryIds.length >= minimumRecords);
}

export function readableLoreTitle(title: string): string { return title.replaceAll("_", " ").replace(/\s+/g, " ").trim(); }

export function loreCategoryLabel(locale: Locale, id: string): string { const category = LORE_CATEGORIES.find((c) => c.id === id); return category ? locale === "ru" ? category.ru : category.en : id; }

export function validateLoreMapLayout(value: unknown): asserts value is LoreMapLayout {
  const map = value as LoreMapLayout;
  if (!map || typeof map !== "object" || !map.positions || typeof map.positions !== "object" || Array.isArray(map.positions) || Object.keys(map.positions).length > 25000 || !Array.isArray(map.expandedIds) || map.expandedIds.length > 25000 || map.expandedIds.some((id) => typeof id !== "string" || id.length > 240) || !Array.isArray(map.customCategories) || map.customCategories.length > 100) throw new Error("invalidMap");
  for (const [id, point] of Object.entries(map.positions)) if (id.length > 240 || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 12000 || point.y > 12000) throw new Error("invalidMap");
  const builtins = new Set<string>([...LORE_CATEGORIES.map((c) => c.id), "library"]); const ids = new Set<string>();
  for (const category of map.customCategories) {
    if (!category || typeof category.id !== "string" || !category.id.startsWith("custom-") || category.id.length > 80 || ids.has(category.id) || typeof category.title !== "string" || !category.title.trim() || category.title.length > 80 || (category.parentId !== null && typeof category.parentId !== "string")) throw new Error("invalidMap");
    ids.add(category.id);
  }
  for (const category of map.customCategories) {
    const seen = new Set([category.id]); let parent = category.parentId;
    while (parent !== null && !builtins.has(parent)) { if (!ids.has(parent) || seen.has(parent)) throw new Error("invalidMap"); seen.add(parent); parent = map.customCategories.find((c) => c.id === parent)!.parentId; }
  }
  if (map.categoryNames !== undefined && (!map.categoryNames || typeof map.categoryNames !== "object" || Array.isArray(map.categoryNames) || Object.keys(map.categoryNames).length > 200 || Object.entries(map.categoryNames).some(([id, name]) => (!builtins.has(id) && !ids.has(id) && !/^(person:|detail:|page:).{1,200}$/u.test(id)) || typeof name !== "string" || !name.trim() || name.length > 80))) throw new Error("invalidMap");
}
