import {expect,it} from "vitest";
import {storyRetrievalQuery} from "../src/core/story-retrieval-query";
import {rankStoryFacts} from "../src/core/story-fact-context";
import {compileGameContext,type GameContextInput} from "../src/core/game-context";
import {storyWorld} from "./fixtures/story-worlds";
import type {StoryFact} from "../src/core/story-update";

for(const locale of ["ru","en"] as const)for(const status of ["completed","cancelled"] as const)it(`retrieves an old ${status} task by an established name in its title: ${locale}`,()=>{
 const f=storyWorld(locale);f.entities[0]!.name=locale==="ru"?"Мира Вейл":"Mira Vale";f.entities[0]!.aliases=["Keeper"];f.entities[1]!.name=locale==="ru"?"Нора Вейл":"Nora Vale";
 const title=locale==="ru"?"Мира Вейл: починить западные ворота":"Mira Vale: repair the western gate";
 const open:StoryFact={kind:"promise",text:locale==="ru"?"Мира Вейл обещала починить ворота.":"Mira Vale promised to repair the gate.",quote:title+". "+(locale==="ru"?"Мира Вейл обещала починить ворота.":"Mira Vale promised to repair the gate."),task:{key:"gate-west",title,status:"open"}};
 const terminal:StoryFact={kind:"event",text:status==="completed"?"The repair was finished.":"The repair was cancelled.",quote:"source terminal",task:{key:"gate-west",title,status}};
 const noise:StoryFact[]=Array.from({length:2000},(_,i)=>({kind:"promise",text:`${f.entities[1]!.name} promised another delivery ${i}.`,quote:`source ${i}`,task:{key:`delivery-${i}`,title:`Delivery ${i}`,status:"open"}}));
 const facts=[open,terminal,...noise],scope={worldId:f.world.id,entities:f.entities},query=locale==="ru"?"Что с обещанием Миры?":"What about Keeper's promise?",before=structuredClone(facts);
 expect(storyRetrievalQuery(query,scope).score(terminal)).toBe(20);
 const ranked=rankStoryFacts(facts,query,scope);expect(ranked[0]!.fact).toEqual(terminal);expect(ranked.some(r=>r.fact.task?.key==="gate-west"&&r.fact.task.status==="open")).toBe(false);
 const input:GameContextInput={draft:query,recentMessages:[noise.at(-1)!.text],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:3000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch",facts,sheetsEnabled:false}};
 const result=compileGameContext(input);expect(result.text).toContain(JSON.stringify(terminal.task));expect(result.text).not.toContain(open.text);expect(result.report.total).toBeLessThanOrEqual(3000);expect(result.report.selected.facts).toBeLessThanOrEqual(8);expect(facts).toEqual(before);
});
it("keeps nested and ambiguous task-title names distinct, and ignores machine keys and source quotes",()=>{
 const f=storyWorld();f.entities[0]!.name="Ann";f.entities[0]!.aliases=["Short"];f.entities[1]!.name="Ann Lee";f.entities[1]!.aliases=[];
 const scope={worldId:f.world.id,entities:f.entities},query=storyRetrievalQuery("Short's promise",scope);
 const task=(title:string):StoryFact=>({kind:"event",text:"Finished.",quote:"Ann repaired it.",task:{key:"Ann",title,status:"completed"}});
 expect(query.score(task("Ann Lee's repair"))).toBe(4);expect(query.score(task("Ann's repair"))).toBe(20);expect(query.score(task("Unknown repair"))).toBe(4);
 const ambiguous=storyRetrievalQuery("Ann's promise",scope);expect(ambiguous.ambiguousName).toBe(true);expect(ambiguous.score(task("Ann's repair"))).toBe(4);
});
it("never creates a name across field boundaries and recalculates title/name edits",()=>{
 const f=storyWorld();f.entities[0]!.name="The Keeper";f.entities[0]!.aliases=["Oracle"];f.entities[1]!.name="Nora";
 const scope={worldId:f.world.id,entities:f.entities},record:StoryFact={kind:"event",text:"The",quote:"The Keeper finished.",task:{key:"The Keeper",title:"Keeper finished",status:"completed"}};
 expect(storyRetrievalQuery("Oracle's promise",scope).score(record)).toBe(4);
 record.task!.title="The Keeper: gate";expect(storyRetrievalQuery("Oracle's promise",scope).score(record)).toBe(20);
 record.task!.title="Nora: gate";expect(storyRetrievalQuery("Oracle's promise",scope).score(record)).toBe(4);
 f.entities[0]!.aliases=[];expect(storyRetrievalQuery("Oracle's promise",scope).score({...record,task:{...record.task!,title:"The Keeper: gate"}})).toBe(4);
});
