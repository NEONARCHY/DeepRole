import type { Workload, VectorArtifact } from './story-search-evaluation.mjs';
export const modelPlan: { id: string; revision: string; dtype: string; pooling: string; dimensions: number; runtime: string; maxTokens: number; files: { name: string; bytes: number; sha256?: string; gitBlob?: string }[] };
export function verifyModelFile(file: { name: string; bytes: number; sha256?: string; gitBlob?: string }, data: Buffer): void;
export function ensureModel(directory: string, options?: { downloadModel?: boolean; fetcher?: typeof fetch }): Promise<string>;
export function encodeLocal(workload: Workload, options: { runtime?: string; modelDirectory?: string; cache?: string; downloadModel?: boolean; log?: (message: string) => void }): Promise<{ artifact: VectorArtifact; timing: Record<string, unknown> }>;
