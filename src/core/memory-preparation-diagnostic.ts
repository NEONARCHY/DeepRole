/** Local console support data only. Never include drafts, lore, IDs or arbitrary
 * exception messages: provider errors can contain the user's text or tokens. */
export type MemoryPreparationStage = "navigation" | "scene" | "recovery" | "reload" | "activation" | "start" | "parent" | "policy" | "compile" | "vault" | "capture" | "native-snapshot" | "handshake";
const codes = new Set([
  "context-changed", "handoff-commit-pending", "vault-locked", "context-timeout", "context-unavailable",
  "story-review-stale", "story-binding-conflict", "story-source-incomplete", "story-native-line-unavailable",
  "story-game-inactive", "story-game-paused", "story-game-stale", "story-start-stale", "story-checkpoint-busy",
  "story-checkpoint-no-scope", "story-manual-conflict", "story-profile-conflict", "story-manual-baseline-conflict", "story-effects-untracked",
  "native-http", "native-format", "native-too-large", "native-unreadable", "native-exception", "native-shape",
  "native-chat", "native-scope", "native-anchor", "native-timeout",
]);
const details = new Set([
  "activation-tab-url", "activation-tab-chat", "activation-tab-inactive",
  "activation-world-missing", "activation-binding-missing", "activation-binding-world", "activation-binding-url",
]);
export const safeMemoryPreparationDetail = (value: unknown): string | undefined => typeof value === "string" && details.has(value) ? value : undefined;
export function memoryPreparationDiagnostic(stage: MemoryPreparationStage, error: unknown, elapsedMs: number) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const detail = error instanceof Error ? safeMemoryPreparationDetail(error.cause) : undefined;
  return { revision: "RP333", stage, code: codes.has(message) ? message : "unknown", ...(detail ? { detail } : {}), elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.min(3_600_000, Math.round(elapsedMs))) : 0 };
}
export function reportMemoryPreparationFailure(stage: MemoryPreparationStage, error: unknown, startedAt: number) {
  console.warn("[DeepRole memory preparation]", JSON.stringify(memoryPreparationDiagnostic(stage, error, Date.now() - startedAt)));
}
