import type { Workload, VectorArtifact } from './story-search-evaluation.mjs';
export const searchPolicy: { version: number; experiment: string; method: string; limit: number; lexicalAnchors: number; lambda: number; probeBudgets: number[]; preserve: string[]; similarityIsNotIdentity: boolean; unknownQueryPolicy: string; admission: string };
export const policyDigest: string;
export function diversifiedCandidates(c: Workload['cases'][number], vectors: Map<string, number[]>): { ids: string[]; reason: string; similarities: { id: string; relevance: number; redundancy: number; score: number }[] };
interface Measurement { complete: boolean; correctFirst: boolean; missingGold: number }
export function evaluateDiversification(workload: Workload, artifact: VectorArtifact): {
  version: number; experiment: string; inputDigest: string; goldDigest: string; policyDigest: string; policy: typeof searchPolicy; model: VectorArtifact['model']; scope: string;
  groups: { split: string; intent: string; cases: number; preserved: number; baselineComplete: number; lexicalComplete: number; diverseComplete: number; lexicalWrongFirst: number; diverseWrongFirst: number; lostLexicalGold: number; addedGold: number; controlDrift: number }[];
  rows: { id: string; split: string; family: string; intent: string; goldCount: number; preserve: boolean; protectionReason: string[]; reason: string; baseline: Measurement; lexical: Measurement; diverse: Measurement; selected: { baseline: string[]; lexical: string[]; diverse: string[] }; controlDrift: boolean; lostLexicalGold: string[]; addedGold: string[] }[];
};
