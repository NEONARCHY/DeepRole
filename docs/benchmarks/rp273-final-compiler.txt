import { characterInstruction,type CharacterPromptPlan } from "./characters";
import { selectCharacterContext } from "./character-context";
import { compileMemoryWorkspace } from "./memory-workspace";
import { formatMemoryContext } from "./context";
import { rankStoryFacts,formatStoryFacts } from "./story-fact-context";
import { storyContentRelevance } from "./story-content-relevance";
import { discussionPriorityFacts } from "./story-discussion-priority";
import { flexiblePriorityFacts } from "./story-flexible-priority";
import { storyActionSequence, sequencePriorityFacts } from "./story-sequence-priority";
import { budgetPriorityFacts, BUDGET_SOURCE_ROWS } from "./story-budget-priority";
import { storyFactIdentity } from "./story-memory-lifecycle";
import { isPlainStoryContinuation,storyContinuationCandidates } from "./story-continuation-balance";
import {storyActionBalance} from "./story-action-balance";
import {storyTaskGoal,storyTaskGoalCandidates} from "./story-task-goal";
import {storyCompoundAction} from "./story-compound-action";
import {storyNaturalRecall} from "./story-natural-recall";
import {storyLastingRecall} from "./story-lasting-recall";
import {storyObjectReference,storyLiteralReference,storyReferenceCandidates,UNRESOLVED_STORY_OBJECT,AMBIGUOUS_STORY_OBJECT} from "./story-reference-recall";
import { storyUpdateInstruction } from "./story-update";
import type { StoryFact } from "./story-update";
import { storyAutomationInstruction } from "./story-automation";
import { sceneChoiceInstruction } from "./scene-choices";
import { continuationContext,boundStory } from "./story-continuation";
import { estimateTokens,normalizeText,uniqueTokens } from "./text";
import { expandFocus, mentionedEntities } from "./scene";
import { storyRetrievalQuery, UNRESOLVED_STORY_REFERENCE, AMBIGUOUS_STORY_NAME } from "./story-retrieval-query";
import { createStoryRoleReader, type StoryRoleReader } from "./story-source-roles";
import { storedRoleReader, type FactRoleSeed } from "./story-role-binding";
import { createEpisodeReader, type EpisodeReader } from "./story-episodes";
import { createStoryTimeReader, formatStoryTime, isGameTimeFact } from "./story-time";
import type { RankMemoryInput } from "./memory-engine";
import type { ContextSelection,WorldProfile,HandoffSnapshot,StoryContinuation } from "./types";

export interface GameContextReport {
 limit:number;total:number;required:number;
 selected:{lore:number;profiles:number;facts:number;continuation:number};
 omitted:{lore:number;profiles:number;facts:number;continuation:number};
 explanation?:{draftFacts:number;recentFacts:number;openTasks:number;recentFallback:number;persistentFacts?:number};
}
export interface GameContextInput extends RankMemoryInput {
 worlds:WorldProfile[];
 character?:Parameters<typeof characterInstruction>;
  story?:{world:WorldProfile;chat:string;branch:string;facts:StoryFact[];sheetsEnabled:boolean;roleSeeds?:FactRoleSeed[];episodeSources?:string[]};
 choices?:boolean;
 snapshot?:HandoffSnapshot|null;
 continuation?:StoryContinuation;
 restart?:boolean;
 /** Already validated, request-specific recovered reply; never cut its meaning. */
 requiredContext?:string;
}
type ProfilePart={id:string;name:string;field:"appearance"|"personality"|"goals"|"background";text:string;ordinal:number};
const fields=["appearance","personality","goals","background"] as const;
const join=(parts:string[])=>parts.filter(Boolean).join("\n\n");
/** Includes the separator added by injectContextIntoPrompt, not the user's draft. */
export const addedContextTokens=(text:string)=>estimateTokens(text?text+"\n\n[User message]\n":"");
/** One local compiler owns the complete added prompt. No storage writes, model
 * calls, transcript deletion, fuzzy identity replacement or partial JSON cuts. */
export interface GameContextOptions { memoryTransport?: "compact"|"legacy"; contentRelevance?: boolean; topicAdmission?: boolean; continuationBalance?: boolean; actionBalance?: boolean; taskGoalBalance?: boolean; compoundActionBalance?: boolean; naturalRecall?: boolean; lastingRecall?: boolean; referenceRecall?: boolean|"guard"; referenceBundle?: boolean; discussionPriority?: boolean; flexiblePriority?: boolean; sequencePriority?: boolean; budgetPriority?: boolean }
type PriorityProof = { facts: StoryFact[]; selected: StoryFact[]; roles?: StoryRoleReader; episodes?: EpisodeReader; referenceGuard: string; admission: ReturnType<typeof storyContentRelevance>["admission"]; action: ReturnType<typeof storyActionBalance>; names: string[] };
type PriorityReservation = { ids: string[]; covers: (selected:StoryFact[])=>boolean; budgetRows?: boolean };
/** RP273: allow more than eight whole request-owned sources when the COMPLETE
 * rendered prompt fits. Otherwise return the exact RP272 result and counters.
 * This reads memory only; it never performs the user's action or edits canon. */
export function compileGameContext(input:GameContextInput, options:GameContextOptions = {}) {
 let proof:PriorityProof|undefined;
 const prior=compileSequenceContext(input,options,p=>{proof=p});
 if(options.budgetPriority===false||options.sequencePriority===false||options.flexiblePriority===false||options.discussionPriority===false||options.topicAdmission===false||options.contentRelevance===false||options.actionBalance===false||!input.story||input.restart||input.character?.[9]||!proof)return prior;
 if(proof.referenceGuard&&proof.referenceGuard!==AMBIGUOUS_STORY_OBJECT)return prior;
 const sequence=storyActionSequence(input.draft,proof.names);
 if(sequence&&sequence.matches.length>1&&options.compoundActionBalance===false)return prior;
 const actionMatches=proof.action?.kind==='object'?proof.action.matches:undefined;
 const filter=sequence?{matches:(f:StoryFact)=>sequence.matches.some(m=>m(f)),covers:(selected:StoryFact[])=>sequence.matches.every(m=>selected.some(m))}:proof.admission??(actionMatches?{matches:actionMatches,covers:(selected:StoryFact[])=>selected.some(actionMatches)}:undefined);
 if(proof.referenceGuard&&!sequence&&proof.action?.kind!=='object')return prior;
 const group=budgetPriorityFacts(proof.facts,input.draft,filter,proof.roles,proof.episodes);
 if(!group)return prior;
 const repeatIds=new Set([...group.repeats].map(storyFactIdentity));
 const ids=[...new Set([...group.primary,...proof.selected.filter(f=>!repeatIds.has(storyFactIdentity(f)))].map(storyFactIdentity))];
 // Leave all <=8 behavior unchanged. Retain every prior substantive source;
 // if their union exceeds decoder safety, don't choose an arbitrary subset.
 if(ids.length<=8||ids.length>BUDGET_SOURCE_ROWS)return prior;
 let selected:StoryFact[]=[];
 const candidate=compileGameContextPass(input,options,{ids,covers:group.covers,budgetRows:true},p=>{selected=p.selected});
 const accepted=new Set(selected.map(storyFactIdentity));
 return ids.every(id=>accepted.has(id))&&candidate.report.required<=candidate.report.limit&&candidate.report.total<=candidate.report.limit?candidate:prior;
}
/** RP272: all objects in a finite short/compound action need whole evidence.
 * The complete RP271 result remains the rollback; no canonical state writes. */
function compileSequenceContext(input:GameContextInput, options:GameContextOptions, capture:(proof:PriorityProof)=>void) {
 let proof:PriorityProof|undefined;
 const prior=compileFlexibleContext(input,options,p=>{proof=p;capture(p)});
 if(options.sequencePriority===false||options.flexiblePriority===false||options.discussionPriority===false||options.topicAdmission===false||options.contentRelevance===false||options.actionBalance===false||!input.story||input.restart||input.character?.[9]||!proof)return prior;
 if(proof.referenceGuard&&proof.referenceGuard!==AMBIGUOUS_STORY_OBJECT)return prior;
 const sequence=storyActionSequence(input.draft,proof.names);
 if(!sequence||sequence.matches.length>1&&options.compoundActionBalance===false)return prior;
 const group=sequencePriorityFacts(proof.facts,sequence,proof.roles,proof.episodes);
 if(!group)return prior;
 const repeatIds=new Set([...group.repeats].map(storyFactIdentity));
 const ids=[...new Set([...group.primary,...proof.selected.filter(f=>!repeatIds.has(storyFactIdentity(f)))].map(storyFactIdentity))];
 if(ids.length>8)return prior;
 const oldIds=new Set(proof.selected.map(storyFactIdentity));
 if(ids.every(id=>oldIds.has(id)))return prior;
 let selected:StoryFact[]=[];
 let candidateProof:PriorityProof|undefined;
 const candidate=compileGameContextPass(input,options,{ids,covers:group.covers},p=>{selected=p.selected;candidateProof=p});
 const accepted=new Set(selected.map(storyFactIdentity));
 if(ids.every(id=>accepted.has(id))&&candidate.report.required<=candidate.report.limit&&candidate.report.total<=candidate.report.limit){capture(candidateProof!);return candidate}
 return prior;
}
/** RP271 keeps the complete RP270 result as rollback, including its counters.
 * The old grammar/protocol remain unchanged; comparison flags are local only. */
function compileFlexibleContext(input:GameContextInput, options:GameContextOptions, capture:(proof:PriorityProof)=>void) {
 let proof:PriorityProof|undefined;
 const prior=compileDiscussionContext(input,options,p=>{proof=p;capture(p)});
 if(options.flexiblePriority===false||options.discussionPriority===false||options.topicAdmission===false||options.contentRelevance===false||!input.story||input.restart||input.character?.[9]||!proof)return prior;
 // A literal shared label is still ambiguous, NOT an object identity. Keep
 // the existing guard on wire and every independent candidate/condition; only
 // this supported object action may prefer them over proved empty discussion.
 if(proof.referenceGuard&&!(proof.referenceGuard===AMBIGUOUS_STORY_OBJECT&&proof.action?.kind==='object'))return prior;
 const group=flexiblePriorityFacts(proof.facts,input.draft,proof.admission,proof.action,proof.roles,proof.episodes);
 if(!group)return prior;
 const repeatIds=new Set([...group.repeats].map(storyFactIdentity));
 const protectedPrior=proof.selected.filter(f=>!repeatIds.has(storyFactIdentity(f)));
 const ids=[...new Set([...group.primary,...protectedPrior].map(storyFactIdentity))];
 if(ids.length>8)return prior;
 const oldIds=new Set(proof.selected.map(storyFactIdentity));
 if(ids.every(id=>oldIds.has(id)))return prior;
 let selected:StoryFact[]=[];
 let candidateProof:PriorityProof|undefined;
 const candidate=compileGameContextPass(input,options,{ids,covers:group.covers},p=>{selected=p.selected;candidateProof=p});
 const accepted=new Set(selected.map(storyFactIdentity));
 if(ids.every(id=>accepted.has(id))&&candidate.report.required<=candidate.report.limit&&candidate.report.total<=candidate.report.limit){capture(candidateProof!);return candidate}
 return prior;
}
/** The first pass is also the exact rollback value. Read internal selection,
 * never parse potentially user-authored protocol text to manufacture proof. */
function compileDiscussionContext(input:GameContextInput, options:GameContextOptions, capture:(proof:PriorityProof)=>void) {
 let proof:PriorityProof|undefined;
 const prior=compileGameContextPass(input,options,undefined,p=>{proof=p;capture(p)});
 if(options.discussionPriority===false||!input.story||input.restart||input.character?.[9]||!proof||proof.referenceGuard)return prior;
 const group=discussionPriorityFacts(proof.facts,input.draft,proof.admission,proof.roles,proof.episodes);
 if(!group)return prior;
 const repeatIds=new Set([...group.repeats].map(storyFactIdentity));
 const protectedPrior=proof.selected.filter(f=>!repeatIds.has(storyFactIdentity(f)));
 const ids=[...new Set([...group.primary,...protectedPrior].map(storyFactIdentity))];
 if(ids.length>8)return prior;
 let selected:StoryFact[]=[];
 let candidateProof:PriorityProof|undefined;
 const candidate=compileGameContextPass(input,options,{ids,covers:proof.admission!.covers},p=>{selected=p.selected;candidateProof=p});
 const accepted=new Set(selected.map(storyFactIdentity));
 // Every old substantive source and every new condition must survive whole.
 // Failure returns original text/selection/report/counters byte-for-byte.
 if(ids.every(id=>accepted.has(id))&&candidate.report.required<=candidate.report.limit&&candidate.report.total<=candidate.report.limit){capture(candidateProof!);return candidate}
 return prior;
}
function compileGameContextPass(input:GameContextInput, options:GameContextOptions, priority?:PriorityReservation, capture?:(proof:PriorityProof)=>void) {
 const retrievalWorld=input.story?.world.id??input.scene?.worldId;
 const retrievalScope=retrievalWorld&&!input.character?.[9]?{worldId:retrievalWorld,entities:input.entities??[]}:undefined;
 const retrieval=retrievalScope?storyRetrievalQuery(input.draft,retrievalScope):undefined;
  const roleSeeds=input.story?.roleSeeds??input.story?.world.sharedGame?.factRoleSeeds;
  const episodeSources=input.story?.episodeSources??input.story?.world.sharedGame?.episodeSources;
   const episodes=episodeSources?createEpisodeReader(roleSeeds,episodeSources):undefined;
   const time=input.story&&(episodes||input.story.facts.some(f=>f.claim?.lifetime||isGameTimeFact(f)))?createStoryTimeReader(input.story.facts,episodes??createEpisodeReader()):undefined;
  const roles=retrievalScope?createStoryRoleReader(retrievalScope,input.draft,roleSeeds||input.story?.world.sharedGame?.managed?storedRoleReader(roleSeeds??[],input.entities??[],retrievalWorld!,input.story?.world.sharedGame?.mergeSeeds,!!input.story?.world.sharedGame?.managed):undefined):undefined;
 const facts=rankStoryFacts(input.story?.facts??[],input.draft,retrievalScope,roles,options.contentRelevance!==false);
 const reference=options.referenceRecall!==false&&input.story&&!input.restart&&retrieval?storyObjectReference(input.draft,retrieval.relevanceNames)??(options.referenceBundle!==false?storyLiteralReference(input.draft,facts.map(f=>f.fact),retrieval.relevanceNames):undefined):undefined;
 const referenceGuard=retrieval?.ambiguousName?AMBIGUOUS_STORY_NAME:(input.story&&retrieval?.unresolvedReference||reference?.kind==='personal')?UNRESOLVED_STORY_REFERENCE:reference?.kind==='deictic'?UNRESOLVED_STORY_OBJECT:reference?.kind==='literal'?AMBIGUOUS_STORY_OBJECT:"";
 const resolveMentions=(text:string)=>retrievalScope?[...storyRetrievalQuery(text,retrievalScope).mentionedIds,...mentionedEntities(text,(input.entities??[]).filter(e=>e.worldId===retrievalWorld&&e.kind!=="character"))]:undefined;
 const memoryMentions=resolveMentions([input.draft,...input.recentMessages.slice(-4)].join("\n"));
 const limit=Math.max(0,Math.floor(input.settings.contextBudget));
 const pooled=compileMemoryWorkspace({...input,draft:retrieval?.query??input.draft,resolvedMentionIds:memoryMentions,candidateOnly:true});
 const selection:ContextSelection={entries:pooled.selection.entries.filter(i=>i.entry.activation==="always"||i.manuallySelected),estimatedTokens:0,omittedCount:0};
 const selectedFacts:StoryFact[]=[],profileParts:ProfilePart[]=[],turns:StoryContinuation["turns"]=[];
 const profileCandidates:ProfilePart[]=[];
 let characterText="",plan:CharacterPromptPlan|undefined;
 const c=input.character;
 const search=normalizeText([input.draft,...input.recentMessages.slice(-2)].join("\n")),tokens=uniqueTokens(search);
 const relevance=(s:string)=>{const text=normalizeText(s);let n=0;for(const t of uniqueTokens(text))if(tokens.has(t))n++;return n};
 if(c) {
  if(c[1] && !c[9]) {
   const rosterMentions=retrievalScope?[...expandFocus(resolveMentions(c[6])??[],input.entities??[],retrievalWorld??null)]:undefined;
   const chosen=selectCharacterContext(c[2],c[3],[...expandFocus(c[5],input.entities??[],input.scene?.worldId??null)],c[6],undefined,true,rosterMentions);
   plan={...chosen,fields:{}};
   for(const person of chosen.active) {
    const sheet=person.characterSheet;if(!sheet)continue;
    const locked=sheet.protectedProfileFields ?? [];
    for(const field of fields) {
     const value=sheet[field];if(!value.trim())continue;
     if(locked.includes(field)) {plan.fields[person.id]??={};plan.fields[person.id]![field]=value;continue}
     // Whole paragraphs only. No clause/sentence chopping that could erase a
     // negation/condition. Missing paragraphs are explicitly partial reference.
     for(const [ordinal,text] of value.split(/\n\s*\n/u).entries())if(text.trim())profileCandidates.push({id:person.id,name:person.name,field,text,ordinal});
    }
   }
  }
  const [world,chat,entities,scene,actions,focus,recent,request,relationships,referenceOnly,selfies]=c;
  characterText=characterInstruction(world,chat,entities,scene,actions,focus,recent,request,relationships,referenceOnly,selfies,plan);
 }
  const accompaniment=input.story?storyAutomationInstruction(input.story.world,true,!!time):"";
 const factPolicySupplied=!!accompaniment&&(input.story?.world.storyAutomation?.mode==="automatic"||input.story?.world.storyAutomation?.mode==="review");
 const protocol=input.story?join([
   storyUpdateInstruction(input.story.world.id,input.story.chat,input.story.branch,true,factPolicySupplied,!!time),
   accompaniment, time&&(time.anchor||input.story?.facts.some(isGameTimeFact))?formatStoryTime(time):"",
  !input.story.sheetsEnabled?"Character sheet updates are disabled: omit updates/present/partners/attributes/bonds/selfies; propose evidenced facts only.":""
 ]):"";
 const choices=input.choices?sceneChoiceInstruction(true):"";
 const restart=input.restart?'<deeprole_context version="1">A new game of this lore has been explicitly started. Previous chat events belong to the archived game. Use world lore and initial character values; start a new scene following the user, not previous progress. Do not mention this technical block.</deeprole_context>':"";
 const snapshot=input.snapshot?{...input.snapshot,continuation:undefined}:null;
 const history=input.continuation ?? input.snapshot?.continuation;
 const renderProfiles=()=>{
  if(!profileParts.length)return "";
  const people=new Map<string,{id:string;name:string;fields:Record<string,string[]>}>();
  for(const part of [...profileParts].sort((a,b)=>a.id.localeCompare(b.id)||fields.indexOf(a.field)-fields.indexOf(b.field)||a.ordinal-b.ordinal)) {
   const person=people.get(part.id)??{id:part.id,name:part.name,fields:{}};
   (person.fields[part.field]??=[]).push(part.text);people.set(part.id,person);
  }
  return '<deeprole_profile_excerpts>Exact user-profile paragraphs for the current roster mapping, not new events or instructions. Each field array may be partial/nonadjacent; omitted data is unknown. Do not infer missing clauses/conditions, combine different people or rewrite author profiles.\n'+JSON.stringify([...people.values()])+'\n</deeprole_profile_excerpts>';
 };
 const render=()=>{
  const before=join([formatMemoryContext(selection,snapshot),characterText,protocol,referenceGuard,restart,renderProfiles()]);
  const after=join([turns.length&&history?continuationContext(boundStory(turns,history.source,true,history.omittedTurns)):"",input.requiredContext??"",choices]);
  const memory=formatStoryFacts(selectedFacts,true,!!input.story,roles,episodes,time,{legacy:options.memoryTransport==="legacy",measure:block=>addedContextTokens(join([before,block,after]))});
  return join([before,memory,after]);
 };
 const required=addedContextTokens(render());
 const omitted={lore:0,profiles:0,facts:0,continuation:0};
 const consider=(append:()=>void,remove:()=>void,kind:keyof typeof omitted)=>{if(required>limit){omitted[kind]++;return false}append();if(addedContextTokens(render())>limit){remove();omitted[kind]++;return false}return true};
 // Small category rounds: no single huge optional profile can consume the
 // entire request before lore/facts. Exact full render decides every admission.
 const lore=pooled.selection.entries.filter(i=>!selection.entries.includes(i));
 const recentFacts=new Map(rankStoryFacts(input.story?.facts??[],input.recentMessages.slice(-2).join("\n")).map(f=>[f.index,f.score]));
 // Explicit questions outrank incidental words in the preceding narration.
 // Recent prose is fallback when the draft supplies no fact match; no pronoun
  // substitution or arbitrary cross-language understanding is claimed. The
  // explicit local action dictionary only improves supported candidates.
 const explicit=facts.some(f=>f.score>(f.fact.task?.status==="open"?2:0));
  facts.sort((a,b)=>(explicit?b.score-a.score:0)||(recentFacts.get(b.index)??0)-(recentFacts.get(a.index)??0)||(episodes?.position(b.fact)??0)-(episodes?.position(a.fact)??0)||b.index-a.index);
 // Reserve room for facts the draft actually asks about before generic profile
 // boilerplate. Their finite JSON/required metadata is never cut to make it fit.
 const attemptedFacts=new Set<StoryFact>();
 const admission=options.topicAdmission!==false&&options.contentRelevance!==false&&input.story&&retrieval&&!referenceGuard&&!roles?.question
  ?storyContentRelevance(facts.map(f=>f.fact),input.draft,retrieval.relevanceNames).admission:undefined;
 let topicOnly=false;
 if(priority){
  const byId=new Map(facts.map(f=>[storyFactIdentity(f.fact),f.fact]));
  // The expanded path measures ONE atomic full bundle: shared exact transport
  // can make the whole bundle fit even when an intermediate prefix costs more.
  // Ordinary eight-row passes retain their historical order/counters exactly.
  const expanded=priority.budgetRows&&priority.ids.length<=BUDGET_SOURCE_ROWS&&priority.ids.every(id=>byId.has(id));
  const whole=priority.budgetRows?!!expanded&&consider(()=>selectedFacts.push(...priority.ids.map(id=>byId.get(id)!)),()=>{selectedFacts.length=0},"facts")
   :priority.ids.length<=8&&priority.ids.every(id=>{const f=byId.get(id);return !!f&&consider(()=>selectedFacts.push(f),()=>{selectedFacts.pop()},"facts")});
  topicOnly=whole&&priority.covers(selectedFacts);
  if(topicOnly){for(const f of facts)attemptedFacts.add(f.fact);omitted.facts=facts.length-selectedFacts.length;}
  else{selectedFacts.length=0;omitted.facts=0;}
 }
 if(admission&&!topicOnly){
  // Tentative reservation, before optional lore/profile rounds. No matched
  // evidence is clipped. If one requested topic cannot fit, roll back counters
  // and run the SAME prior fallback instead of silently dropping that topic.
  for(const f of facts.filter(f=>admission.matches(f.fact))){
   if(selectedFacts.length>=8)omitted.facts++;else consider(()=>selectedFacts.push(f.fact),()=>{selectedFacts.pop()},"facts");
  }
  topicOnly=admission.covers(selectedFacts);
  if(topicOnly){for(const f of facts)attemptedFacts.add(f.fact);omitted.facts+=facts.filter(f=>!admission.matches(f.fact)).length;}
  else{selectedFacts.length=0;omitted.facts=0;}
 }
 const balancedTasks=new Set<StoryFact>(),balancedPersistent=new Set<StoryFact>();
 let balanced=false;
 const continuation=options.continuationBalance!==false&&retrieval&&isPlainStoryContinuation(input.draft,retrieval.relevanceNames);
  const action=options.actionBalance!==false&&retrieval?storyActionBalance(input.draft,retrieval.relevanceNames):undefined;
   const taskGoal=options.taskGoalBalance!==false&&retrieval?storyTaskGoal(input.draft,retrieval.relevanceNames):undefined;
   const compound=options.compoundActionBalance!==false&&retrieval?storyCompoundAction(input.draft,retrieval.relevanceNames):undefined;
     if(!topicOnly&&input.story&&!input.restart&&retrieval&&retrievalScope&&(!referenceGuard||reference&&reference.kind!=='personal'&&!retrieval.ambiguousName)&&!roles?.question&&(continuation||action||taskGoal||compound||options.naturalRecall!==false||options.lastingRecall!==false||reference&&reference.kind!=='personal')){
  const currentScene=c&&c[0]===retrievalWorld?c[3]:input.story.world.sharedGame?.scene;
  const focus=[...(input.scene&&input.scene.worldId===retrievalWorld?input.scene.focusIds:[]),...(c&&c[0]===retrievalWorld?c[5]:[])];
  const ids=new Set([...expandFocus([...focus,...(currentScene?.presentIds??[]),...(currentScene?.partnerIds??(currentScene?.partnerId?[currentScene.partnerId]:[])),...retrieval.mentionedIds,...(input.entities??[]).filter(e=>e.worldId===retrievalWorld&&e.kind==="character"&&e.characterSheet?.protagonist).map(e=>e.id)],input.entities??[],retrievalWorld!)]);
  // Without an explicit scene/focus, unique recent references are context only,
  // not presence/ownership claims. A known empty scene does not use this fallback.
  if(!currentScene&&!focus.length)for(const id of resolveMentions(input.recentMessages.slice(-2).join("\n"))??[])ids.add(id);
  const people=new Set((input.entities??[]).filter(e=>e.worldId===retrievalWorld&&e.kind==="character").map(e=>e.id));
  const available=storyContinuationCandidates(facts.map(f=>f.fact),[...ids].filter(id=>people.has(id)),roles,episodes,time);
   const goalTasks=taskGoal?storyTaskGoalCandidates(available.tasks,taskGoal,episodes):[],goal=goalTasks.length>=2?taskGoal:undefined;
   const matches=goal?goal.matchesObject:action?.kind==='object'?action.matches:undefined;
   const targets=goal?goalTasks:matches?facts.map(f=>f.fact).filter(matches):[];
   const candidates={tasks:goal?goalTasks:matches?available.tasks.filter(matches):available.tasks,persistent:matches?available.persistent.filter(matches):available.persistent};
  // A named "continue" is not an explicit object question. Protect the best
  // recent-context anchor, not a name/framing match in the current draft.
   const anchor=[...facts].sort((a,b)=>(recentFacts.get(b.index)??0)-(recentFacts.get(a.index)??0)||(episodes?.position(b.fact)??0)-(episodes?.position(a.fact)??0)||b.index-a.index)[0]?.fact;
   const reserve=(items:StoryFact[],chosen?:Set<StoryFact>)=>{const existing=items.find(fact=>selectedFacts.includes(fact));if(existing){chosen?.add(existing);return true;}for(const fact of items){if(attemptedFacts.has(fact))continue;attemptedFacts.add(fact);if(consider(()=>selectedFacts.push(fact),()=>{selectedFacts.pop()},"facts")){chosen?.add(fact);return true;}}return false;};
   if(!referenceGuard){
   if(compound&&anchor&&consider(()=>selectedFacts.push(anchor),()=>{selectedFacts.pop()},"facts")){
    attemptedFacts.add(anchor);
    // Every clause needs whole, source-owned evidence. No partial admission:
    // failed coverage rolls back all selected facts AND counters below.
    balanced=compound.every(clause=>{
     const tasks=available.tasks.filter(clause.matchesTask).sort((a,b)=>episodes!.position(a)-episodes!.position(b));
     const persistent=clause.goal?[]:available.persistent.filter(clause.matchesObject);
     const task=reserve(tasks,balancedTasks),detail=reserve(persistent,balancedPersistent);
     return task||detail;
    })&&selectedFacts.length>1;
   }else if((continuation||action||goal)&&anchor&&(!matches||targets.length)&&(candidates.tasks.length||candidates.persistent.length)&&consider(()=>selectedFacts.push(anchor),()=>{selectedFacts.pop()},"facts")){
   attemptedFacts.add(anchor);
   // An object-bearing action must keep a complete direct object match, not
   // substitute a participant's unrelated obligation for the requested object.
   const covered=!matches||reserve(targets);
    if(covered){reserve(candidates.tasks,balancedTasks);if(goal)reserve(candidates.tasks.filter(f=>!balancedTasks.has(f)),balancedTasks);reserve(candidates.persistent,balancedPersistent);}
    balanced=covered&&selectedFacts.length>1&&(!(action||goal)||balancedTasks.size>0||balancedPersistent.size>0);
  }
  // No extra whole lane fit: preserve the previous result/counters exactly.
   if(!balanced){selectedFacts.length=0;omitted.facts=0;attemptedFacts.clear();balancedTasks.clear();balancedPersistent.clear();}
   if(!balanced&&options.naturalRecall!==false){
    const groups=storyNaturalRecall(input.draft,available.tasks,available.persistent,retrieval.relevanceNames,episodes);
    if(groups.length&&anchor&&consider(()=>selectedFacts.push(anchor),()=>{selectedFacts.pop()},"facts")){
     attemptedFacts.add(anchor);
     // Cover every recognized literal object before optional lasting details.
     // There is no action-count ceiling; cap8 and the whole rendered budget
     // remain authoritative. The raw user query is never rewritten/shortened.
     const whole=(items:StoryFact[],chosen:Set<StoryFact>)=>selectedFacts.length<8||items.some(f=>selectedFacts.includes(f))?reserve(items,chosen):false;
     balanced=groups.every(group=>whole(group.tasks,balancedTasks));
     if(balanced)for(const group of groups)whole(group.persistent,balancedPersistent);
    }
    if(!balanced){selectedFacts.length=0;omitted.facts=0;attemptedFacts.clear();balancedTasks.clear();balancedPersistent.clear();}
   }
    if(options.lastingRecall!==false){
     const groups=storyLastingRecall(input.draft,available.persistent,facts.map(f=>f.fact),ids,retrieval.relevanceNames,roles,episodes);
     if(groups.length&&anchor){
      // Supplement an already balanced task selection as well as an empty one.
      // A failed whole-record admission restores every prior counter and set.
      const saved={facts:[...selectedFacts],omitted:omitted.facts,attempted:[...attemptedFacts],tasks:[...balancedTasks],persistent:[...balancedPersistent],balanced};
      const whole=(items:StoryFact[],chosen?:Set<StoryFact>)=>selectedFacts.length<8||items.some(f=>selectedFacts.includes(f))?reserve(items,chosen):false;
      const admitted=(selectedFacts.includes(anchor)||whole([anchor]))&&groups.every(group=>{
       const detail=group.persistent.length?whole(group.persistent,balancedPersistent):true;
       const history=group.closed.length?whole(group.closed):true;
       return detail&&history;
      });
      if(admitted)balanced=true;
      else{selectedFacts.splice(0,selectedFacts.length,...saved.facts);omitted.facts=saved.omitted;attemptedFacts.clear();saved.attempted.forEach(f=>attemptedFacts.add(f));balancedTasks.clear();saved.tasks.forEach(f=>balancedTasks.add(f));balancedPersistent.clear();saved.persistent.forEach(f=>balancedPersistent.add(f));balanced=saved.balanced;}
     }
   }
   }
   if(reference&&reference.kind!=='personal'&&anchor&&!retrieval.ambiguousName&&options.referenceRecall!=="guard"){
    const candidate=storyReferenceCandidates(reference,available.tasks,available.persistent,anchor,input.recentMessages,retrieval.relevanceNames,roles,episodes,options.referenceBundle!==false?facts.map(f=>f.fact):undefined);
    if(candidate){
     if(options.referenceBundle===false)balanced=reserve([anchor])&&reserve(candidate.tasks,balancedTasks)&&(!candidate.persistent.length||reserve(candidate.persistent,balancedPersistent));
     else{
      const whole=(fact:StoryFact,chosen?:Set<StoryFact>)=>selectedFacts.includes(fact)||selectedFacts.length<8?reserve([fact],chosen):false;
      // Same label does not establish object identity. Carry every independently
      // source-owned alternative whole, or restore the guarded fallback exactly.
      balanced=whole(anchor)&&candidate.tasks.every(f=>whole(f,balancedTasks))&&candidate.persistent.every(f=>whole(f,balancedPersistent));
     }
     if(!balanced){selectedFacts.length=0;omitted.facts=0;attemptedFacts.clear();balancedTasks.clear();balancedPersistent.clear();}
   }
    }
 }
 if(!topicOnly&&!balanced&&explicit)for(const f of facts.filter(f=>f.score>(f.fact.task?.status==="open"?2:0))) {
  attemptedFacts.add(f.fact);
  if(selectedFacts.length>=8)omitted.facts++;else consider(()=>selectedFacts.push(f.fact),()=>{selectedFacts.pop()},"facts");
 }
 const remainingFacts=facts.filter(f=>!attemptedFacts.has(f.fact));
 profileCandidates.sort((a,b)=>relevance(b.text)-relevance(a.text)||fields.indexOf(a.field)-fields.indexOf(b.field)||a.ordinal-b.ordinal);
 const max=Math.max(lore.length,remainingFacts.length,profileCandidates.length);
 // The candidate lists have no library-size ceiling; only this request is bounded.
 for(let index=0;index<max;index++) {
  const fact=remainingFacts[index]?.fact;
  if(fact) {if(selectedFacts.length>=8)omitted.facts++;else consider(()=>selectedFacts.push(fact),()=>{selectedFacts.pop()}, "facts")}
  const memory=lore[index];
  if(memory) {
   const selectedIds=new Set(selection.entries.map(i=>i.entry.id));
   const linked=memory.reasons.includes("linked");
   const neighbor=!linked||selection.entries.some(i=>i.entry.links?.some(l=>l.mode==="context"&&l.targetId===memory.entry.id))||memory.entry.links?.some(l=>l.mode==="context"&&selectedIds.has(l.targetId));
   if(neighbor)consider(()=>selection.entries.push(memory),()=>{selection.entries.pop()},"lore");else omitted.lore++;
  }
  const profile=profileCandidates[index];
  if(profile)consider(()=>profileParts.push(profile),()=>{profileParts.pop()},"profiles");
 }
 if(history && !input.restart)for(const turn of history.turns.slice(-2).reverse())consider(()=>turns.unshift(turn),()=>{turns.shift()},"continuation");
 const text=render(),memoryText=formatMemoryContext(selection,snapshot);
 const report:GameContextReport={limit,total:addedContextTokens(text),required,selected:{lore:selection.entries.length,profiles:profileParts.length+(plan?Object.values(plan.fields).reduce((n,f)=>n+Object.keys(f).length,0):0),facts:selectedFacts.length,continuation:turns.length},omitted};
 selection.estimatedTokens=report.total;selection.omittedCount=omitted.lore;selection.overBudgetTokens=Math.max(0,report.total-limit);selection.contextReport=report;
 const explanation:NonNullable<GameContextReport["explanation"]>={draftFacts:0,recentFacts:0,openTasks:0,recentFallback:0};
 for(const fact of selectedFacts){const ranked=facts.find(item=>item.fact===fact);const bonus=fact.task?.status==="open"?2:0;
  if(balancedTasks.has(fact))explanation.openTasks++;else if(balancedPersistent.has(fact))explanation.persistentFacts=(explanation.persistentFacts??0)+1;else if(ranked&&ranked.score>bonus)explanation.draftFacts++;else if(ranked&&(recentFacts.get(ranked.index)??0)>bonus)explanation.recentFacts++;else if(bonus)explanation.openTasks++;else explanation.recentFallback++;
 }
 report.explanation=explanation;
 capture?.({facts:facts.map(f=>f.fact),selected:[...selectedFacts],roles,episodes,referenceGuard,admission,action,names:retrieval?.relevanceNames??[]});
 return {text,memoryText,selection,documents:pooled.documents,report};
}
