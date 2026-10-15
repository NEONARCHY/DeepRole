import {expect,it} from "vitest";
import {compileGameContext,addedContextTokens,type GameContextInput} from "../src/core/game-context";
import {characterInstruction,DEFAULT_ACTIONS} from "../src/core/characters";
import {storyWorld} from "./fixtures/story-worlds";
function fixture(limit=2000,count=3) {
 const f=storyWorld("en",count);f.world.storyAutomation={mode:"automatic",revision:"policy"};
 const input:GameContextInput={draft:"Where is the clock key?",recentMessages:[],entries:[f.entry],books:[],entities:f.entities,worlds:[f.world],scene:{worldId:f.world.id,bookId:null,focusIds:[]},activeBookId:null,settings:{contextBudget:limit,relevanceThreshold:6},character:[f.world.id,f.binding.chatId,f.entities,f.binding.characterScenes![f.world.id],DEFAULT_ACTIONS,[],"Where is the clock key?","request-abc",true,false,false],story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",sheetsEnabled:true,facts:[{text:"The clock key is in the blue box.",quote:"The clock key is in the blue box.",kind:"event"}]},choices:true};
 return {...f,input};
}
it("a prepared recap replaces automatic transcript fallback without changing structured memory",()=>{
 const f=fixture(6000);f.input.continuation={version:1,source:"history",partial:false,omittedTurns:0,turns:[{role:"assistant",text:"OBSOLETE TRANSCRIPT TAIL"}]};
 f.input.snapshot={id:"recap",title:"Final moment",summary:"The artisan waits for the answer.",sourceChatId:"old",sourceChatUrl:"https://chat.deepseek.com/chat/s/old",worldId:f.world.id,bookId:null,createdAt:1};
 const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(r.text).toContain(f.input.snapshot.summary);expect(r.text).not.toContain("OBSOLETE TRANSCRIPT TAIL");expect(r.text).toContain(f.input.story!.facts[0]!.text);expect(f.input).toEqual(before);
 f.input.snapshot.continuation={...f.input.continuation,turns:[{role:"assistant",text:"EXPLICIT LEGACY HANDOFF"}]};
 const legacy=compileGameContext(f.input);expect(legacy.text).toContain("EXPLICIT LEGACY HANDOFF");expect(legacy.text).not.toContain("OBSOLETE TRANSCRIPT TAIL");
});
it("counts a recovered reply as whole required context, without an unmetered suffix",()=>{
 const f=fixture(500);f.input.requiredContext="Recovered established scene, including its conditions. ".repeat(90);
 const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(r.text).toContain(f.input.requiredContext);expect(r.report.required).toBeGreaterThan(500);
 expect(r.report.total).toBe(addedContextTokens(r.text));expect(r.report.selected.facts).toBe(0);
 expect(f.input).toEqual(before);
});
it("counts the exact complete prompt and preserves useful memory within the default budget",()=>{
 const f=fixture(),r=compileGameContext(f.input);
 expect(r.selection.estimatedTokens).toBe(addedContextTokens(r.text));
 expect(r.report.total,JSON.stringify(r.report)).toBeLessThanOrEqual(2000);
 expect(r.text).toContain("The clock key is in the blue box.");
 expect(r.text).toContain("<deeprole_choices>");
 expect(r.text).toContain("Memory accompaniment mode is automatic");
 expect(r.text).not.toContain("Resident 3");
 expect(r.text.length).toBeLessThan(characterInstruction(...f.input.character!).length+2000);
});
it("never silently clips required always/manual data, protected fields or scene membership",()=>{
 const f=fixture(500,10),scene=f.binding.characterScenes![f.world.id]!;scene.presentIds=f.entities.map(p=>p.id);
 f.entities[8]!.characterSheet!.protectedProfileFields=["background"];f.entities[8]!.characterSheet!.background="AUTHOR RULE: do not rewrite this. ".repeat(100);
 f.entry.activation="always";f.entry.content="Immutable full rule. ".repeat(150);
 const r=compileGameContext(f.input);expect(r.text).toContain(f.entry.content);expect(r.text).toContain(f.entities[8]!.characterSheet!.background);
 expect(r.report.required).toBeGreaterThan(500);expect(r.selection.overBudgetTokens).toBe(r.report.total-500);expect(r.report.selected.facts).toBe(0);
 for(const p of f.entities)expect(r.text).toContain(p.name);
});
it("selects paragraphs without deleting or rewriting stored profiles, and does not cap a scene at six profiles",()=>{
 const f=fixture(8000,10),scene=f.binding.characterScenes![f.world.id]!;scene.presentIds=f.entities.map(p=>p.id);
 for(const [i,p] of f.entities.entries())p.characterSheet!.background="Unique profile "+i+".\n\n"+"Unrelated long history. ".repeat(200);
 const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(f.input).toEqual(before);for(let i=0;i<10;i++)expect(r.text).toContain("Unique profile "+i+".");
 expect(r.report.total).toBeLessThanOrEqual(8000);expect(r.report.omitted.profiles).toBeGreaterThan(0);expect(r.text).toContain("partial/nonadjacent");
});
it("small fact budget includes the wrapper and does not return truncated JSON",()=>{
 const f=fixture(1900);f.input.story!.facts=Array.from({length:100},(_,i)=>({text:"Marker"+i+" is here.",quote:"Marker"+i+" is here.",kind:"event"}));
 const r=compileGameContext(f.input);expect(r.report.total<=1900||r.report.required>1900).toBe(true);
 const match=r.text.match(/<deeprole_story_memory>[^\n]+\n([^]+?)\n<\/deeprole_story_memory>/u);
 if(match)expect(()=>JSON.parse(match[1]!)).not.toThrow();
});
it("scope/exclusion/manual rules survive candidate selection",()=>{
 const f=fixture(5000),other={...f.entry,id:"other",worldId:"foreign",activation:"always" as const,content:"FOREIGN WORLD SECRET"},off={...f.entry,id:"off",enabled:false,content:"DISABLED SECRET"};
 f.input.entries.push(other,off);f.input.excludedIds=[f.entry.id];f.input.manualIds=[other.id,off.id];const r=compileGameContext(f.input);
 expect(r.text).not.toContain("FOREIGN WORLD SECRET");expect(r.text).not.toContain("DISABLED SECRET");expect(r.selection.entries).toEqual([]);
});
it("a thousand unrelated characters do not grow the request roster; exact alias mention does",()=>{
 const f=fixture(4000,1000);f.entities[990]!.name="Archive keeper";f.entities[990]!.aliases=["Keeper"];
 const base=compileGameContext(f.input);expect(base.text).not.toContain("Resident 999");expect(base.text).not.toContain("Archive keeper");
 f.input.draft="I ask Keeper about the clock key.";f.input.character![6]=f.input.draft;const next=compileGameContext(f.input);
 expect(next.text).toContain("Archive keeper");expect(next.text).toContain("Keeper");expect(next.report.total).toBeLessThanOrEqual(4000);
});
it("linked neighbors cannot bypass an omitted parent or the request budget",()=>{
 const f=fixture(2500);f.entry.content="Oversized key document. ".repeat(3000);f.entry.links=[{targetId:"neighbor",label:"clue",mode:"context"}];
 f.input.entries.push({...f.entry,id:"neighbor",title:"No match",content:"ORPHAN LINK SECRET",keywords:[],entityIds:[],links:[],priority:"low"});
 const r=compileGameContext(f.input);expect(r.selection.entries.map(e=>e.entry.id)).not.toContain("clock-key");expect(r.text).not.toContain("ORPHAN LINK SECRET");
});
it("explicit state/task metadata remains intact, and unresolved/unselected memory is not synthesized",()=>{
 const f=fixture(4000);f.input.story!.facts=[{text:"Mira promised to repair the clock.",quote:"Mira promised to repair the clock.",kind:"promise",task:{key:"mira.clock",title:"repair the clock",status:"open"}},{text:"The clock key is red.",quote:"The clock key is red.",kind:"event",claim:{key:"clock.key",value:"red",scope:"state"}},{text:"The clock key is blue.",quote:"The clock key is blue.",kind:"event",claim:{key:"clock.key",value:"blue",scope:"state",transition:"progress"}}];
 const r=compileGameContext(f.input),memory=r.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!;
 expect(memory).toContain('"status":"open"');expect(memory).toContain('"key":"mira.clock"');expect(memory).not.toContain("The clock key is red.");expect(memory).toContain("The clock key is blue.");
});
it("reference-only service keeps full profiles and never requests game-memory writes",()=>{
 const f=fixture(6000);f.input.character![9]=true;f.input.story=undefined;f.input.choices=false;f.entities[0]!.characterSheet!.background="FULL SERVICE BIOGRAPHY";
 const r=compileGameContext(f.input);expect(r.text).toContain("FULL SERVICE BIOGRAPHY");expect(r.text).toContain("Read-only character reference");expect(r.text).not.toContain("Memory accompaniment mode");expect(r.text).not.toContain("<deeprole_choice_mode");
});
it("included whole continuation turns share the same budget; originals stay intact",()=>{
 const f=fixture(3000);f.input.continuation={version:1,source:"history",partial:false,omittedTurns:0,turns:[{role:"user",text:"Oversized past speech. ".repeat(2000)},{role:"assistant",text:"The artisan waits at the door."}]};
 const before=structuredClone(f.input.continuation),r=compileGameContext(f.input);expect(r.report.total).toBeLessThanOrEqual(3000);expect(r.text).toContain("The artisan waits at the door.");expect(r.text).not.toContain("Oversized past speech.");expect(f.input.continuation).toEqual(before);expect(r.report.omitted.continuation).toBe(1);
});
it("whole-paragraph admission never cuts a negation or condition into a made-up fact",()=>{
 const f=fixture(2100);f.entities[0]!.characterSheet!.background="The hero must not enter the forbidden tower unless "+ "the keeper agrees and the clock strikes twice, ".repeat(100);
 const r=compileGameContext(f.input);expect(r.text).not.toContain("unless the keeper");expect(r.report.omitted.profiles).toBeGreaterThan(0);expect(r.text).not.toContain("The hero must enter");
});
it("a direct question about an old fact outranks the newest scene",()=>{
 const f=fixture(2000);f.input.story!.facts=Array.from({length:12},(_,i)=>({text:"Room"+(i+1)+" contains token"+(i+1)+".",quote:"Room"+(i+1)+" contains token"+(i+1)+".",kind:"event"}));f.input.draft="Where is token1?";f.input.recentMessages=["Room12 contains token12."];
 const r=compileGameContext(f.input);expect(r.text).toContain("Room1 contains token1.");expect(r.report.total).toBeLessThanOrEqual(2000);
});
it("a vague continuation can use recent words without asserting a guessed pronoun identity",()=>{
 const f=fixture(2200);f.input.story!.facts=[{text:"Room1 contains token1.",quote:"Room1 contains token1.",kind:"event"},{text:"Room12 contains token12.",quote:"Room12 contains token12.",kind:"event"}];f.input.draft="Continue.";f.input.recentMessages=["Room12 contains token12."];const r=compileGameContext(f.input);
 expect(r.text).toContain("Room12 contains token12.");expect(r.text).not.toContain("she means Resident");
});
it("two explicitly queried facts take priority over generic profile paragraphs",()=>{
 const f=fixture(2000);f.input.draft="Which key opens the cellar and is the gate repaired?";f.input.story!.facts=[{text:"The blue key opens the cellar.",quote:"The blue key opens the cellar.",kind:"event"},{text:"Mira repaired the gate.",quote:"Mira repaired the gate.",kind:"event",task:{key:"mira.gate",title:"repair the gate",status:"completed"}}];
 const r=compileGameContext(f.input);expect(r.text).toContain("The blue key opens the cellar.");expect(r.text).toContain('"status":"completed"');expect(r.report.total).toBeLessThanOrEqual(2000);
});
it("unresolved personal requests preserve separate candidates and count the guard in the whole budget",()=>{
 const f=fixture(4000);f.input.draft="What about her promise?";
 f.input.story!.facts=[{text:"Mira agreed to repair the gate.",quote:"Mira agreed to repair the gate.",kind:"promise"},{text:"Nora agreed to return the book.",quote:"Nora agreed to return the book.",kind:"promise"}];
 const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(r.text).toContain("Personal reference in the current request is NOT resolved");
 expect(r.text).toContain("Mira agreed");expect(r.text).toContain("Nora agreed");
 expect(r.report.total).toBe(addedContextTokens(r.text));expect(r.report.total).toBeLessThanOrEqual(4000);
 expect(f.input).toEqual(before);
});
it.each([ ["Anna Lee","What about Anna's promise?"], ["Анна Ли","Что с обещанием Анны?"] ])("a unique short name retrieves the off-scene profile and canonical fact: %s",(name,draft)=>{
 const f=fixture(4000);f.entities[2]!.name=name;f.entities[2]!.aliases=[];f.entities[2]!.characterSheet!.background="UNIQUE SHORT-NAME PROFILE";
 f.input.draft=draft;f.input.character![6]=draft;f.input.story!.facts=[{text:name+" agreed to repair the gate.",quote:name+" agreed to repair the gate.",kind:"promise"}];
 const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(r.text).toContain("UNIQUE SHORT-NAME PROFILE");expect(r.text).toContain(name+" agreed");expect(r.report.total).toBeLessThanOrEqual(4000);expect(f.input).toEqual(before);
});
it.each([ ["Ann","Ann Lee","Ann Lee's promise"], ["Анна","Анна Ли","Обещание Анна Ли"] ])("full-name requests omit a different off-scene short-name profile and description: %s",(short,full,draft)=>{
 const f=fixture(5000,4);f.entities[2]!.name=short;f.entities[3]!.name=full;
 for(const [at,label] of [[2,"WRONG PERSON"],[3,"RIGHT PERSON"]] as const){const e=f.entities[at]!;e.characterSheet!.background=label+" PROFILE";e.description=label+" DESCRIPTION";e.useDescriptionInContext=true;}
 f.input.draft=draft;f.input.character![6]=draft;const before=structuredClone(f.input),r=compileGameContext(f.input);
 expect(r.text).toContain("RIGHT PERSON PROFILE");expect(r.text).toContain("RIGHT PERSON DESCRIPTION");expect(r.text).not.toContain("WRONG PERSON");expect(f.input).toEqual(before);
 f.binding.characterScenes![f.world.id]!.presentIds.push(f.entities[2]!.id);
 expect(compileGameContext(f.input).text).toContain("WRONG PERSON PROFILE");
});
it("shared short names are guarded without selecting either off-scene profile",()=>{
 const f=fixture(4000,4);f.entities[2]!.name="Anna Lee";f.entities[3]!.name="Anna Smith";
 f.entities[2]!.characterSheet!.background="OFFSCENE LEE PROFILE";f.entities[3]!.characterSheet!.background="OFFSCENE SMITH PROFILE";
 f.input.draft="Anna's promise";f.input.character![6]=f.input.draft;const r=compileGameContext(f.input);
 expect(r.text).toContain("multiple possible owners");expect(r.text).not.toContain("OFFSCENE LEE PROFILE");expect(r.text).not.toContain("OFFSCENE SMITH PROFILE");expect(r.report.total).toBeLessThanOrEqual(4000);
});
it("named groups retain their descriptions and member context",()=>{
 const f=fixture(4000,4);f.entities[3]!.characterSheet!.background="GROUP MEMBER PROFILE";
 f.entities.push({id:"crew",worldId:f.world.id,kind:"group",name:"Clock crew",aliases:[],description:"GROUP DESCRIPTION",useDescriptionInContext:true,memberIds:[f.entities[3]!.id],createdAt:1,updatedAt:1});
 f.input.draft="I ask the Clock crew.";f.input.character![6]=f.input.draft;const r=compileGameContext(f.input);
 expect(r.text).toContain("GROUP DESCRIPTION");expect(r.text).toContain("GROUP MEMBER PROFILE");
});
