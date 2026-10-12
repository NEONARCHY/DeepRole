import { characterInstruction,type CharacterPromptPlan } from "./characters";
import { selectCharacterContext } from "./character-context";
import { compileMemoryWorkspace } from "./memory-workspace";
import { formatMemoryContext } from "./context";
import { rankStoryFacts,formatStoryFacts } from "./story-fact-context";
import { storyUpdateInstruction } from "./story-update";
import type { StoryFact } from "./story-update";
import { storyAutomationInstruction } from "./story-automation";
import { sceneChoiceInstruction } from "./scene-choices";
import { continuationContext,boundStory } from "./story-continuation";
import { estimateTokens,normalizeText,uniqueTokens } from "./text";
import { expandFocus } from "./scene";
import type { RankMemoryInput } from "./memory-engine";
import type { ContextSelection,WorldProfile,HandoffSnapshot,StoryContinuation } from "./types";

export interface GameContextReport {
 limit:number;total:number;required:number;
 selected:{lore:number;profiles:number;facts:number;continuation:number};
 omitted:{lore:number;profiles:number;facts:number;continuation:number};
}
export interface GameContextInput extends RankMemoryInput {
 worlds:WorldProfile[];
 character?:Parameters<typeof characterInstruction>;
 story?:{world:WorldProfile;chat:string;branch:string;facts:StoryFact[];sheetsEnabled:boolean};
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
export function compileGameContext(input:GameContextInput) {
 const limit=Math.max(0,Math.floor(input.settings.contextBudget));
 const pooled=compileMemoryWorkspace({...input,candidateOnly:true});
 const selection:ContextSelection={entries:pooled.selection.entries.filter(i=>i.entry.activation==="always"||i.manuallySelected),estimatedTokens:0,omittedCount:0};
 const selectedFacts:StoryFact[]=[],profileParts:ProfilePart[]=[],turns:StoryContinuation["turns"]=[];
 const profileCandidates:ProfilePart[]=[];
 let characterText="",plan:CharacterPromptPlan|undefined;
 const c=input.character;
 const search=normalizeText([input.draft,...input.recentMessages.slice(-2)].join("\n")),tokens=uniqueTokens(search);
 const relevance=(s:string)=>{const text=normalizeText(s);let n=0;for(const t of uniqueTokens(text))if(tokens.has(t))n++;return n};
 if(c) {
  if(c[1] && !c[9]) {
   const chosen=selectCharacterContext(c[2],c[3],[...expandFocus(c[5],input.entities??[],input.scene?.worldId??null)],c[6],undefined,true);
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
 const protocol=input.story?join([
  storyUpdateInstruction(input.story.world.id,input.story.chat,input.story.branch,true),
  storyAutomationInstruction(input.story.world,true),
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
 const render=()=>join([
  formatMemoryContext(selection,snapshot),characterText,protocol,restart,renderProfiles(),formatStoryFacts(selectedFacts,true),
  turns.length&&history?continuationContext(boundStory(turns,history.source,true,history.omittedTurns)):"",input.requiredContext??"",choices
 ]);
 const required=addedContextTokens(render());
 const omitted={lore:0,profiles:0,facts:0,continuation:0};
 const consider=(append:()=>void,remove:()=>void,kind:keyof typeof omitted)=>{if(required>limit){omitted[kind]++;return false}append();if(addedContextTokens(render())>limit){remove();omitted[kind]++;return false}return true};
 // Small category rounds: no single huge optional profile can consume the
 // entire request before lore/facts. Exact full render decides every admission.
 const lore=pooled.selection.entries.filter(i=>!selection.entries.includes(i));
 const facts=rankStoryFacts(input.story?.facts??[],input.draft);
 const recentFacts=new Map(rankStoryFacts(input.story?.facts??[],input.recentMessages.slice(-2).join("\n")).map(f=>[f.index,f.score]));
 // Explicit questions outrank incidental words in the preceding narration.
 // Recent prose is fallback when the draft supplies no fact match; no pronoun
 // substitution or cross-language semantic understanding is claimed.
 const explicit=facts.some(f=>f.score>(f.fact.task?.status==="open"?2:0));
 facts.sort((a,b)=>(explicit?b.score-a.score:0)||(recentFacts.get(b.index)??0)-(recentFacts.get(a.index)??0)||b.index-a.index);
 // Reserve room for facts the draft actually asks about before generic profile
 // boilerplate. Their finite JSON/required metadata is never cut to make it fit.
 const attemptedFacts=new Set<StoryFact>();
 if(explicit)for(const f of facts.filter(f=>f.score>(f.fact.task?.status==="open"?2:0))) {
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
 return {text,memoryText,selection,documents:pooled.documents,report};
}
