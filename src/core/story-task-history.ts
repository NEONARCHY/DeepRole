import { compactStoryFactSources, type StoryFact } from './story-update';
import { storyFactIdentity } from './story-memory-lifecycle';
import { storyRecallLexicon } from './story-natural-recall';
import { topicWindow } from './story-topic-terms';
import { unresolvedStoryIntent } from './story-unresolved-intent';
import { safeMemoryJson } from './story-memory-transport';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';

/** Selected, exact historical task sources only. Never change compacted canon,
 * reopen a task, restore a corrected fact or reinterpret frozen role bindings. */
export function taskHistorySources(all: StoryFact[], selected: StoryFact[], query: string, names: string[], roles?: StoryRoleReader, episodes?: EpisodeReader) {
  if (!roles || !episodes || query.length > 4000) return;
  const lex = storyRecallLexicon(names), clauses = lex.clauses(query), intent = unresolvedStoryIntent(query,lex.mask(query));
  const current = new Map(compactStoryFactSources(all).filter(f=>f.task).map(f=>[f.task!.key,f]));
  const selectedIds = new Set(selected.map(storyFactIdentity)), removed = new Set(all.flatMap(f=>f.replaces??[]));
  // Ask who made this promise, then corroborate its subject in the actual
  // promise. A later receipt often has a different speaker and a shorter title.
  const owner = roles.question?.role === 'promisor' ? roles.question.personId : undefined;
  const pairs = (text:string) => lex.clauses(text).flatMap(clause => {
    const words = clause.map(w => /^[а-я]{3}[ау]$/u.test(w) ? w.slice(0,-1) : w);
    return words.slice(1).flatMap((right,i) => {
      const left = words[i]!;
      return [left,right].every(w => /^[\p{L}]{3,}$/u.test(w) && !/^(?:обещ|promis|pledge|what|did$)/u.test(w))
        ? [left+' '+right] : [];
    });
  });
  const subject = owner ? new Set(pairs(query.split(/[?!,;]|\s(?:и|and)\s/iu)[0]!)) : undefined;
  const ownerKeys = new Set<string>();
  if (subject?.size) for (const fact of all) {
    if (fact.task?.status !== 'open' || fact.kind !== 'promise' || removed.has(storyFactIdentity(fact))
      || roles.status?.(fact) !== 'bound' || roles.read(fact)?.promisor?.id !== owner) continue;
    const quoted = new Set(pairs(fact.quote));
    if (pairs(fact.text).some(pair => subject.has(pair) && quoted.has(pair))) ownerKeys.add(fact.task.key);
  }
  let onlyOwnerHistory = true;
  const history: StoryFact[] = [], states: {key:string;status:string;sourceRevisionId:string}[] = [];
  for (const [key,latest] of current) {
    if (!selectedIds.has(storyFactIdentity(latest))) continue;
    const label = lex.clauses(latest.task!.title)[0], title = label?.filter(t=>t!=='__deeprole_gap__');
    const byOwner = ownerKeys.size === 1 && ownerKeys.has(key) && latest.task!.status !== 'open';
    if (!byOwner && (!title || title.length<2 || title.some(t=>t.startsWith('__deeprole_')) || !(topicWindow(clauses,title) || intent.closedQuestion))) continue;
    const previous = all.filter(f=>f.task?.key===key && storyFactIdentity(f)!==storyFactIdentity(latest) && !removed.has(storyFactIdentity(f)));
    if (!previous.length) continue;
    if (byOwner && previous.some(f => f.kind === 'promise' && roles.read(f)?.promisor?.id !== owner)) continue;
    const literal = (f:StoryFact) => [f.text,f.quote].every(text=>lex.clauses(text).some(words=>words.some((_,at)=>label!.every((term,i)=>words[at+i]===term))));
    // The key links history to the accepted current state; metadata alone
    // cannot manufacture an object label absent from every source quote.
    if (!byOwner && ![latest,...previous].some(literal)) continue;
    const valid = (f:StoryFact)=>roles.status?.(f)!==undefined && !!episodes.read(f) && !Object.values(roles.read(f)??{}).some(p=>p.unavailable);
    if (!valid(latest) || previous.some(f=>!valid(f) || episodes.position(f)>=episodes.position(latest))) return { primary: [], guide: '', reason: 'source' as const };
    history.push(...previous); states.push({key,status:latest.task!.status,sourceRevisionId:episodes.read(latest)!.revisionId});
    onlyOwnerHistory &&= byOwner;
  }
  if (!history.length) return;
  if (history.length+selected.length>128) return { primary: [], guide: '', reason: 'capacity' as const };
  history.sort((a,b)=>episodes.position(a)-episodes.position(b));
  const guide='<deeprole_task_history>Earlier task rows are historical evidence, NOT current obligations. Their original task.status describes the source moment. Do NOT reopen a completed/cancelled task from an earlier open row. These latest accepted task states override earlier rows with the same key regardless of payload order; sourceRevisionId identifies their exact source. Never propose this history as new progress. Current task states: '+safeMemoryJson(states)+'</deeprole_task_history>';
  return { primary: history, guide, restoredByOwner:onlyOwnerHistory };
}
