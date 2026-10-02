import { LORE_CATEGORIES, validateLoreMapLayout } from "../core/lore-categories";
import { memoryWorld } from "../core/scene";
import type { DataRecord, LoreMapLayout, MemoryBook, MemoryEntry, RecordKind, WorldProfile } from "../core/types";
import { MemoryConflictError, repository, type DeepRoleRepository } from "./repository";

export type MapTransform<T> = (all: DataRecord[]) => { records: DataRecord[]; removed: { kind: RecordKind; id: string }[]; result: T };
type Change = { kind: "world" | "entry"; id: string; field: "mapLayout" | "mapCategory" | "links" | "activation"; before: unknown; after: unknown };
type Frame = Change[];
const emptyLayout = (): LoreMapLayout => ({ positions: {}, expandedIds: [], customCategories: [] });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const key = (change: Change) => `${change.kind}:${change.id}:${change.field}`;
const value = (record: DataRecord, field: Change["field"]) => field === "mapLayout" ? (record.data as WorldProfile).mapLayout ?? emptyLayout() : (record.data as MemoryEntry)[field];

/** Session-only map metadata journal. No copies of memory text, no blind library restore. */
export class MapEditHistory {
  private past: Frame[] = [];
  private future: Frame[] = [];
  private baseline = new Map<string, Change>();
  constructor(readonly worldId: string, private readonly repo: DeepRoleRepository = repository, initial?: { layout: WorldProfile["mapLayout"]; entries: MemoryEntry[] }) {
    if (!initial) return;
    const layout = structuredClone(initial.layout ?? emptyLayout());
    const world: Change = { kind: "world", id: worldId, field: "mapLayout", before: layout, after: layout };
    this.baseline.set(key(world), world);
    for (const entry of initial.entries) for (const field of ["mapCategory", "links", "activation"] as const) {
      const current = structuredClone(entry[field]); const change: Change = { kind: "entry", id: entry.id, field, before: current, after: current };
      this.baseline.set(key(change), change);
    }
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get canReset() { return [...this.baseline.values()].some((c) => !equal(c.before, c.after)); }

  async apply<T>(transform: MapTransform<T>): Promise<T> {
    const { result, frame } = await this.repo.updateRecords((all) => {
      const plan = transform(all);
      const frame: Frame = [];
      for (const record of plan.records) {
        const old = all.find((r) => r.kind === record.kind && r.id === record.id);
        if (!old) continue;
        const fields: Change["field"][] = record.kind === "world" && record.id === this.worldId ? ["mapLayout"] : record.kind === "entry" ? ["mapCategory", "links", "activation"] : [];
        for (const field of fields) if (!equal(value(old, field), value(record, field))) {
          const change: Change = { kind: record.kind as Change["kind"], id: record.id, field, before: structuredClone(value(old, field)), after: structuredClone(value(record, field)) };
          const expected = this.baseline.get(key(change));
          if (expected && !equal(expected.after, change.before)) throw new MemoryConflictError();
          frame.push(change);
        }
      }
      return { ...plan, result: { result: plan.result, frame } };
    });
    if (frame.length) { this.push(frame); this.future = []; this.track(frame, false); }
    return result;
  }
  async undo() {
    const frame = this.past.at(-1); if (!frame) return this.layout();
    const layout = await this.restore(frame, true);
    this.past.pop(); this.future.push(frame); this.track(frame, true);
    return layout;
  }
  async redo() {
    const frame = this.future.at(-1); if (!frame) return this.layout();
    const layout = await this.restore(frame, false);
    this.future.pop(); this.push(frame); this.track(frame, false);
    return layout;
  }
  async reset() {
    const frame = [...this.baseline.values()].filter((c) => !equal(c.before, c.after));
    if (!frame.length) return this.layout();
    const layout = await this.restore(frame, true);
    const resetFrame = frame.map((c) => ({ ...c, before: c.after, after: c.before }));
    this.push(resetFrame); this.future = []; this.track(resetFrame, false);
    return layout;
  }
  private push(frame: Frame) { this.past.push(frame); if (this.past.length > 100) this.past.shift(); }
  private track(frame: Frame, reverse: boolean) {
    for (const change of frame) {
      const initial = this.baseline.get(key(change));
      this.baseline.set(key(change), { ...change, before: initial ? initial.before : change.before, after: reverse ? change.before : change.after });
    }
  }
  private async layout() {
    const world = await this.repo.get<WorldProfile>("world", this.worldId);
    if (!world) throw new MemoryConflictError();
    return structuredClone(world.mapLayout ?? emptyLayout());
  }
  private async restore(frame: Frame, reverse: boolean): Promise<LoreMapLayout> {
    return this.repo.updateRecords((all) => {
      const world = all.find((r) => r.kind === "world" && r.id === this.worldId);
      if (!world) throw new MemoryConflictError();
      const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
      const changed = new Map<string, DataRecord>();
      for (const change of frame) {
        const record = all.find((r) => r.kind === change.kind && r.id === change.id);
        if (!record || !equal(value(record, change.field), reverse ? change.after : change.before)) throw new MemoryConflictError();
        if (change.kind === "entry" && memoryWorld(record.data as MemoryEntry, books) !== this.worldId) throw new MemoryConflictError();
        const rowKey = `${change.kind}:${change.id}`;
        const next = changed.get(rowKey) ?? structuredClone(record);
        const restored = structuredClone(reverse ? change.before : change.after);
        const data = next.data as unknown as Record<string, unknown>;
        if (restored === undefined) delete data[change.field]; else data[change.field] = restored;
        data.updatedAt = Date.now(); changed.set(rowKey, next);
      }
      const nextWorld = (changed.get("world:" + this.worldId) ?? world).data as WorldProfile;
      const layout = nextWorld.mapLayout ?? emptyLayout(); validateLoreMapLayout(layout);
      const categories = new Set([...LORE_CATEGORIES.map((c) => c.id), "library", ...layout.customCategories.map((c) => c.id)]);
      const oldCategories = new Set([...LORE_CATEGORIES.map((c) => c.id), "library", ...((world.data as WorldProfile).mapLayout?.customCategories ?? []).map((c) => c.id)]);
      for (const row of all.filter((r) => r.kind === "entry")) {
        const old = row.data as MemoryEntry;
        if (memoryWorld(old, books) !== this.worldId) continue;
        const next = (changed.get("entry:" + row.id) ?? row).data as MemoryEntry;
        // Another window may have assigned additional entries to our new branch.
        if (next.mapCategory && !categories.has(next.mapCategory) && (oldCategories.has(next.mapCategory) || next.mapCategory !== old.mapCategory)) throw new MemoryConflictError();
        for (const link of next.links ?? []) if (!(old.links ?? []).some((l) => equal(l, link))) {
          const target = all.find((r) => r.kind === "entry" && r.id === link.targetId)?.data as MemoryEntry | undefined;
          if (!target || memoryWorld(target, books) !== this.worldId) throw new MemoryConflictError();
        }
      }
      return { records: [...changed.values()], removed: [], result: structuredClone(layout) };
    });
  }
}
