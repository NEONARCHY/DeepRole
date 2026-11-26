import type { EpisodeReader } from "./story-episodes";
import type { createStoryEventLinkReader } from "./story-event-links";
import { closedPromiseEvidence, promiseParticipants } from "./story-promise-pair";
import { validStoryEventObject } from "./story-event-source";
import type { StoryRetrievalScope } from "./story-retrieval-query";
import type { StoryRoleReader } from "./story-source-roles";
import type { StoryTimeReader } from "./story-time";
import type { StoryFact } from "./story-update";
import { normalizeText } from "./text";

type LinkReader = ReturnType<typeof createStoryEventLinkReader>;

export const LINKED_LOCATION_GUIDE = "For the location question, use the last position matched to the named person in the original roster. Speech roles may be unknown. A later move is unproved.";
export const UNKNOWN_LINKED_LOCATION = "The explicit location question has no proved last position for that identity. Leave location unknown.";
export const LINKED_OBJECT_GUIDE = "Use the linked object's exact historical events and task status. Shared participation does not establish ownership or current presence.";
export const DIRECT_LINKED_RECALL_GUIDE = "Use the selected source for this exact question. Preserve the people, prerequisite and task status as recorded. A stored location is the last proved position; do not infer a later move.";
export const DIRECT_LINKED_RECALL_UNKNOWN = "The exact source does not fit. Do not substitute another object, person, or commitment.";

/** Keep each explicit question intact. A narrow promise question by itself does
 * not request a location, even when the same person is in both memories. */
export function splitStoryLocationQuestion(draft: string) {
  if (draft.length > 800 || /[«»“”"<>]/u.test(draft)) return;
  const match = /^(?<primary>.+?)(?:[,，]?\s+(?:и|and)\s+|[?？]\s*(?:(?:а|и|and)\s+)?)(?<location>где\s+.+|where\s+is\s+.+)[?？]$/iu.exec(draft.trim());
  if (!match?.groups) return;
  const location = normalizeText(match.groups.location!);
  const target = /^(?:где сейчас (.+)|где (.+) сейчас|where is (.+) now)$/u.exec(location)?.slice(1).find(Boolean);
  if (target) return { primary: match.groups.primary!.trim(), target };
}

const simplePosition = /^(?:is (?:at|in|inside|near)|(?:в|во|на|у|около)) (?:the )?\p{L}+(?: \p{L}+){0,5}$/u;
const qualifiedPosition = /(?:^| )(?:and|or|if|would|might|maybe|yesterday|tomorrow|и|или|если|бы|возможно|вчера|завтра)(?= |$)/u;
const locationProperty = /(?:^| )(?:location|place|whereabouts|локация|место|местоположение)$/u;

export function lastLinkedPosition(facts: StoryFact[], target: string, scope: StoryRetrievalScope, links: LinkReader, episodes: EpisodeReader, time: StoryTimeReader) {
  const names = promiseParticipants(scope), token = names.mask(target);
  const id = /^@\d+@$/u.test(token) ? names.personId(token) : undefined;
  if (!id) return;
  const known = scope.entities.find(entity => entity.id === id && entity.kind === "character");
  let latest = 0, chosen: StoryFact | undefined, ambiguous = false;
  for (const fact of facts) {
    const order = episodes.position(fact);
    if (!order || order < latest || fact.kind !== "event" || fact.claim?.scope !== "state"
      || !locationProperty.test(normalizeText(fact.claim.key)) || time.read(fact) !== "last-known") continue;
    const person = links.read(fact).people.find(person => person.id === id && !person.unavailable && person.role === "subject");
    if (!person) continue;
    const quote = fact.quote.trim().replace(/\.$/u, "");
    if (/[.!?;:\r\n«»“”"]/u.test(quote)) continue;
    const text = normalizeText(quote);
    const name = [person.sourceName ?? person.name, ...(known?.aliases ?? [])].map(normalizeText)
      .filter(label => label && text.startsWith(label + " ")).sort((a, b) => b.length - a.length)[0];
    if (!name) continue;
    const position = text.slice(name.length + 1);
    if (!simplePosition.test(position) || qualifiedPosition.test(position)) continue;
    if (order > latest) { latest = order; chosen = fact; ambiguous = false; }
    else if (chosen?.quote !== fact.quote) ambiguous = true;
  }
  if (!ambiguous) return chosen;
}

export function linkedObjectQuery(draft: string) {
  if (draft.length > 180 || /[«»“”"<>]/u.test(draft)) return;
  const target = /^(?:напомни(?: мне)? (?:об?|про) |что было с |remind me about (?:the )?|what happened (?:with|to) (?:the )?)([\p{L}\p{N}]+(?: [\p{L}\p{N}]+){0,5})$/u.exec(normalizeText(draft))?.[1];
  if (target && !/(?:^| )(?:and|or|if|и|или|если)(?= |$)/u.test(target)) return target;
}

export function linkedObjectFacts(facts: StoryFact[], target: string, links: LinkReader, episodes: EpisodeReader) {
  return facts.filter(fact => links.read(fact).objects.some(object => object.id === target))
    .sort((a, b) => episodes.position(a) - episodes.position(b));
}

/** Select a whole, sourced fact only for a literal, single-subject question.
 * Broader questions and genuinely ambiguous matches use the usual retrieval. */
export function directLinkedRecall(draft: string, facts: StoryFact[], scope: StoryRetrievalScope, episodes: EpisodeReader, roles?: StoryRoleReader, archive: StoryFact[] = []) {
  if (draft.length > 260 || /[«»“”"<>]/u.test(draft)) return;
  const split = /^([^?？\r\n]+)[?？]([^?？\r\n]*)$/u.exec(draft.trim());
  if (!split) return;
  const question = normalizeText(split[1]!), tail = normalizeText(split[2]!);
  const target = /^(?:где сейчас (.+)|where is (?:the )?(.+) now)$/u.exec(question)?.slice(1).find(Boolean);
  const names = promiseParticipants(scope);
  if (target && (!tail || /^(?:назови только место|give only (?:its|the) current location)$/u.test(tail))) {
    if (!validStoryEventObject(target) || !target.includes(" ") || /@/u.test(names.mask(target))) return;
    const positions = facts.filter(fact => {
      const claim = fact.claim;
      if (fact.kind !== "event" || claim?.scope !== "state" || claim.lifetime !== "scene" || claim.status === "ended"
        || !locationProperty.test(normalizeText(claim.key)) || !episodes.read(fact)) return false;
      const quote = normalizeText(fact.quote.replace(/^(?:the )/iu, ""));
      if (!quote.startsWith(target + " ")) return false;
      const location = /^(?:is in|was moved (?:into|to)|лежит в|находится в|переложили в) (.+)$/u.exec(quote.slice(target.length + 1))?.[1];
      return location && validStoryEventObject(location) && !qualifiedPosition.test(location) && location === normalizeText(claim.value);
    });
    return positions.length === 1 ? positions[0] : undefined;
  }
  if (!roles || !archive.length || tail && !/^(?:коротко скажи когда и кому|скажи когда и кому)$/u.test(tail)) return;
  const masked = names.mask(question);
  const en = /^has (@\d+@) (delivered|returned|brought) (?:the )?(.+?) to (@\d+@)(?: and what had to happen first)?$/u.exec(masked);
  const ru = /^(@\d+@) уже (вернул[аи]?|передал[аи]?|отдал[аи]?) (@\d+@) (.+)$/u.exec(masked);
  const actor = en?.[1] ?? ru?.[1], verb = en?.[2] ?? ru?.[2], item = en?.[3] ?? ru?.[4], recipient = en?.[4] ?? ru?.[3];
  if (!actor || !verb || !item || !recipient || !item.includes(" ") || !validStoryEventObject(item)) return;
  const prefix = en ? `${actor} ${verb} ${item} to ${recipient}` : `${actor} ${verb} ${recipient} ${item}`;
  const closings = closedPromiseEvidence(facts, archive, episodes, fact => !!episodes.read(fact));
  const recipientLabels = names.literalLabels(recipient, question);
  const matches = new Set<StoryFact>();
  for (const [promise, outcome] of closings) {
    const source = roles.read(promise);
    const giver = source?.promisor;
    const receiver = source?.recipient;
    if (roles.status?.(promise) !== "bound" || !giver || giver.unavailable || giver.id !== names.personId(actor)
      || outcome.task?.status !== "completed") continue;
    const terms = normalizeText(promise.quote.split(/[.!?;:\n]/u)[0]!)
      .match(/(?:^| )(?:promised|обещал[аи]?) (.+)$/u)?.[1];
    if (!terms || !(" " + terms + " ").includes(" " + item + " ")) continue;
    const matchesRecipient = receiver
      ? !receiver.unavailable && receiver.id === names.personId(recipient)
      : recipientLabels.some(label => terms.startsWith(label + " "));
    if (!matchesRecipient) continue;
    const quote = names.mask(outcome.quote).replace(" the ", " ");
    if (quote === prefix || quote.startsWith(prefix + (en ? " after " : " после "))) matches.add(outcome);
  }
  return matches.size === 1 ? matches.values().next().value : undefined;
}
