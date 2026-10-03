import type { MemoryBook, MemoryEntry, SceneEntity, StoryTemplate, WorldProfile, Locale } from "./types";
import { characterDescription } from "./characters";
import { classifyLoreEntry, inferTitlePeople, loreTitleMentions, LORE_CATEGORIES, readableLoreTitle } from "./lore-categories";

export type LoreNodeKind = "world" | "branch" | "book" | "entry" | "character" | "location" | "group" | "template";
export interface LoreNode { id: string; recordId: string; kind: LoreNodeKind; title: string; content: string; x: number; y: number; parentId?: string; categoryId?: string; color: string; count: number; confidence?: string; matches?: string[]; inferredToken?: string; inferredEntryIds?: string[] }
export interface LoreEdge { id: string; from: string; to: string; label: string; kind: "branch" | "context" | "reference" | "entity" }
export interface LoreGraph { nodes: LoreNode[]; edges: LoreEdge[]; width: number; height: number }
export const LORE_ORBIT_RADIUS = 520;
export function loreOrbitRadius(branches: number): number {
  // A wider orbit for additional custom roots keeps the starting layout symmetric
  // without squeezing rectangular labels into one another.
  return branches > 1 ? Math.max(LORE_ORBIT_RADIUS, Math.ceil(Math.hypot(290, 120) / (2 * Math.sin(Math.PI / branches)))) : LORE_ORBIT_RADIUS;
}

/** Include outer cards where possible, without shrinking controls below the usable scale. */
export function loreOverviewZoom(graph: LoreGraph, width: number, height: number): number {
  const root = graph.nodes[0]; if (!root) return 0.6;
  const halfWidth = Math.max(...graph.nodes.map((node) => Math.abs(node.x - root.x) + 155));
  const halfHeight = Math.max(...graph.nodes.map((node) => Math.abs(node.y - root.y) + (node.kind === "world" ? 90 : 70)));
  return Math.max(0.25, Math.min(0.6, (width - 40) / (halfWidth * 2), (height - 40) / (halfHeight * 2)));
}

export function buildLoreGraph(input: { locale?: Locale; world: WorldProfile; books: MemoryBook[]; entries: MemoryEntry[]; entities: SceneEntity[]; templates: StoryTemplate[]; labels: { memory: string; characters: string; locations: string; groups: string; templates: string }; categoryLabel?: (id: string) => string }): LoreGraph {
  const nodes: LoreNode[] = []; const edges: LoreEdge[] = []; const edgeKeys = new Set<string>();
  const byId = new Map<string, LoreNode>();
  const rootId = "world:" + input.world.id;
  const add = (kind: LoreNodeKind, id: string, title: string, content: string, parentId?: string, extra: Partial<LoreNode> = {}) => {
    const key = kind + ":" + id;
    const existing = byId.get(key); if (existing) return existing;
    const node: LoreNode = { id: key, recordId: id, kind, title: kind === "branch" ? input.world.mapLayout?.categoryNames?.[id] ?? title : title, content, x: 2400, y: 2400, parentId, color: parentId ? byId.get(parentId)?.color ?? "#a3c6e7" : input.world.color, count: 0, ...extra };
    nodes.push(node); byId.set(key, node);
    return node;
  };
  const edge = (from: string, to: string, kind: LoreEdge["kind"] = "branch", label = "") => {
    const key = kind + ":" + from + ":" + to;
    if (from !== to && !edgeKeys.has(key)) { edgeKeys.add(key); edges.push({ id: key, from, to, kind, label }); }
  };
  add("world", input.world.id, input.world.name, input.world.description);
  const definitions = new Map<string, { id: string; parentId: string | null; title: string; color?: string }>(LORE_CATEGORIES.map((c) => [c.id, { id: c.id, parentId: c.parentId, title: input.categoryLabel?.(c.id) ?? c.en, color: "color" in c ? c.color : undefined }]));
  definitions.set("library", { id: "library", parentId: null, title: input.labels.memory, color: "#a2b9d5" });
  for (const c of input.world.mapLayout?.customCategories ?? []) if (!definitions.has(c.id)) definitions.set(c.id, c);
  const building = new Set<string>();
  const category = (id: string): LoreNode => {
    const existing = byId.get("branch:" + id); if (existing) return existing;
    if (!definitions.has(id) || building.has(id)) id = "unclassified";
    const d = definitions.get(id)!; building.add(id);
    const parent = d.parentId ? category(d.parentId).id : rootId;
    const value = add("branch", d.id, input.world.mapLayout?.categoryNames?.[d.id] ?? d.title, "", parent, { categoryId: d.id, color: d.color ?? byId.get(parent)?.color });
    building.delete(id); return value;
  };
  for (const c of definitions.values()) if (!c.parentId) category(c.id);
  const people = inferTitlePeople(input.entries, input.entities);
  const inferredByEntry = new Map(people.flatMap((person) => person.entryIds.map((id) => [id, person] as const)));
  const entityNodes = new Map<string, LoreNode>();
  for (const entity of input.entities) entityNodes.set(entity.id, add(entity.kind, entity.id, entity.name, characterDescription(entity, input.locale), category(entity.kind === "character" ? "characters" : entity.kind === "location" ? "locations" : "groups").id));
  for (const person of people) add("branch", "person:" + person.token, person.name, "", category("characters").id, { inferredToken: person.token, inferredEntryIds: person.entryIds, confidence: "inferred" });
  for (const entry of input.entries) {
    const classification = classifyLoreEntry(entry);
    const profile = (entry.entityIds ?? []).map((id) => entityNodes.get(id)).find((node) => node?.kind === "character");
    const named = input.entities.filter((entity) => entity.kind === "character" && [entity.name, ...entity.aliases].some((alias) => loreTitleMentions(entry.title, alias)));
    if (classification.confidence !== "manual" && classification.categoryId === "unclassified" && (inferredByEntry.has(entry.id) || profile || named.length === 1)) classification.categoryId = "character-info";
    const definition = definitions.get(classification.categoryId);
    const categoryId = definition ? classification.categoryId : "unclassified";
    let parent = "";
    if (definition?.parentId === "characters") {
      const person = inferredByEntry.get(entry.id);
      const personNode = profile ?? (named.length === 1 ? entityNodes.get(named[0]!.id) : undefined) ?? (person ? byId.get("branch:person:" + person.token) : undefined);
      if (personNode) parent = add("branch", "detail:" + personNode.recordId + ":" + categoryId, input.world.mapLayout?.categoryNames?.[categoryId] ?? definition.title, "", personNode.id, { categoryId, color: personNode.color }).id;
    }
    if (!parent) parent = category(categoryId).id;
    add("entry", entry.id, readableLoreTitle(entry.title), entry.content, parent, { categoryId, confidence: classification.confidence, matches: classification.matches });
  }
  for (const book of input.books) add("book", book.id, book.name, book.description, category("library").id);
  for (const template of input.templates) add("template", template.id, template.name, [template.opening, template.initialState].filter(Boolean).join("\n\n"), category("templates").id);
  // Fold dense branches into small pages; each record still has exactly one node.
  const grouped = new Map<string, LoreNode[]>();
  for (const node of nodes) if (node.kind === "entry" && node.parentId) { const items = grouped.get(node.parentId) ?? []; items.push(node); grouped.set(node.parentId, items); }
  for (const [parentId, items] of grouped) if (items.length > 10) {
    items.sort((a, b) => a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id));
    items.forEach((node, i) => {
      const page = Math.floor(i / 10); const parent = byId.get(parentId)!;
      const folder = add("branch", "page:" + parent.recordId + ":" + page, String(page * 10 + 1) + "–" + String(Math.min(items.length, page * 10 + 10)), "", parentId, { categoryId: parent.categoryId, color: parent.color });
      node.parentId = folder.id;
    });
  }
  for (const node of nodes) if (node.parentId) edge(node.parentId, node.id);
  const children = new Map<string, LoreNode[]>();
  for (const node of nodes) if (node.parentId) { const list = children.get(node.parentId) ?? []; list.push(node); children.set(node.parentId, list); }
  const roots = children.get(rootId) ?? [];
  const radius = loreOrbitRadius(roots.length);
  const origin = Math.max(2400, radius + 800);
  const root = byId.get(rootId)!; root.x = origin; root.y = origin;
  const definitionOrder = new Map([...definitions.keys()].map((id, index) => [id, index]));
  const entryTitles = new Map(input.entries.map((entry) => [entry.id, entry.title]));
  const stableTitle = (node: LoreNode) => node.kind === "entry" ? entryTitles.get(node.recordId) ?? node.recordId : node.recordId;
  // Sorting is based on identity/original titles, never on decorative branch labels.
  for (const [parentId, items] of children) if (parentId !== rootId) items.sort((a, b) =>
    (definitionOrder.get(a.recordId) ?? 1000) - (definitionOrder.get(b.recordId) ?? 1000) || stableTitle(a).localeCompare(stableTitle(b), "en", { numeric: true }) || a.id.localeCompare(b.id));
  type Footprint = { along: number; across: number; offsets: { node: LoreNode; along: number; across: number }[] };
  const footprints = new Map<string, Footprint>();
  const measure = (parent: LoreNode, angle: number, depth: number): Footprint => {
    const cardAlong = Math.abs(Math.cos(angle)) * 315 + Math.abs(Math.sin(angle)) * 140;
    const cardAcross = Math.abs(Math.sin(angle)) * 315 + Math.abs(Math.cos(angle)) * 140;
    const items = depth > 128 ? [] : children.get(parent.id) ?? [];
    const cols = Math.min(3, Math.max(1, items.length));
    const offsets: Footprint["offsets"] = []; let along = 370; let across = cardAcross;
    for (let row = 0; row < items.length; row += cols) {
      const rowItems = items.slice(row, row + cols);
      const sizes = rowItems.map((node) => { const size = measure(node, angle, depth + 1); footprints.set(node.id, size); return size; });
      const width = sizes.reduce((sum, size) => sum + size.across, 0) + (sizes.length - 1) * 90;
      across = Math.max(across, width); let lane = -width / 2;
      rowItems.forEach((node, index) => { const size = sizes[index]!; offsets.push({ node, along, across: lane + size.across / 2 }); lane += size.across + 90; });
      // Reserve the whole child subtree, not just its label. Dense pages no
      // longer land on top of the next row or neighbouring character details.
      along += Math.max(...sizes.map((size) => size.along)) + 180;
    }
    return { along: items.length ? along - 180 : cardAlong, across, offsets };
  };
  const place = (parent: LoreNode, angle: number) => {
    for (const offset of footprints.get(parent.id)?.offsets ?? []) {
      offset.node.x = parent.x + Math.cos(angle) * offset.along - Math.sin(angle) * offset.across;
      offset.node.y = parent.y + Math.sin(angle) * offset.along + Math.cos(angle) * offset.across;
      place(offset.node, angle);
    }
  };
  roots.forEach((node, i) => { const angle = -Math.PI / 2 + i * 2 * Math.PI / roots.length; node.x = origin + Math.cos(angle) * radius; node.y = origin + Math.sin(angle) * radius; footprints.set(node.id, measure(node, angle, 1)); place(node, angle); });
  // Translate the complete automatic constellation together rather than
  // individually clamping nodes, which destroys symmetric sibling spacing.
  const shiftX = Math.max(0, 80 - Math.min(...nodes.map((node) => node.x)));
  const shiftY = Math.max(0, 80 - Math.min(...nodes.map((node) => node.y)));
  for (const node of nodes) { node.x += shiftX; node.y += shiftY; }
  const used = new Set<string>();
  for (const node of nodes) {
    let x = node.x; let y = node.y;
    while (used.has(x + ":" + y)) { x += 17; y += 23; }
    x = Math.max(80, x); y = Math.max(80, y);
    while (used.has(x + ":" + y)) { x += 17; y += 23; }
    used.add(x + ":" + y); node.x = x; node.y = y;
    const saved = input.world.mapLayout?.positions[node.id];
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { node.x = Math.max(80, Math.min(12000, saved.x)); node.y = Math.max(80, Math.min(12000, saved.y)); }
    if (node.kind === "entry") { let p = node.parentId; const seen = new Set<string>(); while (p && !seen.has(p)) { seen.add(p); const parent = byId.get(p); if (!parent) break; parent.count += 1; p = parent.parentId; } }
  }
  for (const entry of input.entries) {
    for (const link of entry.links ?? []) if (byId.has("entry:" + link.targetId)) edge("entry:" + entry.id, "entry:" + link.targetId, link.mode, link.label);
    for (const id of entry.entityIds ?? []) { const entity = entityNodes.get(id); if (entity) edge(entity.id, "entry:" + entry.id, "entity"); }
  }
  for (const entity of input.entities) for (const id of entity.memberIds) { const a = entityNodes.get(entity.id); const b = entityNodes.get(id); if (a && b) edge(a.id, b.id, "entity"); }
  return { nodes, edges, width: Math.max(4800, ...nodes.map((n) => n.x + 300)), height: Math.max(4800, ...nodes.map((n) => n.y + 220)) };
}

export function visibleLoreNodes(graph: LoreGraph, expandedIds: Iterable<string>): Set<string> {
  const expanded = new Set(expandedIds); const visible = new Set<string>();
  const root = graph.nodes[0]; if (!root) return visible; visible.add(root.id);
  for (let i = 0; i < 16; i++) {
    let changed = false;
    for (const node of graph.nodes) if (node.parentId && visible.has(node.parentId) && (node.parentId === root.id || expanded.has(node.parentId)) && !visible.has(node.id)) { visible.add(node.id); changed = true; }
    if (!changed) break;
  }
  return visible;
}

/** Every expandable node, including nested profile details and dense-entry pages. */
export function loreExpandedIds(graph: LoreGraph): string[] {
  const parents = new Set(graph.nodes.map((node) => node.parentId).filter(Boolean));
  return graph.nodes.filter((node) => node.kind !== "world" && parents.has(node.id)).map((node) => node.id);
}

export function loreAncestors(graph: LoreGraph, id: string): string[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n])); const result: string[] = []; const seen = new Set<string>();
  let parent = byId.get(id)?.parentId;
  while (parent && !seen.has(parent)) { result.push(parent); seen.add(parent); parent = byId.get(parent)?.parentId; }
  return result;
}

/** Organizational descendants, including collapsed pages. Never follows lore links. */
export function loreBranchEntryIds(graph: LoreGraph, branchId: string): string[] {
  const children = new Map<string, LoreNode[]>();
  for (const node of graph.nodes) if (node.parentId) { const list = children.get(node.parentId) ?? []; list.push(node); children.set(node.parentId, list); }
  const queue = [branchId]; const seen = new Set<string>(); const entries: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!; if (seen.has(id)) continue; seen.add(id);
    for (const child of children.get(id) ?? []) { if (child.kind === "entry") entries.push(child.recordId); else queue.push(child.id); }
  }
  return entries.sort();
}

/** Pack only the open neighbourhood. User positions remain authoritative. */
export function arrangeVisibleLore(graph: LoreGraph, expandedIds: string[], positions: Record<string, { x: number; y: number }>): LoreGraph {
  const visible = visibleLoreNodes(graph, expandedIds);
  // Pack the automatic baseline first. User positions never repel neighbours or
  // translate unselected descendants; overlaps after a manual edit are intentional.
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const original = new Map(graph.nodes.map((node) => [node.id, node]));
  const root = nodes[0]!;
  // The primary orbit is sacred: packing descendants must never break its symmetry.
  const occupied = nodes.filter((node) => visible.has(node.id) && (node.id === root.id || node.parentId === root.id));
  const automatic = nodes.filter((node) => visible.has(node.id) && node.id !== root.id && node.parentId !== root.id).sort((a, b) => loreAncestors(graph, a.id).length - loreAncestors(graph, b.id).length || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const node of automatic) {
    const parent = byId.get(node.parentId ?? ""); const oldParent = original.get(node.parentId ?? "");
    if (parent && oldParent) { node.x += parent.x - oldParent.x; node.y += parent.y - oldParent.y; }
    const dx = node.x - root.x; const dy = node.y - root.y; const distance = Math.hypot(dx, dy) || 1;
    let steps = 0;
    while (occupied.some((other) => Math.abs(node.x - other.x) < 315 && Math.abs(node.y - other.y) < (other.kind === "world" ? 165 : 140)) && steps++ < 240) {
      node.x = Math.max(80, node.x + dx / distance * 40); node.y = Math.max(80, node.y + dy / distance * 40);
    }
    occupied.push(node);
  }
  const placed = nodes.map((node) => ({ ...node, ...(positions[node.id] ?? {}) }));
  return { ...graph, nodes: placed, width: Math.max(graph.width, ...placed.map((n) => n.x + 300)), height: Math.max(graph.height, ...placed.map((n) => n.y + 200)) };
}
