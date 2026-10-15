import type { EvaluationCase } from './story-search-evaluation.mjs';
import type { StoryFact } from '../src/core/story-update';
import type { StorySourceRoles } from '../src/core/story-source-roles';
export interface GroundingCase extends EvaluationCase {
  documents: (EvaluationCase['documents'][number] & { fact: StoryFact; sourceVerified: boolean; roles: StorySourceRoles; identityStatus: string })[];
  mandatory: string[]; names: string[]; currentSourceIds: string[];
}
export function groundingCandidates(c: GroundingCase, tokens: (text: string) => string[]): { ids: string[]; reason: string; priorities: string[]; mode?: string };
export function evaluateGrounding(cases: GroundingCase[], tokens: (text: string) => string[]): {
  groups: { split: string; family: string; cases: number; positive: number; baselineComplete: number; lexicalComplete: number; candidateComplete: number; lexicalWrongFirst: number; candidateWrongFirst: number; controlDrift: number; mandatoryLoss: number; lostLexicalGold: number }[];
  rows: { id: string; split: string; family: string; gold: string[]; baseline: string[]; lexical: string[]; candidate: string[]; priorities: string[]; reason: string; mode?: string; mandatory: string[]; controlDrift: boolean; mandatoryLoss: string[]; lostLexicalGold: string[] }[];
};
