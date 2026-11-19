import type { EpisodeReader } from "./story-episodes";
import { closedPromiseEvidence, promiseParticipants } from "./story-promise-pair";
import { retrievalQueryNames, type StoryRetrievalScope } from "./story-retrieval-query";
import type { StoryRoleReader } from "./story-source-roles";
import type { StoryFact } from "./story-update";
import { normalizeText, storyObjectTokens } from "./text";

export const PROMISE_REFERENCE = "<deeprole_reference_guard>Answer about the indicated recorded promise only. Keep its giver, recipient, object, condition and latest recorded task status. A promise is not delivery.</deeprole_reference_guard>";
export const CLARIFY_PROMISE = "<deeprole_reference_guard>The intended promise is unclear. Ask the player one brief direct question about which promise they mean, naming the distinct recorded alternatives if available. Wait for their choice before acting or choosing a recipient. Do not invent alternatives.</deeprole_reference_guard>";

const reference = /(?:^| )(?:то (?:самое )?обещание|том (?:самом )?обещании|тем (?:самым )?обещанием|того (?:самого )?обещания|тому (?:самому )?обещанию|это обещание|(?:это|его|ее) обещали|(?:that|this) (?:promise|commitment)|(?:was|is) (?:that|it|this) promised)(?= |$)/u;
const cue = /^(?:я (?:про|имею в виду)|речь (?:про|о)|меня интересует|i mean|i am asking about|i meant) (.+)$/u;
const unsafeCue = /(?:^| )(?:не|если|возможно|якобы|not|never|unless|if|maybe|perhaps)(?= |$)/u;
const filler = new Set(storyObjectTokens(normalizeText("напомни кому когда куда который обещал обещала обещали обещание обещания дать отдать передать только после запись дело дело-то please remind who whom promise promised give after once about which one two mean that")));
const twoItems = /(?:^| )(?:два|две|двух|оба|обе|обоих|two|both)(?= |$)/u;

function referencedItem(query: string) {
  if (!/(?:^| )(?:обеща\p{L}*|пообеща\p{L}*|promis\p{L}*)(?= |$)/u.test(query)) return;
  const noun = /(?:^| )(?:(?:та самая|тот самый|то самое|те самые|that same|what about that) (\p{L}+)|which (\p{L}+) (?:does|was|did))(?= |$)/u.exec(query);
  const item = noun?.[1] ?? noun?.[2];
  return item && !/^(?:обещ\p{L}*|promis\p{L}*|one|was|she|he|it|commitment)$/u.test(item) ? item : undefined;
}

// Compare the object phrase at the start of each promise. Later destinations,
// deadlines or a shared condition alone cannot establish a common object.
function promisedSubject(text: string) {
  const tail = /(?:^| )(?:promised|(?:по)?обещал[аи]?) (.+)$/u.exec(text)?.[1] ?? "";
  return terms(tail.split(/ (?:for|after|once|from|until|when|для|после|только|из|когда|пока) /u)[0]!);
}

function terms(text: string) {
  return new Set(storyObjectTokens(text.replace(/@[^@]*@/gu, " ")).filter(t => !filler.has(t)));
}

export function promiseReferenceEvidence(facts: StoryFact[], draft: string, recent: string[], scope: StoryRetrievalScope,
  roles?: StoryRoleReader, episodes?: EpisodeReader, archive: StoryFact[] = []) {
  const query = normalizeText(draft);
  if (draft.length > 800 || unsafeCue.test(query) || /[<>]/u.test(draft)) return;
  const clauses = draft.split(/[.!?？;\n]/u).map(normalizeText);
  const currentCue = clauses.map(s => cue.exec(s)?.[1]).find(Boolean);
  const item = referencedItem(query);
  const messages = recent.slice(-2).filter(s => s.trim() && normalizeText(s) !== query);
  const last = messages.at(-1) ?? "";
  const mentionsPromise = (s: string) => /(?:^| )(?:(?:по)?обеща\p{L}*|promis\p{L}*|commitments?)(?= |$)/u.test(normalizeText(s));
  if (!item && !reference.test(query) && !(currentCue && [query, ...messages].some(mentionsPromise))) return;
  const unknown = { facts: [] as StoryFact[], certain: false };
  if (!roles || !episodes) return unknown;
  const { mask, personId } = promiseParticipants(scope);
  const supported = (f: StoryFact) => !!episodes.read(f) && roles.status?.(f) !== undefined &&
    !Object.values(roles.read(f) ?? {}).some(p => p.unavailable);
  const closed = closedPromiseEvidence(facts, archive, episodes, supported);
  const candidates = [...new Set([...facts, ...closed.keys()])].filter(f => f.kind === "promise" && f.claim?.status !== "ended").map(fact => {
    const quote = terms(mask(fact.quote));
    const words = [...terms(mask(fact.text))].filter(t => quote.has(t));
    const giver = roles.read(fact)?.promisor?.id;
    return { fact, words, giver, verified: !!giver && supported(fact) };
  });
  type Candidate = typeof candidates[number];
  function match(line: string, pool: Candidate[]) {
    const masked = mask(line);
    if (masked.includes("@ambiguous@")) return [];
    const tokens = terms(masked);
    // Only a possessive identifies the giver. A bare name may equally name
    // a recipient or a bystander who has made another promise.
    const givers = new Set([...masked.matchAll(/(?:обещани[ея] (@\d+@)|(@\d+@) s (?:promise|commitment))(?= |$)/gu)].map(m => personId(m[1] ?? m[2]!)));
    // A material can be a noun in the cue and an adjective in the source
    // ("из эмали" / "эмалевый"). Only use the material stem in this syntax.
    const materials = [...masked.matchAll(/(?:^| )из ([а-я]+)(?= |$)/gu)].flatMap(m => storyObjectTokens(m[1]!));
    const matches = pool.map(candidate => {
      const hits = candidate.words.filter(t => tokens.has(t) || materials.some(m => t === m + "ев" || t === m + "ов"));
      return { candidate, hits, named: !!candidate.giver && givers.has(candidate.giver) };
    });
    // A bystander's name alone cannot bring a third, unrelated promise into a scene.
    const byObject = matches.filter(m => m.hits.length);
    return (byObject.length ? byObject : matches.filter(m => m.named)).map(m => m.candidate);
  }
  const lastCue = cue.exec(normalizeText(last))?.[1];
  const explicit = currentCue ?? lastCue;
  let discussion = lastCue ? messages.at(-2) ?? "" : last;
  if (item) discussion = clauses.find(s => twoItems.test(s) && !referencedItem(s)) ?? discussion;
  const itemTerms = terms(item ?? "");
  let pool = item ? candidates.filter(({ fact }) => {
    const source = promisedSubject(mask(fact.quote));
    const summary = promisedSubject(mask(fact.text));
    return [...itemTerms].some(t => source.has(t) && summary.has(t));
  }) : match(query, candidates);
  if (item && !pool.length) {
    // A player may call a pair of items "parcels" while the sources describe
    // their contents. The label by itself is never a stored synonym.
    const context = normalizeText(discussion);
    const topic = terms(context.replace(/\b([a-z]+le)s\b/gu, "$1"));
    if (!twoItems.test(context) || ![...itemTerms].some(t => topic.has(t))) return unknown;
    const masked = mask(discussion);
    const named = [...new Set(masked.match(/@\d+@/gu))];
    if (named.length !== 1 || masked.includes("@ambiguous@")) return unknown;
    const person = scope.entities.find(p => p.id === personId(named[0]!));
    if (!person) return unknown;
    const names = retrievalQueryNames({ ...person, aliases: [] });
    const addressed = (text: string) => {
      const tail = /(?:^| )(?:promised|(?:по)?обещал[аи]?) (?:to )?(.+)$/u.exec(normalizeText(text))?.[1];
      return !!tail && names.some(n => tail === n || tail.startsWith(n + " "));
    };
    pool = candidates.filter(({ fact }) => {
      const recipient = roles.read(fact)?.recipient;
      return (!recipient || recipient.id === person.id) && addressed(fact.quote) && addressed(fact.text);
    });
    if (pool.length !== 2) return unknown;
    const subjects = pool.map(({ fact }) => {
      const source = promisedSubject(mask(fact.quote));
      return [...promisedSubject(mask(fact.text))].filter(t => source.has(t));
    });
    if (!subjects[0]!.some(t => subjects[1]!.includes(t))) return unknown;
  }
  if (!pool.length && !item) pool = match(discussion, candidates);
  if (!pool.length && !item && !lastCue && messages.length === 2) {
    discussion = messages[0]!;
    pool = match(discussion, candidates);
  }
  if (explicit) {
    if (unsafeCue.test(explicit)) return unknown;
    const matches = match(explicit, pool.length ? pool : candidates);
    // A shared noun ("ribbon") doesn't distinguish two candidates. Drop a
    // weaker match only if the same cue adds a source-specific descriptor.
    const tokens = terms(mask(explicit));
    const specific = matches.filter(c => c.words.some(w => tokens.has(w) && matches.every(other => other === c || !other.words.includes(w))));
    pool = specific.length ? specific : matches;
  }
  if (!pool.length || pool.length > 2 || pool.some(c => !c.verified)) return unknown;
  const selected = pool.flatMap(({ fact }) => [fact, ...(closed.has(fact) ? [closed.get(fact)!] : [])]);
  const mentionsTwo = twoItems.test(normalizeText(discussion + " " + draft));
  return { facts: [...new Set(selected)], certain: pool.length === 1 && (!!explicit || !mentionsTwo) };
}
