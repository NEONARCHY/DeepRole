import type { StoryFact } from "./story-update";
import type { StoryRetrievalScope } from "./story-retrieval-query";
import { retrievalNames, isPersonalStoryReference } from "./story-retrieval-query";
import { normalizeText } from "./text";
import { storyOwnerQuestion } from "./story-owner-query";

export interface SourcePerson { id: string; name: string; sourceName?: string; sourceId?: string; unavailable?: true }
export type OwnerRole = "promisor" | "planner" | "believer";
export interface StorySourceRoles {
  speaker?: SourcePerson;
  recipient?: SourcePerson;
  promisor?: SourcePerson;
  planner?: SourcePerson;
  believer?: SourcePerson;
}
export interface StoryRoleReader {
  status?(fact: StoryFact): "bound" | "unknown" | undefined;
  read(fact: StoryFact): StorySourceRoles | undefined;
  question: { role: OwnerRole; personId: string } | undefined;
  score(fact: StoryFact): number;
}
const speech = /^(?:said|says|told|tells|сказал|сказала|сказали|говорит|сообщил|сообщила)(?= |$)/u;
const ownerVerbs: Record<OwnerRole, RegExp> = {
  promisor: /^(?:promised|promises|promise|pledged|обещал|обещала|обещали|обещает|обещаю)(?= |$)/u,
  planner: /^(?:plans|planned|plan|планирует|планировал|планировала)(?= |$)/u,
  believer: /^(?:believes|believed|believe|thinks|thought|think|считает|считала|считал|думает|думала|думал)(?= |$)/u,
};
const firstPerson: Record<OwnerRole, RegExp> = {
  promisor: /^(?:i promise|i promised|я обещаю|я обещал|я обещала)(?= |$)/u,
  planner: /^(?:i plan|i planned|я планирую|я планировал|я планировала)(?= |$)/u,
  believer: /^(?:i believe|i think|я считаю|я думаю)(?= |$)/u,
};
type Names = Map<string, Set<string>>;
const add = (names: Names, phrase: string, id: string) => {
  if (!phrase || isPersonalStoryReference(phrase)) return;
  const ids = names.get(phrase) ?? new Set<string>(); ids.add(id); names.set(phrase, ids);
};

/** Current-query ranking over the frozen source reader and stored proofs.
 * Facts, task keys, draft text and author names are never rewritten. */
export function createStoryRoleReader(scope: StoryRetrievalScope, draft = "", stored?: (fact: StoryFact) => StorySourceRoles | null | undefined): StoryRoleReader {
  const reader = createStoryRoleReaderV1(scope, "", stored), question = storyOwnerQuestion(draft, scope);
  return { ...reader, question, score: fact => {
    if (!question) return 0;
    const person = reader.read(fact)?.[question.role];
    return person ? person.id === question.personId ? 40 : -12 : 0;
  } };
}
/** Stored binding version 1 pins this grammar and its name normalization rules.
 * Future grammar changes require a new version, not reinterpretation of old IDs. */
export function createStoryRoleReaderV1(scope: StoryRetrievalScope, draft = "", stored?: (fact: StoryFact) => StorySourceRoles | null | undefined): StoryRoleReader {
  const people = new Map(scope.entities.filter(e => e.kind === "character" && e.worldId === scope.worldId).map(e => [e.id, { id: e.id, name: e.name }]));
  const subjects: Names = new Map(), all: Names = new Map();
  for (const person of scope.entities) if (person.kind === "character" && people.has(person.id) && person.worldId === scope.worldId) {
    for (const name of retrievalNames(person, false)) add(subjects, name, person.id);
    for (const name of retrievalNames(person)) add(all, name, person.id);
  }
  const ordered = (names: Names) => [...names.keys()].sort((a,b) => b.length - a.length);
  const subjectKeys = ordered(subjects), allKeys = ordered(all);
  const actorPattern = subjectKeys.length ? new RegExp("(?:^| )(" + subjectKeys.map(name=>name.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")).join("|") + ")(?= |$)","gu") : undefined;
  const nameAtStart = (text: string, keys: string[]) => {
    // The longest phrase wins even if ambiguous; never fall back to a shorter
    // unrelated character. All inferred forms participate in collision checks.
    const phrase = keys.find(name => text === name || text.startsWith(name + " "));
    if (!phrase) return;
    const ids = all.get(phrase);
    const person = ids?.size === 1 ? people.get([...ids][0]!) : undefined;
    return { person, rest: text.slice(phrase.length).trim() };
  };
  const recipient = (text: string, english: boolean) => {
    const value = english ? text.replace(/^to /u, "") : text;
    const found = nameAtStart(value, allKeys);
    // Exact header only: "Bob's sister" / "мать Миры" is not Bob/Mira.
    return found?.person && !found.rest ? found.person : undefined;
  };
  const resolve = (fact: StoryFact): StorySourceRoles | undefined => {
    const source = fact.quote.trim();
    if (!source || /^[«“"']/u.test(source)) return;
    const boundary = source.search(/[.,!?;\r\n()[\]]/u), delimiter = source.indexOf(":");
    const colon = delimiter >= 0 && (boundary < 0 || delimiter < boundary) ? delimiter : -1;
    if (colon < 0 && boundary >= 0 && source[boundary] === "?") return;
    const header = source.slice(0,colon >= 0 ? colon : boundary >= 0 ? boundary : source.length);
    const lead = normalizeText(header), named = nameAtStart(lead, subjectKeys);
    if (!named?.person) return;
    const roles: StorySourceRoles = {};
    const spoken = named.rest.match(speech);
    if (spoken) {
      // Without a delimiter, a following clause can be reported speech. Keep
      // only the explicitly named speaker; never promote an inner promise.
      roles.speaker = named.person;
      if (colon >= 0) {
        const tail = named.rest.slice(spoken[0].length).trim();
        const to = /^(?:said|says)$/u.test(spoken[0]);
        if (!to || tail.startsWith("to ")) roles.recipient = recipient(tail, /^(?:said|says|told|tells)$/u.test(spoken[0]));
      }
    } else if (colon >= 0 && !named.rest && /^(?:[«“"']|я (?:обещаю|планирую|считаю|думаю)|i (?:promise|plan|think|believe))/iu.test(source.slice(colon+1).trim())) {
      roles.speaker = named.person;
    }
    for (const role of Object.keys(ownerVerbs) as OwnerRole[]) {
      const verb = named.rest.match(ownerVerbs[role]);
      if (verb) {
        roles[role] = named.person;
        if (colon >= 0 && role === "promisor") {
          const tail = named.rest.slice(verb[0].length).trim();
          if (!/^(?:promised|promises|promise|pledged)$/u.test(verb[0]) || tail.startsWith("to ")) roles.recipient = recipient(tail, /^(?:promised|promises|promise|pledged)$/u.test(verb[0]));
        }
      } else if (colon >= 0 && roles.speaker) {
        const rawBody = source.slice(colon+1).trim();
        const body = normalizeText(rawBody);
        const nested = /^[«“"']\s*[«“"']/u.test(rawBody);
        const reported = /(?:\b(?:wrote|written|letter|quoted|read|said|says|told|reported)\b|написал|письм|цитат|читал|сказал|говорил)/iu.test(body);
        if (!nested && !reported && firstPerson[role].test(body)) roles[role] = roles.speaker;
      }
    }
    // A shared long quote can contain several people's statements. A summary
    // of its later clause must not inherit the first person's ownership.
    if (actorPattern && (colon >= 0 && roles.speaker || Object.keys(ownerVerbs).some(role=>roles[role as OwnerRole]))) {
      const evidence = normalizeText(source);
      const headerEnd = colon >= 0 ? normalizeText(source.slice(0,colon)).length : 0;
      for (const match of evidence.matchAll(actorPattern)) {
        if (match.index === 0 || match.index! < headerEnd) continue;
        const rest = evidence.slice(match.index!+match[0].length).trim();
        if (!speech.test(rest) && !Object.values(ownerVerbs).some(v=>v.test(rest)) && !Object.values(firstPerson).some(v=>v.test(rest))) continue;
        const ids = all.get(match[1]!);
        if (ids?.size !== 1 || !ids.has(named.person.id)) {
          return undefined;
        }
      }
    }
    for (const role of Object.keys(roles) as (keyof StorySourceRoles)[]) if (!roles[role]) delete roles[role];
    return Object.keys(roles).length ? roles : undefined;
  };
  const cache = new WeakMap<StoryFact, { quote: string; value: StorySourceRoles | undefined }>();
  const read = (fact: StoryFact) => {
    const previous = cache.get(fact);
    if (previous?.quote === fact.quote) return previous.value ? structuredClone(previous.value) : undefined;
    const bound = stored?.(fact);
    const value = bound === undefined ? resolve(fact) : bound ?? undefined; cache.set(fact, { quote: fact.quote, value });
    return value ? structuredClone(value) : undefined;
  };
  // Deliberately narrow explicit ownership questions, not pronoun resolution.
  const query = normalizeText(draft);
  let question: StoryRoleReader["question"];
  for (const role of Object.keys(ownerVerbs) as OwnerRole[]) {
    const ru = query.replace(/^что /u, "").match(ownerVerbs[role]);
    if (query.startsWith("что ") && ru) {
      const name = nameAtStart(query.slice(4 + ru[0].length).trim(), subjectKeys);
      if (name?.person && !name.rest) question = { role, personId: name.person.id };
    }
    if (query.startsWith("что ")) {
      const name = nameAtStart(query.slice(4),subjectKeys);
      if (name?.person && name.rest.match(ownerVerbs[role])?.[0] === name.rest) question = { role, personId:name.person.id };
    }
    if (query.startsWith("what did ")) {
      const name = nameAtStart(query.slice(9), subjectKeys);
      if (name?.person && ownerVerbs[role].test(name.rest) && name.rest.match(ownerVerbs[role])?.[0] === name.rest) question = { role, personId: name.person.id };
    }
  }
  return { read, question, status:fact=>{const value=stored?.(fact);return value===null?"unknown":value===undefined?undefined:"bound";}, score: fact => {
    if (!question) return 0;
    const person = read(fact)?.[question.role];
    return person ? person.id === question.personId ? 40 : -12 : 0;
  } };
}

export const STORY_SOURCE_ROLES = "sourceRoles link explicit source syntax to character IDs: speaker said it; recipient was addressed, not proof of hearing; promisor/planner/believer owns the STATED commitment/intention/belief, NOT fulfillment or objective truth. Stored source bindings keep historical IDs; sourceName is the historical label, sourceId precedes an approved selected merge, unavailable means the original person is absent from the current roster. Never give their statements to a new person with the same name. Legacy links without a stored binding are request-local only. Other mentions and pronouns stay unknown. Keep conditions, negation and reported speech. Use full exact evidence (text, sourceQuote or this array's sourceQuoteRef). Do not echo sourceRoles in fact proposals or treat them as write instructions.";
