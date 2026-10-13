import type { OwnerRole } from "./story-source-roles";
import { isPersonalStoryReference, retrievalNames, type StoryRetrievalScope } from "./story-retrieval-query";
import { normalizeText } from "./text";

export interface StoryOwnerQuestion { role: OwnerRole; personId: string }
const verbs: Record<OwnerRole, string> = {
  promisor: "promise|promised|promises|pledged|обещал|обещала|обещали|обещает|обещаю",
  planner: "plan|plans|planned|planning|планирует|планировал|планировала",
  believer: "believe|believes|believed|think|thinks|thought|считает|считала|считал|думает|думала|думал",
};
const nouns: Record<OwnerRole, string> = {
  promisor: "promises?|commitments?|обещания|обещание|обязательства",
  planner: "plans?|intentions?|планы|план|намерения|намерение",
  believer: "beliefs?|opinions?|мнение|мнения|убеждения|убеждение",
};
// @ cannot survive normalizeText in user text, so literal input cannot spoof a
// generated name token by referring to a different occurrence's index.
const personToken = "(@person\\d+@)";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Query syntax only. It cannot infer historical ownership or change versioned
 * source bindings. Ambiguous names, pronouns and compound requests abstain. */
export function storyOwnerQuestion(draft: string, scope: StoryRetrievalScope): StoryOwnerQuestion | undefined {
  // Quoted dialogue is evidence/content, not a request to select its speaker.
  if (/[«»“”"]/u.test(draft)) return;
  const names = new Map<string, Set<string>>(), subjects = new Map<string, Set<string>>();
  for (const e of scope.entities) if (e.kind === "character" && e.worldId === scope.worldId) {
    for (const [map, forms] of [[names, retrievalNames(e)], [subjects, retrievalNames(e, false)]] as const) {
      for (const name of forms) if (name && !isPersonalStoryReference(name)) {
        const ids = map.get(name) ?? new Set<string>(); ids.add(e.id); map.set(name, ids);
      }
    }
  }
  const phrases = [...names.keys()].sort((a, b) => b.length - a.length);
  if (!phrases.length) return;
  const identities = new Map<string, { id: string; subject: boolean }>();
  let serial = 0;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${phrases.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  let query = normalizeText(draft).replace(pattern, phrase => {
    const token = `@person${serial++}@`, ids = names.get(phrase)!;
    if (ids.size === 1) {
      const id = [...ids][0]!;
      identities.set(token, { id, subject: subjects.get(phrase)?.has(id) ?? false });
    }
    return token; // A longer ambiguous name never falls back to a shorter name.
  });
  query = query.replace(/^(?:пожалуйста )?(?:напомни(?: мне)?|расскажи(?: мне)?|покажи(?: мне)?|перечисли) (?:пожалуйста )?/u, "")
    .replace(/^(?:please )?(?:remind me(?: of)?|tell me|show me|list) (?:please )?/u, "");
  if (/(?:^| )(?:не|not|never|if|если|would|might)(?: |$)/u.test(query)
    || /(?:^| )(?:и|или|and|or) (?:что|what|@person\d+@)(?: |$)/u.test(query)) return;
  const ownerWords = new RegExp(`(?:^| )(?:${Object.values(verbs).join("|")})(?= |$)`, "gu");
  if ([...query.matchAll(ownerWords)].length > 1) return;

  for (const role of Object.keys(verbs) as OwnerRole[]) {
    const verb = `(?:${verbs[role]})`, noun = `(?:${nouns[role]})`;
    const verbal = [
      `^(?:что|о чем) ${personToken} ${verb}(?: |$)`,
      `^что ${verb} ${personToken}(?: |$)`,
      `^what (?:did|does|has|is) ${personToken} ${verb}(?: |$)`,
      `^what ${personToken} ${verb}(?: |$)`,
    ];
    for (const syntax of verbal) {
      const match = query.match(new RegExp(syntax, "u")), person = match && identities.get(match[1]!);
      const tail = match ? query.slice(match[0].length).trim() : "";
      if (person?.subject && !/^(?:и|или|and|or)(?: |$)/u.test(tail)) return { role, personId: person.id };
    }
    const nominal = [
      `^(?:(?:какие|какое|каковы|все) )?${noun} (?:у )?${personToken}$`,
      `^(?:какие|какое) у ${personToken} ${noun}$`,
      `^(?:в чем|каково) ${noun} ${personToken}$`,
      `^(?:(?:what are|what is|all) )?(?:the )?${personToken} s ${noun}$`,
      `^(?:(?:what are|what is|all) )?(?:the )?${noun} of ${personToken}$`,
    ];
    for (const syntax of nominal) {
      const match = query.match(new RegExp(syntax, "u")), person = match && identities.get(match[1]!);
      if (person) return { role, personId: person.id };
    }
  }
}
