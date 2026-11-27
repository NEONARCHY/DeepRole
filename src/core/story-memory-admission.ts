import { storyReplyProse, type StoryFact } from "./story-update";

export const STORY_IMPORTANCE_RULE = "Keep clues, commitments and consequential changes. Skip routine without impact. Zero facts is valid.";

const name = String.raw`\p{Lu}[\p{L}\p{M}\p{Pd}'’]*`;
const subject = String.raw`(?:${name}(?: ${name}){0,2}|он[аи]?|he|she|they)`;
const englishSubject = String.raw`(?:${subject}|(?:The|A|An) \p{Ll}+(?: \p{Ll}+)?)`;
const russian = new RegExp(String.raw`^${subject} (?:(?:сказал[аи]?|говорит), что (?:(?:он|она|они) )?)?(?:встал[аи]? (?:утром|сегодня утром)|(?:проснул(?:ся|ась|ись)|встал[аи]? с кровати|поднял(?:ся|ась|ись) с кровати)(?: (?:сегодня )?утром)?|поправил[аи]? рукав)\.$`, "u");
const russianShrug = new RegExp(String.raw`^${subject} (?:пожимает|пожал[аи]?) плечами\.$`, "u");
const english = new RegExp(String.raw`^${subject} (?:(?:said|says) (?:that )?(?:(?:he|she|they) )?)?(?:(?:woke up|got out of bed)(?: (?:in the morning|this morning))?|adjusted (?:his|her|their) sleeve)\.$`, "u");
const englishSleeve = new RegExp(String.raw`^${englishSubject} (?:adjusted|pulled up|rolled up) (?:his|her|their|a|the) sleeve\.$`, "u");
const englishTransit = new RegExp(String.raw`^(?:${englishSubject} (?:walks?|walked|passes?|passed|keeps walking|continues walking) past|The (?:survey|round|patrol) continues past) (?:the )?(?:bench|door|window|table) \d{1,3}\.$`, "u");
const russianTransit = new RegExp(String.raw`^${subject} (?:ид[её]т дальше вдоль|проходит мимо|прош[её]л мимо|прошла мимо) (?:окна|двери|скамьи|стола) (?:№ ?)?\d{1,3}\.$`, "u");
const addPeriod = (value: string) => /[\p{L}\p{N}]$/u.test(value.trim()) ? value.trim() + "." : value.trim();
const plainEvent = (fact: StoryFact) => fact.kind === "event" && !fact.claim && !fact.task && !fact.replaces;
const routineSentence = (value: string) => {
  const sentence = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return russian.test(sentence) || english.test(sentence);
};

/** Only simple standalone routine sentences. Conditions, consequences and
 * structured changes still go through the usual story checks. */
export function isRoutineStoryFact(fact: StoryFact): boolean {
  return plainEvent(fact) && routineSentence(addPeriod(fact.text)) && routineSentence(fact.quote);
}

/** Compare repeated passages by wording, ignoring only the landmark number. */
export function memoryBatchTransitPattern(prose: string): string | undefined {
  const sentence = addPeriod(prose).replace(/\s+/gu, " ");
  if (englishTransit.test(sentence) || russianTransit.test(sentence)) return sentence.replace(/\d+\.$/u, "#.");
}

export function isRoutineBatchStoryFact(fact: StoryFact, source: string, repeatedTransit: boolean): boolean {
  if (!plainEvent(fact)) return false;
  const prose = addPeriod(storyReplyProse(source));
  if (prose !== addPeriod(fact.quote)) return false;
  const housekeeping = (sentence: string) => routineSentence(sentence) || englishSleeve.test(sentence);
  if (housekeeping(prose) && housekeeping(addPeriod(fact.text))) return true;
  const transit = repeatedTransit ? memoryBatchTransitPattern(prose) : undefined;
  return transit !== undefined && transit === memoryBatchTransitPattern(fact.text);
}

export function isStandaloneRoutineStoryFact(fact: StoryFact, reply: string): boolean {
  if (plainEvent(fact) && russianShrug.test(addPeriod(fact.text)) && russianShrug.test(fact.quote)) return true;
  return isRoutineStoryFact(fact)
    && storyReplyProse(reply).split(/\r?\n[\t ]*\r?\n/u).some(paragraph => paragraph.trim() === fact.quote.trim());
}
