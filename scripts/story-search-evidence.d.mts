import type { Workload, VectorArtifact } from './story-search-evaluation.mjs';
import type { evaluateDiversification } from './story-search-diversify.mjs';
export const evidencePolicy: Record<string, unknown>;
export const evidencePolicyDigest: string;
export function evidenceCandidates(c: Workload['cases'][number] & { evidenceIds: string[] }, vectors: Map<string, number[]>): { ids: string[]; reason: string };
type PriorReport = ReturnType<typeof evaluateDiversification>;
export function evaluateEvidence(workload: Workload, artifact: VectorArtifact): Omit<PriorReport, 'rows'> & {
  evidencePolicy: Record<string, unknown>; evidencePolicyDigest: string;
  rows: (PriorReport['rows'][number] & { evidenceIds: string[]; allMandatoryRetained: boolean; unguarded: PriorReport['rows'][number]['diverse']; unguardedSelected: string[] })[];
};
