import type {
  ContextSelection,
  DeepRoleSettings,
  MemoryEntry,
  MemoryPriority,
  RankedMemory,
  MemoryBook,
  SceneEntity,
  SceneState,
} from "./types";
import { expandFocus, isMemoryInScene, memoryWorld, mentionedEntities } from "./scene";
import { estimateTokens, normalizeText, uniqueTokens } from "./text";
import { formatMemoryContext } from "./context";
import { inferTitlePeople, loreTitleParts } from "./lore-categories";

const PRIORITY_MULTIPLIER: Record<MemoryPriority, number> = {
  low: 0.85,
  normal: 1,
  high: 1.2,
};

export interface RankMemoryInput {
  nameGroups?: ReturnType<typeof inferTitlePeople>;
  draft: string;
  recentMessages: string[];
  entries: MemoryEntry[];
  activeBookId: string | null;
  scene?: SceneState;
  books?: MemoryBook[];
  entities?: SceneEntity[];
  manualIds?: Iterable<string>;
  excludedIds?: Iterable<string>;
  settings: Pick<DeepRoleSettings, "contextBudget" | "relevanceThreshold">;
}

export function rankMemories(input: RankMemoryInput): ContextSelection {
  const manualIds = new Set(input.manualIds ?? []);
  const excludedIds = new Set(input.excludedIds ?? []);
  const searchableText = [input.draft, ...input.recentMessages.slice(-4)].filter(Boolean).join(" \n ");
  const normalizedHaystack = normalizeText(searchableText);
  const haystackTokens = uniqueTokens(searchableText);
  const entities = (input.entities ?? []).filter((entity) => entity.worldId === input.scene?.worldId);
  const focus = expandFocus(input.scene?.focusIds ?? [], entities, input.scene?.worldId ?? null);
  const mentions = expandFocus(mentionedEntities(searchableText, entities), entities, input.scene?.worldId ?? null);
  const scoped = input.entries.filter((entry) => input.scene ? isMemoryInScene(entry, input.scene, input.books ?? []) : !entry.worldId && (!entry.bookId || entry.bookId === input.activeBookId));
  const titlePeople = (input.nameGroups ?? inferTitlePeople(scoped.filter((entry) => entry.enabled), [], 1)).map((group) => ({ id: group.token, worldId: input.scene?.worldId ?? "", kind: "character" as const, name: group.name, aliases: group.aliases ?? [], description: "", memberIds: [], createdAt: 0, updatedAt: 0, entryIds: group.entryIds }));
  const namedGroups = new Set(mentionedEntities(searchableText, titlePeople));
  const titleAssociated = new Set(titlePeople.filter((group) => namedGroups.has(group.id)).flatMap((group) => group.entryIds));

  const ranked: RankedMemory[] = [];
  for (const entry of input.entries) {
    if (!entry.enabled || excludedIds.has(entry.id)) continue;
    const manuallySelected = manualIds.has(entry.id);
    // Pinning may cross the selected book, never a disabled or missing book.
    if (entry.bookId && input.books && !input.books.some((book) => book.id === entry.bookId && book.active)) continue;
    const inScene = input.scene
      ? isMemoryInScene(entry, input.scene, input.books ?? []) || (manuallySelected && memoryWorld(entry, input.books ?? []) === input.scene.worldId)
      : !entry.worldId && (!entry.bookId || entry.bookId === input.activeBookId || manuallySelected);
    if (!inScene) continue;
    if (entry.activation === "manual" && !manuallySelected) continue;

    if (entry.activation === "always" || manuallySelected) {
      ranked.push({
        entry,
        score: entry.activation === "always" ? 100 : 90,
        reasons: [entry.activation === "always" ? "always" : "manual"],
        estimatedTokens: estimateEntryTokens(entry),
        manuallySelected,
      });
      continue;
    }

    let { score, reasons } = scoreMemory(entry, normalizedHaystack, haystackTokens);
    if (titleAssociated.has(entry.id)) { score += 8; reasons.push("name-in-title"); }
    const linked = [...new Set(entry.entityIds ?? [])];
    const focused = linked.filter((id) => focus.has(id));
    const mentioned = linked.filter((id) => mentions.has(id) && !focus.has(id));
    score += Math.min(36, focused.length * 12) + Math.min(16, mentioned.length * 8);
    reasons.push(...focused.map((id) => `focus:${id}`), ...mentioned.map((id) => `entity:${id}`));
    const weightedScore = score * PRIORITY_MULTIPLIER[entry.priority];
    if (weightedScore >= input.settings.relevanceThreshold) {
      ranked.push({
        entry,
        score: Number(weightedScore.toFixed(2)),
        reasons,
        estimatedTokens: estimateEntryTokens(entry),
        manuallySelected: false,
      });
    }
  }

  ranked.sort((a, b) => {
    const modeDifference = modeOrder(a) - modeOrder(b);
    if (modeDifference !== 0) return modeDifference;
    return b.score - a.score || b.entry.updatedAt - a.entry.updatedAt;
  });

  const selected: RankedMemory[] = [];
  let estimatedTokens = 0;
  let omittedCount = 0;
  for (const item of ranked) {
    const required = item.estimatedTokens;
    const forced = item.entry.activation === "always" || item.manuallySelected;
    if (!forced && estimatedTokens + required > input.settings.contextBudget) {
      omittedCount += 1;
      continue;
    }
    selected.push(item);
    estimatedTokens += required;
  }

  // One hop from actually selected entries, without bypassing scope or budget.
  const seeds = new Set(selected.map((item) => item.entry.id));
  const neighbors = new Set<string>();
  for (const entry of input.entries) {
    for (const link of entry.links ?? []) {
      if (link.mode !== "context") continue;
      if (seeds.has(entry.id)) neighbors.add(link.targetId);
      if (seeds.has(link.targetId)) neighbors.add(entry.id);
    }
  }
  for (const entry of input.entries.filter((e) => neighbors.has(e.id) && !seeds.has(e.id)).sort((a, b) => PRIORITY_MULTIPLIER[b.priority] - PRIORITY_MULTIPLIER[a.priority] || a.id.localeCompare(b.id))) {
    if (!entry.enabled || entry.activation !== "smart" || excludedIds.has(entry.id)) continue;
    if (input.scene ? !isMemoryInScene(entry, input.scene, input.books ?? []) : entry.worldId || (entry.bookId && entry.bookId !== input.activeBookId)) continue;
    const required = estimateEntryTokens(entry);
    if (estimatedTokens + required > input.settings.contextBudget) { if (!ranked.some((r) => r.entry.id === entry.id)) omittedCount += 1; continue; }
    selected.push({ entry, score: 6, reasons: ["linked"], estimatedTokens: required, manuallySelected: false });
    estimatedTokens += required;
  }
  if (selected.length) {
    // Include relationship labels and instructions in the same budget, too.
    estimatedTokens = estimateTokens(formatMemoryContext({ entries: selected, estimatedTokens, omittedCount }));
    while (estimatedTokens > input.settings.contextBudget) {
      const index = selected.findLastIndex((item) => item.entry.activation !== "always" && !item.manuallySelected);
      if (index < 0) break;
      selected.splice(index, 1); omittedCount += 1;
      estimatedTokens = selected.length ? estimateTokens(formatMemoryContext({ entries: selected, estimatedTokens, omittedCount })) : 0;
    }
  }
  return { entries: selected, estimatedTokens, omittedCount, overBudgetTokens: Math.max(0, estimatedTokens - input.settings.contextBudget) };
}

export function scoreMemory(
  entry: MemoryEntry,
  normalizedHaystack: string,
  haystackTokens: Set<string>,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const keyword of entry.keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) continue;
    if ((" " + normalizedHaystack + " ").includes(" " + normalizedKeyword + " ")) {
      score += normalizedKeyword.includes(" ") ? 8 : 4;
      reasons.push(`keyword:${keyword}`);
      continue;
    }
    const keywordTokens = uniqueTokens(keyword);
    if ([...keywordTokens].some((token) => haystackTokens.has(token))) {
      score += 4;
      reasons.push(`keyword:${keyword}`);
    }
  }

  let titleHits = 0;
  for (const token of uniqueTokens(loreTitleParts(entry.title).join(" "))) {
    if (haystackTokens.has(token)) titleHits += 1;
  }
  if (titleHits > 0) {
    score += Math.min(9, titleHits * 3);
    reasons.push("title");
  }

  let contentHits = 0;
  for (const token of uniqueTokens(entry.content)) {
    if (haystackTokens.has(token)) contentHits += 1;
  }
  if (contentHits > 0) {
    score += Math.min(5, contentHits);
    reasons.push("content");
  }

  return { score, reasons };
}

function estimateEntryTokens(entry: MemoryEntry): number {
  return estimateTokens(`${entry.title}: ${entry.content}`) + 6 + (entry.links ?? []).reduce((sum, link) => sum + estimateTokens(`${entry.title} ${link.label}`) + 16, 0);
}

function modeOrder(item: RankedMemory): number {
  if (item.manuallySelected) return 0;
  if (item.entry.activation === "always") return 1;
  return 2;
}
