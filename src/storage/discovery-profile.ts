import { profileField, characterProfilePrompt, readProfileProposal, PROFILE_FIELDS } from "../core/character-profile";
import { isolatedFieldResult } from "../core/isolated-character-text";
import { validDiscoveryProfileInput, type DiscoveryProfileInput } from "../core/story-character-discovery";
import { mentionsCharacter } from "../core/character-context";
import { storyReplyProse } from "../core/story-update";
import { storyRow, type StoryEvent, type StoryRevision } from "../core/story-records";
import type { DiscoveryProfile } from "../core/discovery-profile";
import type { CharacterTextRequest } from "../core/character-text";
import type { FieldSource } from "../core/field-history";
import type { Locale } from "../core/types";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { repository, type DeepRoleRepository } from "./repository";

export interface DiscoveryProfileBrief {
  input: DiscoveryProfileInput; requestId: string; prompt: string; draft: CharacterTextRequest;
  sources: (FieldSource & { revisionId: string })[]; partial: boolean;
  source: { worldId: string; chatId: string; chatUrl: string; bookId: string | null };
}
function target(f: ReturnType<typeof scopedDiscovery>, input: Pick<DiscoveryProfileInput, "guard" | "eventId">) {
  discoveryGuard(f.guard, input.guard);
  const event = f.stored.find((e): e is StoryEvent => e.type === "event" && e.id === input.eventId && !!e.characterCandidate && !e.characterCandidate.dismissed && f.projection.revisionIds.includes(e.revisionId));
  if (!event || event.effects || !f.branch.headRevisionId || !f.selected.some(r => r.id === f.branch.headRevisionId)) throw Error("scene-changed");
  return event;
}
/** Literal name/alias retrieval with bounded windows, not semantic or exhaustive search. */
export function profileExcerpts(revisions: StoryRevision[], references: string[], seed: { revisionId: string; quote: string }) {
  const sources: DiscoveryProfileBrief["sources"] = [{ id: "s0", revisionId: seed.revisionId, text: seed.quote }];
  let used = JSON.stringify([{ id: "s0", text: seed.quote }]).length, partial = false;
  const names = [...new Set(references)].filter(Boolean);
  for (const r of [...revisions].reverse()) {
    const prose = storyReplyProse(r.content);
    if (!mentionsCharacter(prose, { name: names[0] ?? "", aliases: names.slice(1) })) continue;
    const ranges: { start: number; end: number }[] = [];
    // Exact offsets are retained: source quotes always use original prose.
    for (const n of names) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
      const matches = prose.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"));
      for (const match of matches) {
        const start = Math.max(0, match.index! - 500), end = Math.min(prose.length, match.index! + match[0].length + 1000);
        const previous = ranges.find(p => p.start <= end && start <= p.end);
        if (previous && Math.max(previous.end, end) - Math.min(previous.start, start) <= 3000) { previous.start = Math.min(previous.start, start); previous.end = Math.max(previous.end, end); }
        else ranges.push({ start, end });
      }
    }
    ranges.sort((a, b) => b.start - a.start);
    if (!ranges.length) partial = true;
    for (const range of ranges) {
      const text = prose.slice(range.start, range.end);
      if (sources.some(s => s.revisionId === r.id && s.text.includes(text))) continue;
      const id = `s${sources.length}`, size = JSON.stringify({ id, text }).length + 1;
      if (sources.length >= 16 || used + size > 12000) { partial = true; continue; }
      sources.push({ id, revisionId: r.id, text }); used += size;
    }
    if (ranges.length && !ranges.some(p => p.start === 0 && p.end === prose.length)) partial = true;
  }
  return { sources, partial };
}
export async function prepareDiscoveryProfile(input: DiscoveryProfileInput, requestId: string, locale: Locale, repo: DeepRoleRepository = repository): Promise<DiscoveryProfileBrief> {
  input = structuredClone(input); if (!validDiscoveryProfileInput(input) || !/^field_[0-9a-f-]{36}$/u.test(requestId)) throw Error("invalid-brief");
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, input), event = target(f, input);
    const { sources, partial } = profileExcerpts(f.selected, [input.name, event.characterCandidate!.name], event);
    const draft = { field: profileField(locale, "history"), currentText: JSON.stringify(input.values), reference: { name: input.name, aliases: [event.characterCandidate!.name], ...input.values } };
    const prompt = characterProfilePrompt(draft, sources.map(({ id, text }) => ({ id, text })), locale, requestId)
      + "\nThese are bounded excerpts of the SELECTED recorded story, not the entire chat. Omitted information is unknown. Do not add creative fallback. Output only established, lasting profile facts; temporary scene state does not belong in personality or goals.";
    return { records: [], removed: [], result: { input, requestId, prompt, draft, sources, partial, source: { worldId: input.worldId, chatId: input.chatId, chatUrl: f.binding.chatUrl, bookId: f.binding.bookId } } };
  });
}
export async function discoveryProfileCurrent(input: Pick<DiscoveryProfileInput, "worldId" | "chatId" | "guard" | "eventId">, repo: DeepRoleRepository = repository) {
  try { return await repo.updateRecords(all => { target(scopedDiscovery(all, input), input); return { records: [], removed: [], result: true }; }); } catch { return false; }
}
export async function applyDiscoveryProfile(brief: DiscoveryProfileBrief, raw: string, repo: DeepRoleRepository = repository) {
  const proposal = readProfileProposal(isolatedFieldResult(raw, brief.draft, { requestId: brief.requestId, sources: brief.sources }), [...PROFILE_FIELDS]);
  return repo.updateRecords(all => {
    const f = scopedDiscovery(all, brief.input), event = target(f, brief.input);
    const proofs: DiscoveryProfile["proofs"] = [];
    for (const k of PROFILE_FIELDS) for (const quote of proposal[k]!.evidence) {
      const source = brief.sources.find(s => s.text.includes(quote))!;
      if (!f.selected.some(r => r.id === source.revisionId && storyReplyProse(r.content).includes(quote))) throw Error("scene-changed");
      if (!proofs.some(p => p.quote === quote && p.revisionId === source.revisionId)) proofs.push({ revisionId: source.revisionId, quote });
    }
    const profile: DiscoveryProfile = { headRevisionId: brief.input.guard.headRevisionId!, name: brief.input.name, values: brief.input.values, proposal, proofs, partial: brief.partial };
    return { records: [storyRow({ ...event, characterProfile: profile, updatedAt: Date.now() })], removed: [], result: undefined };
  });
}
