import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {GameMemoryNotice,GameMemoryCoverageSummary} from "../src/entrypoints/shared/GameMemoryNotice";
import {MemoryStatus} from "../src/entrypoints/shared/MemoryStatus";
import {gameMemoryCoverageText} from "../src/core/game-memory-coverage-i18n";
import type {GameMemoryCoverage} from "../src/core/game-memory-coverage";
afterEach(cleanup);
for(const locale of ["ru","en"] as const){
 it(`visible budget warning is nonblocking, focus stays in the draft: ${locale}`,()=>{
  const action=vi.fn(),t=gameMemoryCoverageText(locale);
  const {rerender}=render(<><input aria-label="draft"/><GameMemoryNotice locale={locale}/></>);
  screen.getByRole("textbox").focus();
  rerender(<><input aria-label="draft"/><GameMemoryNotice locale={locale} coverage={{kind:"budget",sources:12,selected:4}} onDetails={action}/></>);
  expect(screen.getByRole("textbox")).toHaveFocus();expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(t.budgetTitle);
  expect(screen.getByRole("status")).toHaveTextContent(t.action);
  fireEvent.click(screen.getByRole("button",{name:t.details}));expect(action).toHaveBeenCalledOnce();
 });
 for(const coverage of [{kind:"complete",sources:12},{kind:"unverified",reason:"source"},{kind:"unverified",reason:"query"},{kind:"not-applicable"}] as GameMemoryCoverage[])it(`ordinary/unknown preview has no warning or success toast: ${locale}/${JSON.stringify(coverage)}`,()=>{
  const {container}=render(<GameMemoryNotice locale={locale} coverage={coverage}/>);expect(container).toBeEmptyDOMElement();
 });
 it(`unknown sources are explained only in details without a false delivery claim: ${locale}`,()=>{
  const t=gameMemoryCoverageText(locale);
  render(<GameMemoryCoverageSummary locale={locale} coverage={{kind:"unverified",reason:"source"}}/>);
  expect(screen.getByText(t.source)).toBeVisible();expect(screen.getByText(t.preview)).toBeVisible();
 });
 it(`partial preparation replaces the unqualified memory-ready heading: ${locale}`,()=>{
  const t=gameMemoryCoverageText(locale);
  render(<MemoryStatus locale={locale} connected available={2} onAdd={()=>{}} selection={{entries:[],estimatedTokens:400,omittedCount:0,memoryCoverage:{kind:"budget",sources:12,selected:4}}}/>);
  expect(screen.getByText(t.budgetTitle)).toBeVisible();expect(screen.queryByText(locale==="ru"?"Память готова":"Memory is ready")).toBeNull();
 });
}
