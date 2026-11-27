import {expect,it} from "vitest";
import {storyUpdateInstruction} from "../src/core/story-update";
import {storyAutomationInstruction} from "../src/core/story-automation";
import {compileGameContext,type GameContextInput} from "../src/core/game-context";
import {estimateTokens} from "../src/core/text";
import {formatStoryFacts} from "../src/core/story-fact-context";
import {storyWorld} from "./fixtures/story-worlds";
import languageSwitch from "./fixtures/story-language-switch.json";
for(const mode of ["automatic","review"] as const)it(`defers only duplicate evidence rules to the included ${mode} policy`,()=>{
 const f=storyWorld();f.world.storyAutomation={mode,revision:"p"};
 const input:GameContextInput={draft:"Continue.",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:3000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[],sheetsEnabled:false}};
 const before=structuredClone(input),out=compileGameContext(input).text;
 const base=storyUpdateInstruction(f.world.id,f.binding.chatId,"branch-a",true),short=storyUpdateInstruction(f.world.id,f.binding.chatId,"branch-a",true,true),policy=storyAutomationInstruction(f.world,true);
 expect(estimateTokens(short+policy)).toBeLessThan(estimateTokens(base+policy));expect(out).toContain(short);expect(out).toContain(policy);
 expect(out).not.toContain("Optional facts: max8 {text,kind,quote}");
 expect(out).toContain(JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch:"branch-a"}));
 expect(out).toMatch(/Then JSON: copy new evidence verbatim from that reply; skip recalls\.$/u);
 for(const rule of ["event=happened","promise=commitment","plan=intention","belief=attributed belief","secret=revelation","task=obligation","never clear known goals","Existing numeric/selfie schemas and safety gates remain","Never turn plans/wishes/hypotheticals/negations/OOC/choices into events","No age/identity guesses","No transition on differing state requires review","Never output replaces","Filled/protected/manual fields and author lore must never be replaced","exact quote from this reply, keep speaker/negation/conditions; no ellipses, player text, JSON or choices"] )expect(out).toContain(rule);
 expect(input).toEqual(before);
});
for(const mode of [undefined,"off"] as const)it(`retains complete default evidence rules when policy is ${mode??"absent"}`,()=>{
 const f=storyWorld();if(mode)f.world.storyAutomation={mode,revision:"p"};
 const input:GameContextInput={draft:"Continue.",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:3000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[],sheetsEnabled:false}};
 expect(compileGameContext(input).text).toContain("Optional facts: max8 {text,kind,quote}");expect(compileGameContext(input).text).not.toContain("follow the accompanying policy below");
 expect(compileGameContext(input).text).not.toContain("copy new evidence verbatim from that reply");
});
it("leaves standalone and full legacy instructions unchanged unless compact policy is explicitly supplied",()=>{
 expect(storyUpdateInstruction("w","c","b",true)).toContain("copy one verbatim span from THIS reply");
 expect(storyUpdateInstruction("w","c","b",false,true)).toBe(storyUpdateInstruction("w","c","b"));
});
it("gives the exact-copy rule in Russian for leading language switches only",()=>{
 const f=storyWorld();f.world.storyAutomation={mode:"automatic",revision:"p"};
 const input:GameContextInput={draft:"",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:2000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[],sheetsEnabled:false}};
 for(const scene of languageSwitch.cases){
  const result=compileGameContext({...input,draft:scene.draft,recentMessages:[scene.oldDraft,scene.old]});
  expect(result.text).toMatch(/kind "event", risk "ordinary", sentence — номер предложения ответа с 1, без text и quote\. Слухи и прошлое пропусти\.$/u);
  expect(result.report.total).toBeLessThanOrEqual(2000);
 }
 const result=compileGameContext({...input,draft:"Continue in English. The note reads «Пиши на русском»."});
 expect(result.text).toMatch(/Then JSON: copy new evidence verbatim from that reply; skip recalls\.$/u);
});
it("uses this request's kind definitions without dropping status, attribution or evidence",()=>{
 const f=storyWorld();f.world.storyAutomation={mode:"automatic",revision:"p"};const fact={text:"Nora agreed to help.",quote:"Nora told Mira: Nora agreed to help if the road opens.",kind:"promise" as const,task:{key:"nora.help",title:"Nora agreed to help",status:"open" as const}};
 const input:GameContextInput={draft:"Nora help",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:4000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"branch-a",facts:[fact],sheetsEnabled:false}};
 const out=compileGameContext(input).text,standalone=formatStoryFacts([fact],true),shared=formatStoryFacts([fact],true,true);
 expect(out).toContain(shared);expect(out).toContain("NOT fulfillment");expect(out).toContain("NOT completion");expect(out).toContain("NOT objective truth");expect(shared).toContain("task.status open=NOT fulfilled");expect(shared).toContain('"sourceQuote":'+JSON.stringify(fact.quote));expect(shared).toContain("Distinguish who promised");expect(estimateTokens(shared)).toBeLessThan(estimateTokens(standalone));expect(standalone).toContain("kind: event=happened");
 expect(formatStoryFacts([fact],false,true)).toBe(formatStoryFacts([fact]));
});
