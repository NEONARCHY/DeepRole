// @vitest-environment node
import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {compileGameContext,type GameContextInput} from "../src/core/game-context";
import {memoryCoverageIssue,type GameMemoryCoverage} from "../src/core/game-memory-coverage";
import {budgetWorld,budgetScenarios,priorBudgetContext} from "./fixtures/story-budget-priority";
import {digest} from "../scripts/story-search-evaluation.mjs";

function inspect(input:GameContextInput){
 const observations:GameMemoryCoverage[]=[];
 const before=structuredClone(input),context=compileGameContext(input,{},state=>observations.push(state));
 expect(context).toEqual(compileGameContext(input));expect(input).toEqual(before);
 expect(observations).toHaveLength(1);
 expect(context.selection).not.toHaveProperty("memoryCoverage");
 return {context,coverage:observations[0]!};
}
const original=JSON.parse(readFileSync("docs/benchmarks/rp273c-budget-results.json","utf8"));
for(const c of budgetScenarios())it(`diagnostics preserve the exact registered RP273 output, not only its text: ${c.id}`,()=>{
 expect(digest(inspect(c.input).context)).toBe(original.rows.find((row:any)=>row.id===c.id).outputDigest);
});
for(const locale of ["ru","en"] as const){
 for(const count of [4,8,12])it(`complete identified bundle is preparation, independent of optional omissions: ${locale}/${count}`,()=>{
  const c=budgetWorld(locale,count);c.input.draft=c.dual;
  const {context,coverage}=inspect(c.input);
  expect(coverage).toMatchObject({kind:"complete"});
  expect(memoryCoverageIssue(coverage,context.report)).toBeUndefined();
 });
 for(const count of [4,12])it(`only a rejected whole valid bundle proves budget deficit: ${locale}/${count}`,()=>{
  const c=budgetWorld(locale,count);c.input.draft=c.dual;
  c.input.settings.contextBudget=compileGameContext(c.input).report.required+24;
  const {context,coverage}=inspect(c.input);
  expect(coverage.kind).toBe("budget");expect(context.report.required).toBeLessThan(context.report.limit);
  if(count>8)expect(context).toEqual(priorBudgetContext(c.input));
  expect(memoryCoverageIssue(coverage,context.report)?.kind).toBe("budget");
 });
 for(const mode of ["roles","episodes","quote"] as const)it(`unknown source is not mislabeled as low budget: ${locale}/${mode}`,()=>{
  const c=budgetWorld(locale);c.input.draft=c.dual;
  if(mode==="roles")c.input.story!.roleSeeds=[];
  if(mode==="episodes")c.input.story!.episodeSources=[];
  if(mode==="quote")c.records[0]!.quote+=" Changed source.";
  const {coverage}=inspect(c.input);expect(coverage).toEqual({kind:"unverified",reason:"source"});
  expect(memoryCoverageIssue(coverage)).toBeUndefined();
 });
 it(`unsupported wording is not a budget warning: ${locale}`,()=>{
  const c=budgetWorld(locale);c.input.draft=locale==="ru"?"поговорю с ней об этом":"I will talk to her about it";
  expect(inspect(c.input).coverage).toEqual({kind:"unverified",reason:"query"});
 });
 it(`required lore overflow is separate from optional and whole-bundle omissions: ${locale}`,()=>{
  const c=budgetWorld(locale);c.input.draft=c.dual;c.input.settings.contextBudget=0;
  const {context,coverage}=inspect(c.input);expect(coverage).toEqual({kind:"required-overflow"});
  expect(context.report.required).toBeGreaterThan(context.report.limit);
  expect(memoryCoverageIssue(undefined,context.report)).toEqual(coverage);
 });
 it(`untracked/reference-only preparation never claims complete memory: ${locale}`,()=>{
  const c=budgetWorld(locale);delete c.input.story;
  expect(inspect(c.input).coverage).toEqual({kind:"not-applicable"});
 });
 it(`required overflow takes precedence even for an unsupported query: ${locale}`,()=>{
  const c=budgetWorld(locale);c.input.draft=locale==="ru"?"поговорю с ней об этом":"I will talk to her about it";c.input.settings.contextBudget=0;
  expect(inspect(c.input).coverage).toEqual({kind:"required-overflow"});
 });
}
