const RU_SUFFIXES = [
  "иями", "ями", "ами", "его", "ого", "ему", "ому", "ее", "ие", "ые", "ое",
  "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом", "их", "ых", "ую", "юю",
  "ая", "яя", "ою", "ею", "ам", "ям", "ах", "ях", "ов", "ев", "ом", "ем",
  "а", "я", "ы", "и", "ь", "й", "у", "ю", "е", "о",
];

const EN_SUFFIXES = [
  "ational", "fulness", "ousness", "iveness", "tional", "biliti", "lessly",
  "ments", "ingly", "edly", "ation", "izer", "ment", "ness", "able", "ible",
  "ing", "ies", "ied", "ed", "es", "s",
];

const STOP_WORDS = new Set([
  "и", "в", "во", "на", "с", "со", "к", "по", "из", "у", "о", "об", "от", "до",
  "за", "для", "не", "но", "а", "что", "это", "как", "его", "ее", "их", "он", "она",
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with",
  "is", "are", "was", "were", "it", "this", "that", "he", "she", "they", "not",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map(stemToken);
}

export function stemToken(token: string): string {
  if (/^[а-я]+$/u.test(token)) {
    if (token.length < 5) return token;
    const suffix = RU_SUFFIXES.find((candidate) => token.endsWith(candidate) && token.length - candidate.length >= 3);
    return suffix ? token.slice(0, -suffix.length) : token;
  }
  if (/^[a-z]+$/u.test(token)) {
    if (token.length < 4) return token;
    const suffix = EN_SUFFIXES.find((candidate) => token.endsWith(candidate) && token.length - candidate.length >= 3);
    if (!suffix) return token;
    let stem = token.slice(0, -suffix.length);
    if ((suffix === "ing" || suffix === "ed") && /(bb|dd|ff|gg|mm|nn|pp|rr|tt)$/u.test(stem)) {
      stem = stem.slice(0, -1);
    }
    return stem;
  }
  return token;
}

export function uniqueTokens(value: string): Set<string> {
  return new Set(tokenize(value));
}

/** Local object wording for evidence lookups. The general index keeps its original stems. */
export function storyObjectTokens(masked:string) {
  const folded=masked.replace(/([а-я]{3,}?)(?:ую|юю|ая|яя|ое|ее|ый|ий|ой|ого|его|ому|ему|ым|им|ою)(?= |$)/gu,'$1')
    .replace(/([а-я]{3,})тью(?= |$)/gu,'$1ть');
  return tokenize(folded).filter(t=>/^\p{L}{3,}$/u.test(t));
}

export function estimateTokens(value: string): number {
  const compact = value.trim();
  if (!compact) return 0;
  const cyrillic = (compact.match(/[а-яё]/gi) ?? []).length;
  const ratio = cyrillic / compact.length;
  return Math.max(1, Math.ceil(compact.length / (ratio > 0.35 ? 2.7 : 4)));
}

export function deriveKeywords(title: string, content: string, limit = 8): string[] {
  const titleTokens = tokenize(title);
  const frequency = new Map<string, number>();
  for (const token of tokenize(content)) {
    if (token.length < 3) continue;
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  const body = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([token]) => token);
  return [...new Set([...titleTokens, ...body])].slice(0, limit);
}

// One-letter titles/codes vanish in the general tokenizer. Keep their
// adjacent qualifier so a band N and a gate N are independent signals.
export function qualifiedLabels(text:string) {
  const labels:string[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_])(\p{L}{3,})[ \t]+(?:[«“"]([\p{Lu}\d])[»”"]|([\p{Lu}\d]))(?![\p{L}\p{N}_])/gu)) {
    const [word] = uniqueTokens(m[1]!);
    if (!word || !m[2] && !/^(?:band|group|gate|room|box|sector|unit|групп|сектор|ячейк|корпус|блок)$/u.test(word)) continue;
    labels.push("label/" + word + "/" + (m[2] ?? m[3]!).toLowerCase());
  }
  return labels;
}
