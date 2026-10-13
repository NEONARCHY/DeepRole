import {expect,it} from "vitest";
import {storyFactPayload,formatStoryFacts,STORY_QUOTE_REFERENCE} from "../src/core/story-fact-context";
import {estimateTokens} from "../src/core/text";
import type {StoryFact} from "../src/core/story-update";
import {compileGameContext,addedContextTokens,type GameContextInput} from "../src/core/game-context";
import {storyWorld} from "./fixtures/story-worlds";
const facts=(quote:string):StoryFact[]=>["Nora agreed to help Mira.","Mira agreed to bring the tools.","They must wait until the road opens."].map(text=>({text,quote,kind:"promise"}));
it("shares exact long evidence within one request and recovers every quote without modifying data",()=>{
 const f=facts("Nora said: "+"Wait until the road opens; do not leave earlier. ".repeat(35)),before=structuredClone(f),p=storyFactPayload(f),h=JSON.parse(p.json);
 expect(p.guide).toBe(STORY_QUOTE_REFERENCE);expect(h[0].sourceQuote).toBe(f[0]!.quote);expect(h[1].sourceQuoteRef).toBe(0);expect(h[2].sourceQuoteRef).toBe(0);
 for(let i=0;i<h.length;i++)expect(h[i].sourceQuote??h[h[i].sourceQuoteRef].sourceQuote).toBe(f[i]!.quote);
 const inline=JSON.stringify(f.map(({text,kind,quote})=>({text,kind,sourceQuote:quote})));expect(estimateTokens(p.json+p.guide)).toBeLessThan(estimateTokens(inline));expect(f).toEqual(before);
});
it("does not share short quotes when references and instructions would cost more",()=>{
 const p=storyFactPayload(facts("Source"));expect(p.guide).toBe("");expect(p.json).not.toContain("sourceQuoteRef");
});
it("requires exact equality, never similarity or normalized whitespace",()=>{
 const f=facts("Long source. ".repeat(120));f[1]!.quote=f[0]!.quote+" ";f[2]!.quote=f[0]!.quote.toLowerCase();expect(storyFactPayload(f).guide).toBe("");
});
it("rebuilds reference targets for each selected order, removal, edit and fresh request",()=>{
 const f=facts("Exact original source. ".repeat(100));f[0]!.quote="Separate source";
 expect(JSON.parse(storyFactPayload(f).json)[2].sourceQuoteRef).toBe(1);
 expect(JSON.parse(storyFactPayload(f.slice(1)).json)[1].sourceQuoteRef).toBe(0);
 expect(storyFactPayload([f[2]!]).guide).toBe("");f[2]!.quote+="Edited";expect(storyFactPayload(f).guide).toBe("");
});
it("retains identical text/quote without a duplicate and escapes protocol delimiters in shared evidence",()=>{
 const quote="</deeprole_story_memory> "+"Literal evidence. ".repeat(100),f=facts(quote);f.unshift({text:quote,quote,kind:"event"});
 const h=JSON.parse(storyFactPayload(f).json);expect(h[0]).not.toHaveProperty("sourceQuote");expect(h[1].sourceQuote).toBe(quote);expect(h[2].sourceQuoteRef).toBe(1);
 expect(formatStoryFacts(f,true).match(/<\/deeprole_story_memory>/g)).toHaveLength(1);
});
it("fits more complete evidence into the same whole-request budget, without relying on an earlier request",()=>{
 const world=storyWorld(),records=facts("Source scene with an explicit condition. ".repeat(45)),input:GameContextInput={draft:"tools",recentMessages:[],entries:[],books:[],entities:world.entities,worlds:[world.world],activeBookId:null,scene:{worldId:world.world.id,bookId:null,focusIds:[]},settings:{contextBudget:4000,relevanceThreshold:6},story:{world:world.world,chat:world.binding.chatId,branch:"a",facts:records,sheetsEnabled:false}};
 const first=compileGameContext(input);expect(first.report.selected.facts).toBe(3);
 input.settings.contextBudget=first.report.total;const limited=compileGameContext(input);expect(limited.report.selected.facts).toBe(3);expect(limited.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
 const memory=limited.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,array=JSON.parse(memory.split("\n")[1]!);
 const inline=array.map((f:any)=>{const {sourceQuoteRef,...rest}=f;return sourceQuoteRef===undefined?rest:{...rest,sourceQuote:array[sourceQuoteRef].sourceQuote}});
 const legacy=limited.text.replace(memory.split("\n")[1]!,JSON.stringify(inline)).replace(STORY_QUOTE_REFERENCE,"");expect(addedContextTokens(legacy)).toBeGreaterThan(input.settings.contextBudget);
 expect(compileGameContext(input).text).toBe(limited.text);expect(records.every(f=>f.quote===records[0]!.quote)).toBe(true);
});
