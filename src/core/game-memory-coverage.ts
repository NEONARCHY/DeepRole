import type {GameContextReport} from "./game-context";

/** Local preparation only; never evidence of delivery or of the model using it. */
export type GameMemoryCoverage =
 | {kind:"complete";sources:number}
 | {kind:"budget";sources:number;selected:number}
 | {kind:"required-overflow"}
 | {kind:"unverified";reason:"source"|"query"|"capacity"}
 | {kind:"not-applicable"};

export function memoryCoverageIssue(coverage?:GameMemoryCoverage,report?:GameContextReport){
 if(report&&report.required>report.limit)return {kind:"required-overflow"} as const;
 return coverage?.kind==="budget"||coverage?.kind==="required-overflow"?coverage:undefined;
}
