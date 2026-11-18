import type { StoryFact } from "./story-update";
import type { StoryRevision } from "./story-records";
import { isPersonalStoryReference, retrievalNames } from "./story-retrieval-query";
import { roleEntities } from "./story-role-binding";
import { normalizeText } from "./text";

type VisitSource = Pick<StoryRevision,"id"|"worldId"|"content"|"roleRoster">;

// One named visit with a concrete destination. Keep conditional, recurring,
// compound and reported goals out of this local inference.
const destination = /^(?:концерт|выставку|фестиваль|спектакль|concert|exhibition|festival|performance) [\p{L}\p{N}]+(?: [\p{L}\p{N}]+){0,6}$/u;
const qualifier = /(?:^| )(?:если|после|пока|без|кажд\p{L}*|снова|вместо|но|или|и|не|if|after|before|unless|without|every|again|instead|but|and|or|not)(?: |$)/u;
const desire = /^(.+?) (?:хочет|хотел[аи]?|планирует) (?:попасть|сходить|пойти) на (.+)$|^(.+?) (?:wants|wanted|plans|planned) to (?:go to|attend) (?:the |a )?(.+)$/u;
const attended = /^(.+?) (?:попал[аи]?|сходил[аи]?) на (.+)$|^(.+?) (?:attended|went to) (?:the |a )?(.+)$/u;
const escorted = /^(.+?) (?:сводил[аи]?|отвел[аи]?) (.+?) на (.+)$|^(.+?) took (.+?) to (?:the |a )?(.+)$/u;

function singleStatement(fact: StoryFact) {
  const raw = fact.quote.trim().replace(/[.!]$/u, "");
  const withoutTitle = raw.replace(/\s[«“"]([\p{L}\p{N}][\p{L}\p{N} '\-]{0,80})[»”"]$/u," $1");
  if (fact.text !== fact.quote || /[.!?;:,\n«»“”"]/u.test(withoutTitle)) return;
  const text = normalizeText(raw);
  return qualifier.test(text) ? undefined : text;
}

function goal(fact: StoryFact) {
  if (fact.kind !== "plan" || fact.claim || fact.replaces || (fact.task && fact.task.status !== "open")) return;
  const m = desire.exec(singleStatement(fact) ?? "");
  if (!m) return;
  const target = m[2] ?? m[4]!;
  return destination.test(target) ? { actor:m[1] ?? m[3]!, target } : undefined;
}

// A reversible key for short, previously unlinked plans. The original
// spelling (including case/punctuation) keeps distinct source slots distinct.
export function attendanceTask(fact: StoryFact) {
  if (!goal(fact)) return;
  if (fact.task) return fact.task;
  const key = "visit:plan:" + fact.text;
  return key.length <= 160 ? {key,title:fact.text,status:"open" as const} : undefined;
}

function uniquePerson(name:string, source:VisitSource) {
  if (isPersonalStoryReference(name)) return;
  const found = roleEntities(source.roleRoster ?? [],source.worldId ?? "").filter(p=>retrievalNames(p).includes(name));
  return found.length === 1 ? found[0]!.id : undefined;
}

function wholeSceneStatement(fact:StoryFact, source:VisitSource) {
  const prose = source.content.split(/<deeprole_/u)[0]!;
  return prose.split(/(?<=[.!?])\s+|[\r\n]+/u).some(line => line.trim() === fact.quote);
}

/** Only link a completed visit to one accepted goal with the same named
 * attendee in BOTH source rosters and the same destination. Buying a ticket
 * or merely mentioning the venue cannot establish attendance. */
export function playedAttendanceGoal(event:StoryFact, source:VisitSource, previous:StoryFact[], sourceOf:(fact:StoryFact)=>VisitSource|undefined) {
  if (event.kind !== "event" || event.claim || event.task && event.task.status !== "completed") return;
  const text = singleStatement(event);
  if (!text) return;
  const visit = attended.exec(text), escort = visit ? null : escorted.exec(text);
  if (!visit && !escort) return;
  const target = visit ? visit[2] ?? visit[4]! : escort![3] ?? escort![6]!;
  if (!destination.test(target) || !wholeSceneStatement(event,source)) return;
  if (escort && !uniquePerson(escort[1] ?? escort[4]!,source)) return;
  const person = uniquePerson(visit ? visit[1] ?? visit[3]! : escort![2] ?? escort![5]!,source);
  if (!person) return;
  const candidates = previous.filter(fact => {
    const plan = goal(fact);
    if (plan?.target !== target) return false;
    const earlier = sourceOf(fact);
    return earlier && (earlier.id !== source.id || earlier.content.indexOf(fact.quote) < earlier.content.indexOf(event.quote))
      && wholeSceneStatement(fact,earlier) && uniquePerson(plan.actor,earlier) === person;
  });
  if (candidates.length !== 1) return;
  const task = attendanceTask(candidates[0]!);
  if (!task || event.task && (task.key !== event.task.key || task.title !== event.task.title)) return;
  return { plan:candidates[0]!, task:{ ...task,status:"completed" as const } };
}
