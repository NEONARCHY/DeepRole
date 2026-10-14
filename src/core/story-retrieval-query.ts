import type { SceneEntity } from "./types";
import type { StoryFact } from "./story-update";
import { normalizeText } from "./text";
import { storyConceptSearch } from "./story-retrieval-concepts";

export interface StoryRetrievalScope { worldId: string; entities: SceneEntity[] }
type Topic = "obligation" | "plan" | "belief" | "secret";
const topicWords: Record<Topic, RegExp> = {
  obligation: /^(?:обещани[еяюй]|обещанием|обещаниям[и]?|обещаниях|обязательств[оауы]|promise[s]?|commitment[s]?|obligation[s]?|task[s]?|задач[аиуе]|задачей)$/u,
  plan: /^(?:план[аыуе]?|планом|планах|намерени[еяюй]|намерением|plan[s]?|intention[s]?)$/u,
  belief: /^(?:мнени[еяюй]|мнением|убеждени[еяюй]|убеждением|belief[s]?|opinion[s]?)$/u,
  secret: /^(?:секрет[аыуе]?|секретом|тайн[аыуе]|тайной|secret[s]?)$/u,
};
const personalReference = /^(?:она|он|они|ее|его|их|ей|ему|ней|нем|ним|им|she|he|her|hers|his|him|they|their|theirs|them)$/u;
const namePrefixes = new Set(["the", "a", "an", "mr", "mrs", "ms", "miss", "dr", "sir", "lady", "lord", "captain", "king", "queen", "господин", "госпожа", "доктор", "капитан", "король", "королева", "сэр", "леди", "лорд"]);
export function retrievalNames(e: SceneEntity, inflect = true) {
  const names = [e.name, ...e.aliases];
  // Conservative short form for conventional multi-part proper names. It is
  // runtime-only, checked against ALL explicit and inferred names for collision.
  if (/^\p{Lu}[\p{L}'’\-]+(?:\s+\p{Lu}[\p{L}'’\-]+)+$/u.test(e.name.trim())) {
    const first = e.name.trim().split(/\s+/u)[0]!;
    if (!namePrefixes.has(normalizeText(first))) names.push(first);
  }
  return [...new Set(names.flatMap(name => {
    const phrase = normalizeText(name);
    if (!inflect || !/^[а-я]{3,}[ая]$/u.test(phrase)) return [phrase];
    const endings = phrase.endsWith("а") ? ["а", "ы", "и", "е", "у", "ой", "ою"] : ["я", "и", "е", "ю", "ей", "ею"];
    return [phrase, ...endings.map(ending => phrase.slice(0, -1) + ending)];
  }))];
}
/** Current-query forms only. V1 source bindings intentionally keep using
 * retrievalNames: adding a query form must not reinterpret historical actors. */
export function retrievalQueryNames(e: SceneEntity) {
  const shortForms = retrievalNames(e, false).flatMap(phrase => {
    if (!/^[а-я]{2}[ая]$/u.test(phrase) || personalReference.test(phrase)) return [];
    const endings = phrase.endsWith("а") ? ["а", "ы", "и", "е", "у", "ой", "ою"] : ["я", "и", "е", "ю", "ей", "ею"];
    return endings.map(ending => phrase.slice(0, -1) + ending);
  });
  return [...new Set([...retrievalNames(e), ...shortForms])];
}
export const isPersonalStoryReference = (name: string) => personalReference.test(normalizeText(name));
const phraseIn = (text: string, phrase: string) => phrase && (` ${normalizeText(text)} `).includes(` ${phrase} `);
function longestNames(text: string, phrases: Iterable<string>) {
  const haystack = ` ${normalizeText(text)} `;
  const occurrences = [...phrases].flatMap(phrase => {
    const matches: { phrase: string; start: number; end: number }[] = [];
    let start = haystack.indexOf(` ${phrase} `);
    while (start >= 0) { matches.push({ phrase, start, end: start + phrase.length + 2 }); start = haystack.indexOf(` ${phrase} `, start + 1); }
    return matches;
  });
  return new Set(occurrences.filter(hit => !occurrences.some(other => other.phrase !== hit.phrase && other.start <= hit.start && other.end >= hit.end)).map(hit => hit.phrase));
}

/** Query-only assistance. Never replaces draft text or asserts pronoun identity.
 * Only exact whole names/aliases with one owner in this world may expand. */
export function storyRetrievalQuery(draft: string, scope: StoryRetrievalScope) {
  const people = scope.entities.filter(e => e.worldId === scope.worldId && e.kind === "character");
  const namesById = new Map(people.map(e => [e.id, retrievalQueryNames(e)]));
  const owners = new Map<string, Set<string>>();
  const explicitOwners = new Map<string, Set<string>>();
  for (const e of people) for (const name of [e.name, ...e.aliases]) {
    const phrase = normalizeText(name); if (!phrase) continue;
    const ids = explicitOwners.get(phrase) ?? new Set<string>(); ids.add(e.id); explicitOwners.set(phrase, ids);
  }
  for (const e of people) for (const name of namesById.get(e.id)!) {
    const phrase = normalizeText(name); if (!phrase) continue;
    const ids = owners.get(phrase) ?? new Set<string>(); ids.add(e.id); owners.set(phrase, ids);
  }
  // Longest whole name at each occurrence wins, including an ambiguous longer
  // name: Ann Lee must not silently fall back to the unrelated person Ann.
  const exactNames = longestNames(draft, owners.keys());
  const named = people.filter(e => namesById.get(e.id)!.some(name => {
    const phrase = normalizeText(name); return !personalReference.test(phrase) && owners.get(phrase)?.size === 1 && exactNames.has(phrase);
  }));
  // A unique alias for two people called Alex still cannot identify an Alex-only
  // fact. Expand canonical names only when THEY are unique as well.
  const subjects = named.filter(e => !personalReference.test(normalizeText(e.name)) && explicitOwners.get(normalizeText(e.name))?.size === 1);
  const canonicalNames = new Set(subjects.map(e => normalizeText(e.name)));
  const subjectNames = [...new Set(subjects.flatMap(e => namesById.get(e.id)!).filter(phrase => !personalReference.test(phrase) && (owners.get(phrase)?.size === 1 || canonicalNames.has(phrase))))];
  const factNames = [...new Set([...subjectNames, ...[...owners.keys()].filter(name => subjectNames.some(short => name.length > short.length && phraseIn(name, short)))])];
  const words = normalizeText(draft).split(" ");
  const topics = new Set<Topic>(Object.entries(topicWords).filter(([, pattern]) => words.some(word => pattern.test(word))).map(([topic]) => topic as Topic));
  const unresolvedReference = topics.size > 0 && words.some(word => personalReference.test(word));
  const matchesTopic = (f: StoryFact) => topics.has("obligation") && (!!f.task || f.kind === "promise")
    || topics.has("plan") && (f.kind === "plan" || !!f.task)
    || topics.has("belief") && f.kind === "belief" || topics.has("secret") && f.kind === "secret";
  const matchesSubject = (f: StoryFact) => {
    if (!subjectNames.length) return false;
    // An accepted task can keep its named title after completion/cancellation
    // while the event text becomes impersonal. Match each field independently:
    // never synthesize a multi-word name across a text/title boundary, and never
    // use opaque task keys or source quotes as character identity evidence.
    return [f.text, f.task?.title ?? ""].some(text => {
      const mentioned = longestNames(text, factNames);
      return subjectNames.some(name => mentioned.has(name));
    });
  };
  const ambiguousName = [...exactNames].some(name => !personalReference.test(name) && (owners.get(name)?.size ?? 0) > 1);
  const concepts = storyConceptSearch(draft, owners.keys());
  return { query: [draft, ...subjects.map(e => e.name)].join("\n"), unresolvedReference, ambiguousName, mentionedIds: named.map(e => e.id), relevanceNames:[...owners.keys()],
    score: (f: StoryFact) => (matchesTopic(f) ? 4 : 0) + (matchesSubject(f) ? 16 : 0) + concepts.score(f) };
}

export const UNRESOLVED_STORY_REFERENCE = '<deeprole_reference_guard>Personal reference in the current request is NOT resolved by DeepRole. Establish speaker/owner only from explicit played evidence. Selected facts are candidates, not proof of who a pronoun names. Do not invent ownership or merge different people\'s obligations.</deeprole_reference_guard>';
export const AMBIGUOUS_STORY_NAME = '<deeprole_reference_guard>A name or alias in the current request has multiple possible owners in this world. Do not choose one from roster order or guessed gender. Use full identities, IDs or explicit played evidence. Do not merge their profiles, facts or obligations.</deeprole_reference_guard>';
