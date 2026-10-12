import type {Locale} from "../../core/types";
import type {GameContextReport} from "../../core/game-context";
import {contextBudgetText} from "../../core/context-budget-i18n";
export function ContextBudgetSummary({locale,report}:{locale:Locale;report?:GameContextReport}) {
 if(!report)return null;
 const t=contextBudgetText(locale),number=(n:number)=>new Intl.NumberFormat(locale).format(n),kinds=["lore","profiles","facts","continuation"] as const;
 return <details className="dr-context-budget"><summary>{t.title} · ~{number(report.total)} / {number(report.limit)}</summary><p>{t.estimate}</p><dl><div><dt>{t.required}</dt><dd>~{number(report.required)}</dd></div>{kinds.map(kind=><div key={kind}><dt>{t[kind]}</dt><dd>{number(report.selected[kind])}</dd></div>)}</dl>{report.total>report.limit&&<p role="status">{t.overflow}</p>}{kinds.some(k=>report.omitted[k]>0)&&<><h4>{t.omitted}</h4><dl>{kinds.filter(k=>report.omitted[k]>0).map(k=><div key={k}><dt>{t[k]}</dt><dd>{number(report.omitted[k])}</dd></div>)}</dl></>}<p>{t.local}</p></details>;
}
