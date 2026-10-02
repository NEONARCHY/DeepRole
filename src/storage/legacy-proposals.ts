import { browser } from "wxt/browser";
import { PENDING_SUGGESTIONS_KEY } from "../core/messages";
import { libraryRecords, scopedMemories } from "../core/memory-workspace";
import { prepareMemoryProposals } from "../core/memory-proposals";
import { parseServiceData } from "../core/service-protocol";
import type { DataRecord, MemoryBook, MemoryEntry, MemoryProposalBatch, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

const running = new WeakMap<DeepRoleRepository, Promise<void>>();

/** Upgrade the previous plaintext queue, without approving or rewriting any lore. */
export function migrateLegacyProposals(repo: DeepRoleRepository = repository): Promise<void> {
  const pending = running.get(repo); if (pending) return pending;
  const task = migrate(repo).finally(() => running.delete(repo));
  running.set(repo, task); return task;
}

async function migrate(repo: DeepRoleRepository) {
  const stored = (await browser.storage.local.get(PENDING_SUGGESTIONS_KEY))[PENDING_SUGGESTIONS_KEY];
  if (stored === undefined || await repo.isLocked()) return;
  // An unfamiliar legacy value stays intact, rather than being silently discarded.
  if (!Array.isArray(stored) || stored.length > 1000) throw new Error("invalid-legacy-proposals");
  const raw = JSON.stringify(stored);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const digest = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const records = await repo.rawRecords();
  const books = libraryRecords<MemoryBook>(records, "book");
  const worlds = libraryRecords<WorldProfile>(records, "world");
  const entries = libraryRecords<MemoryEntry>(records, "entry");
  const groups = new Map<string, { worldId: string | null; bookId: string | null; items: unknown[] }>();
  for (const value of stored) {
    if (!value || typeof value !== "object") throw new Error("invalid-legacy-proposals");
    const item = value as Record<string, unknown>;
    const bookId = typeof item.bookId === "string" ? item.bookId : null;
    const book = books.find((book) => book.id === bookId);
    const worldId = typeof item.worldId === "string" ? item.worldId : book?.worldId ?? null;
    if (bookId && !book || worldId && !worlds.some((world) => world.id === worldId) || book && (book.worldId ?? null) !== worldId) throw new Error("invalid-legacy-scope");
    const key = JSON.stringify([worldId, bookId]);
    const group = groups.get(key) ?? { worldId, bookId, items: [] };
    group.items.push(item); groups.set(key, group);
  }
  const creates: DataRecord[] = [];
  let part = 0;
  for (const { worldId, bookId, items } of groups.values()) for (let offset = 0; offset < items.length; offset += 100) {
    const chunk = items.slice(offset, offset + 100);
    const parsed = parseServiceData(`<deeprole_data>${JSON.stringify({ type: "memory-suggestions", items: chunk })}</deeprole_data>`);
    if (parsed?.type !== "memory-suggestions" || parsed.items.length !== chunk.length) throw new Error("invalid-legacy-proposals");
    const id = `legacy:${digest}:${part++}`;
    if (records.some((record) => record.kind === "proposal" && record.id === id || record.kind === "change" && "proposalId" in record.data && record.data.proposalId === id)) continue;
    const batch: MemoryProposalBatch = await prepareMemoryProposals(parsed.items, scopedMemories(entries, books, worldId), { id, worldId, bookId, type: "memory-analysis", createdAt: Date.now() });
    const unchecked = new Set(parsed.items.filter((_, index) => (chunk[index] as Record<string, unknown>).selected === false).map((item) => item.id));
    batch.items = batch.items.map((item) => ({ ...item, selected: item.selected && !unchecked.has(item.id) }));
    // There is no old revision fingerprint: existing targets require a fresh review.
    if (batch.items.length) creates.push({ kind: "proposal", id, data: batch });
  }
  if (creates.length) await repo.commitChecked(creates, [], creates.map(({ kind, id }) => ({ kind, id, data: null })));
  // Don't remove a queue changed by another version while this upgrade was running.
  const current = (await browser.storage.local.get(PENDING_SUGGESTIONS_KEY))[PENDING_SUGGESTIONS_KEY];
  if (JSON.stringify(current) === raw) await browser.storage.local.remove(PENDING_SUGGESTIONS_KEY);
}
