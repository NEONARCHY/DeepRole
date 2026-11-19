import { normalizeText, storyObjectTokens } from "./text";

// This matches candidate quotations. Polarity, speaker and time belong to the
// quoted scene; finding an object next to a verb is not a decision that it happened.
const actions = [
  /^(?:заменил[аи]?|поменял[аи]?|заменен[аоы]?|заменили|поменяли|замены|replace[ds]?|replacing)$/u,
  /^(?:отремонтировал[аи]?|починил[аи]?|отремонтирован[аоы]?|починен[аоы]?|ремонта|repairs?|repaired|repairing|fixed)$/u,
  /^(?:проверил[аи]?|осмотрел[аи]?|проверен[аоы]?|осмотрен[аоы]?|inspect(?:ed|ing)?|check(?:ed|ing)?)$/u,
];
const grammar = /^(?:a|an|the|s|has|have|had|been|was|were|is|are|already|did|not|never|yet|был[аои]?|уже|пока|не|еще)$/u;

const uncertain = /(?:^| )(?:если|бы|якобы|сказал[аи]?|сообщил[аи]?|планир\p{L}*|хочет|if|would|whether|said|claimed|plans?|might|will|should|could|wants?)(?= |$)/u;
const boundary = /^(?:at|by|near|beside|inside|outside|before|after|during|in|on|for|today|yesterday|у|в|на|около|перед|после|вчера|сегодня)$/u;

export function maintenancePremise(draft:string) {
  const clause = /(?:^|\s)(?:раз|теперь когда|после|now that|since|after)\s+([^?？.!;:\n,]+)/iu.exec(draft)?.[1];
  if (!clause) return;
  const tokens = normalizeText(clause).split(" ");
  const occurrences = tokens.flatMap((token,i) => {
    const action = actions.find(pattern => pattern.test(token));
    return action ? [{action,i}] : [];
  });
  if (occurrences.length !== 1) return;
  const {action,i} = occurrences[0]!;
  const clean = (items:string[]) => items.filter(w => !grammar.test(w));
  const after = clean(tokens.slice(i+1));
  const object = after.length ? after : clean(tokens.slice(0,i));
  if (!object.length || object.length > 4 || object.some(w => /^(?:он[аои]?|его|ее|это|они|их|it|they|them|one|and|or|и|или)$/u.test(w))) return;
  const key = storyObjectTokens(object.join(" ")).join(" ");
  if (!key) return;
  return (source:string, relevant:(s:string)=>boolean) => {
    const observations = new Set<string>();
    for (const sentence of source.match(/[^.!?\n]+[.!?]?/gu) ?? []) {
      if (sentence.endsWith("?") || uncertain.test(normalizeText(sentence))) continue;
      for (const part of sentence.split(/[,;:]|\s+(?:а|но|и|and|but)\s+/iu)) {
        if (!relevant(part)) continue;
        const words = normalizeText(part).split(" ");
        for (const [index,word] of words.entries()) {
          if (!action.test(word)) continue;
          const before = words.slice(0,index);
          const right = clean(words.slice(index+1));
          const next = right[object.length];
          const rightMatch = (!next || boundary.test(next)) && storyObjectTokens(right.slice(0,object.length).join(" ")).join(" ") === key;
          const passive = /[а-я]/u.test(word) || before.some(w => /^(?:was|were|been|is|are)$/u.test(w));
          const leftMatch = passive && storyObjectTokens(clean(before).slice(-object.length).join(" ")).join(" ") === key;
          if (rightMatch || leftMatch) observations.add(before.slice(-3).some(w => /^(?:не|not|never)$/u.test(w)) ? "denied" : "reported");
        }
      }
    }
    return observations.size === 1 ? [...observations][0] : undefined;
  };
}
