import type {Locale} from "../../core/types";
import type {GameContextReport} from "../../core/game-context";
import {memoryCoverageIssue,type GameMemoryCoverage} from "../../core/game-memory-coverage";
import {gameMemoryCoverageText} from "../../core/game-memory-coverage-i18n";

export function GameMemoryNotice({locale,coverage,report,onDetails}:{locale:Locale;coverage?:GameMemoryCoverage;report?:GameContextReport;onDetails?:()=>void}){
 const issue=memoryCoverageIssue(coverage,report);
 if(!issue)return null;
 const t=gameMemoryCoverageText(locale),required=issue.kind==="required-overflow";
 return <section className="dr-game-memory-notice" role="status" aria-live="polite">
  <strong>{required?t.requiredTitle:t.budgetTitle}</strong>
  <p>{required?t.requiredBody:t.budgetBody}</p><p>{t.action}</p>
  {onDetails&&<button type="button" onClick={onDetails}>{t.details}</button>}
 </section>;
}
export function GameMemoryCoverageSummary({locale,coverage}:{locale:Locale;coverage?:GameMemoryCoverage}){
 if(!coverage)return null;
 const t=gameMemoryCoverageText(locale);
 const label=coverage.kind==="unverified"?t[coverage.reason]:coverage.kind==="required-overflow"?t.requiredTitle:coverage.kind==="not-applicable"?t.notApplicable:t[coverage.kind];
 return <div className="dr-game-memory-coverage"><h4>{t.title}</h4><p>{label}</p><p>{t.preview}</p></div>;
}
