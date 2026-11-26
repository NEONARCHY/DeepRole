import { isPersonalStoryReference, retrievalNames } from "./story-retrieval-query";
import { normalizeText } from "./text";
import type { SceneEntity } from "./types";

export interface StoryEventSourceLinks {
  subjects: { id: string; name: string }[];
  object?: string;
}

const action = /^(.+?)\s+(?:agreed to (?:inspect|check|photograph|open|retrieve)|inspected|checked|photographed|opened|retrieved|found|договорились (?:проверить|осмотреть|сфотографировать|открыть|забрать)|проверил[аи]?|осмотрел[аи]?|сфотографировал[аи]?|открыл[аи]?|забрал[аи]?|наш[её]л|нашл[аи])\s+(.+)\.$/iu;
const location = /^(.+?)\s+(?:(?:is|was|are|were) (?:in|at|on)|(?:(?:был[аи]?|находится|находил(?:ся|ась|ись)) )?(?:в|во|на|у))\s+(.+)\.$/iu;
const phrase = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+){0,5}$/u;
const clauseWords = /(?:^| )(?:and|or|if|unless|in|at|on|by|with|because|before|after|today|yesterday|tomorrow|later|it|this|that|these|those|him|her|them|и|или|если|в|во|на|у|с|со|вместе|потом|вчера|сегодня|завтра|позже|это|этот|эту|эти|его|ее|их)(?: |$)/u;

export const validStoryEventObject = (object: string) => object.length <= 100 && phrase.test(object) && !clauseWords.test(normalizeText(object));

/** Frozen version 3 syntax. Subject IDs come from the roster captured with the
 * source. Names in reported speech, conditions or role-less prose win no link. */
export function storyEventSourceV3(quote: string, roster: readonly SceneEntity[]): StoryEventSourceLinks | undefined {
  const direct = action.exec(quote);
  const match = direct ?? location.exec(quote);
  if (!match || !roster.length) return;
  const [header, argument] = [match[1]!, match[2]!];
  const object = argument.replace(/^(?:the|a|an)\s+/iu, "");
  if (!validStoryEventObject(object)) return;

  const names = new Map<string, Map<string, { id: string; name: string }>>();
  for (const person of roster) for (const alias of retrievalNames(person, false)) {
    if (!alias || isPersonalStoryReference(alias)) continue;
    const owners = names.get(alias) ?? new Map();
    owners.set(person.id, { id: person.id, name: person.name });
    names.set(alias, owners);
  }
  const people = names.has(normalizeText(header))
    ? [header]
    : header.split(/\s*,\s*(?:(?:and|и)\s+)?|\s+(?:and|и)\s+/iu);
  if (people.length > 8 || people.length > 1 && !/\s(?:and|и)\s/iu.test(header)) return;

  const subjects: StoryEventSourceLinks["subjects"] = [];
  for (const person of people) {
    if (!/^\p{Lu}[\p{L}\p{N}’' -]*$/u.test(person)) return;
    const owners = names.get(normalizeText(person));
    if (owners?.size !== 1) return;
    const subject = owners.values().next().value!;
    if (subjects.some(existing => existing.id === subject.id)) return;
    subjects.push(subject);
  }
  // An exact roster name in the object slot is a person, including an ID that
  // may later be renamed. It is excluded from the lexical object index.
  const namedObject = direct && roster.some(person => retrievalNames(person).includes(normalizeText(object)));
  return { subjects, ...(direct && !namedObject ? { object } : {}) };
}
