import {expect,it} from "vitest";
import {storyUpdateInstruction} from "../src/core/story-update";
import {storyAutomationInstruction} from "../src/core/story-automation";
import {compileGameContext,type GameContextInput} from "../src/core/game-context";
import {estimateTokens} from "../src/core/text";
import {formatStoryFacts} from "../src/core/story-fact-context";
import {storyWorld} from "./fixtures/story-worlds";
for(const mode of ["automatic","review"] as const)it(`defers only duplicate evidence rules to the included ${mode} policy`,()=>{
 const f=storyWorld();f.world.storyAutomation={mode,revision:"p"};
 const input:GameContextInput={draft:"Continue.",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:3000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[],sheetsEnabled:false}};
 const before=structuredClone(input),out=compileGameContext(input).text;
 const base=storyUpdateInstruction(f.world.id,f.binding.chatId,"branch-a",true),short=storyUpdateInstruction(f.world.id,f.binding.chatId,"branch-a",true,true),policy=storyAutomationInstruction(f.world,true);
 expect(estimateTokens(short+policy)).toBeLessThan(estimateTokens(base+policy));expect(out).toContain(short);expect(out).toContain(policy);
 expect(out).not.toContain("Optional facts: max8 {text,kind,quote}");
 for(const rule of ["world:","chat:","branch:","version:2","event=happened","promise=commitment","plan=intention","belief=attributed belief","secret=revelation","task=obligation","never clear known goals","Existing numeric/selfie schemas and safety gates remain","Never turn plans/wishes/hypotheticals/negations/OOC/choices into events","No age/identity guesses","No transition on differing state requires review","Never output replaces","Filled/protected/manual fields and author lore must never be replaced","exact continuous played prose, never JSON/options"] )expect(out).toContain(rule);
 expect(input).toEqual(before);
});
for(const mode of [undefined,"off"] as const)it(`retains complete default evidence rules when policy is ${mode??"absent"}`,()=>{
 const f=storyWorld();if(mode)f.world.storyAutomation={mode,revision:"p"};
 const input:GameContextInput={draft:"Continue.",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:3000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[],sheetsEnabled:false}};
 expect(compileGameContext(input).text).toContain("Optional facts: max8 {text,kind,quote}");expect(compileGameContext(input).text).not.toContain("follow the accompanying policy below");
});
it("leaves standalone and full legacy instructions unchanged unless compact policy is explicitly supplied",()=>{
 expect(storyUpdateInstruction("w","c","b",true)).toContain("exact continuous quote from THIS played prose");
 expect(storyUpdateInstruction("w","c","b",false,true)).toBe(storyUpdateInstruction("w","c","b"));
});
it("uses this request's kind definitions without dropping status, attribution or evidence",()=>{
 const f=storyWorld();f.world.storyAutomation={mode:"automatic",revision:"p"};const fact={text:"Nora agreed to help.",quote:"Nora told Mira: Nora agreed to help if the road opens.",kind:"promise" as const,task:{key:"nora.help",title:"Nora agreed to help",status:"open" as const}};
 const input:GameContextInput={draft:"Nora help",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:4000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[fact],sheetsEnabled:false}};
 const out=compileGameContext(input).text,standalone=formatStoryFacts([fact],true),shared=formatStoryFacts([fact],true,true);
 expect(out).toContain(shared);expect(out).toContain("NOT fulfillment");expect(out).toContain("NOT completion");expect(out).toContain("NOT objective truth");expect(shared).toContain("task.status open=NOT fulfilled");expect(shared).toContain('"sourceQuote":'+JSON.stringify(fact.quote));expect(shared).toContain("Distinguish who promised");expect(estimateTokens(shared)).toBeLessThan(estimateTokens(standalone));expect(standalone).toContain("kind: event=happened");
 expect(formatStoryFacts([fact],false,true)).toBe(formatStoryFacts([fact]));
});
