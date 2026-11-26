import { storyReplyProse, type StoryFact } from "./story-update";

export const STORY_IMPORTANCE_RULE = "Keep clues, commitments and consequential changes. Skip routine without impact. Zero facts is valid.";

const name = String.raw`\p{Lu}[\p{L}\p{M}\p{Pd}'’]*`;
const subject = String.raw`(?:${name}(?: ${name}){0,2}|он[аи]?|he|she|they)`;
const russian = new RegExp(String.raw`^${subject} (?:(?:сказал[аи]?|говорит), что (?:(?:он|она|они) )?)?(?:встал[аи]? (?:утром|сегодня утром)|(?:проснул(?:ся|ась|ись)|встал[аи]? с кровати|поднял(?:ся|ась|ись) с кровати)(?: (?:сегодня )?утром)?|поправил[аи]? рукав)\.$`, "u");
const english = new RegExp(String.raw`^${subject} (?:(?:said|says) (?:that )?(?:(?:he|she|they) )?)?(?:(?:woke up|got out of bed)(?: (?:in the morning|this morning))?|adjusted (?:his|her|their) sleeve)\.$`, "u");
const routineSentence = (value: string) => {
  const sentence = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return russian.test(sentence) || english.test(sentence);
};

/** Only simple standalone routine sentences. Conditions, consequences and
 * structured changes still go through the usual story checks. */
export function isRoutineStoryFact(fact: StoryFact): boolean {
  return fact.kind === "event" && !fact.claim && !fact.task && !fact.replaces
    && routineSentence(/\p{L}$/u.test(fact.text.trim()) ? fact.text.trim() + "." : fact.text) && routineSentence(fact.quote);
}

export function isStandaloneRoutineStoryFact(fact: StoryFact, reply: string): boolean {
  return isRoutineStoryFact(fact)
    && storyReplyProse(reply).split(/\r?\n[\t ]*\r?\n/u).some(paragraph => paragraph.trim() === fact.quote.trim());
}
