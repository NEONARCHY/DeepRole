import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {ContextBudgetSummary} from "../src/entrypoints/shared/ContextBudgetSummary";
import {contextBudgetText} from "../src/core/context-budget-i18n";
import {compileGameContext,type GameContextInput} from "../src/core/game-context";
import {storyWorld} from "./fixtures/story-worlds";
afterEach(cleanup);
function fixture(){const f=storyWorld();const input:GameContextInput={draft:"medallion",recentMessages:["clock key"],entries:[],worlds:[f.world],entities:[],activeBookId:null,settings:{contextBudget:2500,relevanceThreshold:6},scene:{worldId:f.world.id,bookId:null,focusIds:[]},story:{world:f.world,chat:f.binding.chatId,branch:"a",sheetsEnabled:true,facts:[{text:"The medallion is in the cellar.",quote:"The medallion is in the cellar.",kind:"event"},{text:"The clock key is blue.",quote:"The clock key is blue.",kind:"event"},{text:"Avery agreed to repair the gate.",quote:"Avery agreed to repair the gate.",kind:"promise",task:{key:"gate",title:"repair the gate",status:"open"}},{text:"The red door was painted.",quote:"The red door was painted.",kind:"event"}]}};return {f,input};}
it("counts actual selected facts once by direct, recent, open-task or fallback basis",()=>{
 const {input}=fixture(),before=structuredClone(input),r=compileGameContext(input);
 expect(r.report.explanation).toEqual({draftFacts:1,recentFacts:1,openTasks:1,recentFallback:1});
 expect(Object.values(r.report.explanation!).reduce((a,b)=>a+b,0)).toBe(r.report.selected.facts);
 expect(input).toEqual(before);expect(JSON.stringify(r.report)).not.toContain("medallion");expect(JSON.stringify(r.report)).not.toContain("Avery");
 expect(r.text).not.toContain("draftFacts");
});
it("does not count omitted facts as included explanations",()=>{
 const {input}=fixture();input.settings.contextBudget=1;const r=compileGameContext(input);
 expect(r.report.explanation).toEqual({draftFacts:0,recentFacts:0,openTasks:0,recentFallback:0});expect(r.report.selected.facts).toBe(0);expect(r.report.omitted.facts).toBeGreaterThan(0);
});
for(const locale of ["ru","en"] as const)it(`localizes preview and per-entry reasons without displaying raw IDs/keywords: ${locale}`,()=>{
 const {input,f}=fixture();input.entries=[{...f.entry,activation:"always"}];const r=compileGameContext(input),item={...r.selection.entries[0]!,reasons:["always","manual","keyword:PRIVATE_WORD","title","entity:PRIVATE_ID","linked"]},t=contextBudgetText(locale);
 const before=structuredClone(r.report);const {container}=render(<ContextBudgetSummary locale={locale} report={r.report} entries={[item]}/>);
 expect(screen.getByText(t.preview)).toBeInTheDocument();expect(screen.getByText(t.previewHint)).toBeInTheDocument();
 for(const key of ["alwaysReason","manualReason","wordReason","entityReason","linkReason"] as const)expect(screen.getByText(t[key])).toBeInTheDocument();
 expect(container.textContent).not.toContain("PRIVATE_ID");expect(container.textContent).not.toContain("PRIVATE_WORD");expect(r.report).toEqual(before);
});
it("bounds the reason list without changing the selected count and supports legacy reports",()=>{
 const {f,input}=fixture(),r=compileGameContext(input),entries=Array.from({length:12},(_,i)=>({entry:{...f.entry,id:"entry"+i,title:"Entry "+i},score:1,reasons:["unknown"],estimatedTokens:1,manuallySelected:false}));
 delete r.report.explanation;r.report.selected.lore=12;
 const {container}=render(<ContextBudgetSummary locale="en" report={r.report} entries={entries}/>);
 expect(screen.getByText("Entry 7")).toBeInTheDocument();expect(screen.queryByText("Entry 8")).toBeNull();expect(screen.getByText(contextBudgetText("en").more)).toBeInTheDocument();expect(container.textContent).toContain("12");
});
