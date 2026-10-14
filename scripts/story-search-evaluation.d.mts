export interface EvaluationCase {
  id: string; split: string; family: string; intent: string; query: string;
  documents: { id: string; text: string; source: string }[];
  lexical: string[]; baseline: string[]; gold: string[]; protected: boolean;
  preserve?: boolean; protectionReason?: string[];
}
export interface Workload {
  version: number; inputDigest: string; goldDigest: string;
  cases: (EvaluationCase & { queryKey: string; documents: (EvaluationCase['documents'][number] & { vectorKey: string })[] })[];
  inputs: { key: string; text: string }[];
}
export interface VectorArtifact {
  version: number; inputDigest: string;
  model: { id: string; revision: string; dtype: string; pooling: string; dimensions: number };
  entries: { key: string; vector: number[] }[];
}
export function digest(value: unknown): string;
export function prepareEvaluation(cases: EvaluationCase[]): Workload;
export function validateVectors(workload: Workload, artifact: unknown): Map<string, number[]>;
export function fuseRanks(lexical: string[], dense: string[], limit?: number): string[];
export function evaluateCandidates(workload: Workload, artifact: VectorArtifact): {
  version: number; inputDigest: string; goldDigest: string; model: VectorArtifact['model']; scope: string;
  groups: { split: string; intent: string; cases: number; protected: number; baselineComplete: number; lexicalComplete: number; denseComplete: number; hybridComplete: number; baselineWrongFirst: number; lexicalWrongFirst: number; denseWrongFirst: number; hybridWrongFirst: number; baselineMissingGold: number; lexicalMissingGold: number; denseMissingGold: number; hybridMissingGold: number; controlDrift: number }[];
  rows: { id: string; split: string; family: string; intent: string; goldCount: number; protected: boolean;
    baseline: { complete: boolean; correctFirst: boolean; missingGold: number }; lexical: { complete: boolean; correctFirst: boolean; missingGold: number }; dense: { complete: boolean; correctFirst: boolean; missingGold: number }; hybrid: { complete: boolean; correctFirst: boolean; missingGold: number };
    controlDrift: boolean; selected: { baseline: string[]; dense: string[]; hybrid: string[] }; denseScores: { id: string; score: number }[] }[];
};
