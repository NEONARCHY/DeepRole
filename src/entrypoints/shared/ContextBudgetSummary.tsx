import type {Locale,RankedMemory} from "../../core/types";
import type {GameContextReport} from "../../core/game-context";
import {contextBudgetText} from "../../core/context-budget-i18n";
import type {GameMemoryCoverage} from "../../core/game-memory-coverage";
import {GameMemoryCoverageSummary} from "./GameMemoryNotice";
export function ContextBudgetSummary({locale,report,coverage,entries=[]}:{locale:Locale;report?:GameContextReport;coverage?:GameMemoryCoverage;entries?:RankedMemory[]}) {
 if(!report)return null;
 const t=contextBudgetText(locale),number=(n:number)=>new Intl.NumberFormat(locale).format(n),kinds=["lore","profiles","facts","continuation"] as const;
 const reasons=(item:RankedMemory)=>{
  const labels=new Set<string>();
  for(const reason of item.reasons){
   if(reason==="always")labels.add(t.alwaysReason);else if(reason==="manual")labels.add(t.manualReason);
   else if(reason==="linked")labels.add(t.linkReason);else if(reason.startsWith("entity:")||reason.startsWith("focus:"))labels.add(t.entityReason);
   else if(reason==="title"||reason==="content"||reason==="name-in-title"||reason.startsWith("keyword:"))labels.add(t.wordReason);
  }
  return labels.size?[...labels]:[t.unknownReason];
 };
 return <details className="dr-context-budget">
  <summary>{t.title} · ~{number(report.total)} / {number(report.limit)}</summary>
  <p><strong>{t.preview}</strong></p><p>{t.previewHint}</p><p>{t.estimate}</p>
   <GameMemoryCoverageSummary locale={locale} coverage={coverage}/>
  <dl><div><dt>{t.required}</dt><dd>~{number(report.required)}</dd></div>{kinds.map(kind=><div key={kind}><dt>{t[kind]}</dt><dd>{number(report.selected[kind])}</dd></div>)}</dl>
  {report.total>report.limit&&<p role="status">{t.overflow}</p>}
  {kinds.some(k=>report.omitted[k]>0)&&<><h4>{t.omitted}</h4><dl>{kinds.filter(k=>report.omitted[k]>0).map(k=><div key={k}><dt>{t[k]}</dt><dd>{number(report.omitted[k])}</dd></div>)}</dl></>}
  {(entries.length>0||report.selected.profiles>0||report.selected.continuation>0||Object.values(report.explanation??{}).some(n=>n>0))&&<h4>{t.why}</h4>}
  {report.explanation&&Object.values(report.explanation).some(n=>n>0)&&<dl>{(["draftFacts","recentFacts","openTasks","persistentFacts","recentFallback"] as const).filter(key=>(report.explanation![key]??0)>0).map(key=><div key={key}><dt>{t[key]}</dt><dd>{number(report.explanation![key]??0)}</dd></div>)}</dl>}
  {report.selected.profiles>0&&<p>{t.profileReason}</p>}
  {report.selected.continuation>0&&<p>{t.continuationReason}</p>}
  {entries.length>0&&<details><summary>{t.loreReasons}</summary><ul>{entries.slice(0,8).map(item=><li key={item.entry.id}><strong>{item.entry.title}</strong><ul>{reasons(item).map(reason=><li key={reason}>{reason}</li>)}</ul></li>)}</ul>{entries.length>8&&<p>{t.more}</p>}</details>}
  <p>{t.local}</p>
 </details>;
}
