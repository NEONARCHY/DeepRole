import { describe, expect, it } from "vitest";
import { classifyLoreEntry, inferTitlePeople, validateLoreMapLayout } from "../src/core/lore-categories";
import { suggestLoreConnections } from "../src/core/entry-links";
import { arrangeVisibleLore, buildLoreGraph, LORE_ORBIT_RADIUS, visibleLoreNodes, loreAncestors, loreOverviewZoom, loreOrbitRadius } from "../src/core/lore-map";
import type { MemoryEntry, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "Test world", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const memory = (title: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({ id: title, worldId: "w", bookId: null, title, content: "Original text", keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1, ...extra });
const labels = { memory: "Books", characters: "Characters", locations: "Locations", groups: "Groups", templates: "Templates" };
describe("transparent local lore classification", () => {
  it.each([
    ["Мира — астроном", "Мире 32 года. Она приехала в обсерваторию."],
    ["Олег — смотритель", "Олегу 54 года. Он хранит ключи."],
    ["Mira — astronomer", "Mira is 32 years old. She works at the observatory."],
    ["Oleg — caretaker", "Oleg, 54 years old. He keeps the keys."],
  ])("recognizes a named age opening without changing facts: %s", (title, content) => {
    const entry = memory(title, { content }); const before = structuredClone(entry);
    expect(classifyLoreEntry(entry).categoryId).toBe("character-info");
    expect(entry).toEqual(before);
  });
  it("does not treat incidental ages or an explicit scene/place as a character profile", () => {
    expect(classifyLoreEntry(memory("Заметка", { content: "Мире 32 года." })).categoryId).toBe("unclassified");
    expect(classifyLoreEntry(memory("Mira notes", { content: "Later, Mira is 32 years old." })).categoryId).toBe("unclassified");
    expect(classifyLoreEntry(memory("Scene Mira arrival", { content: "Mira is 32 years old." })).categoryId).toBe("events");
    for (const title of ["Северная обсерватория", "Northern observatory"]) expect(classifyLoreEntry(memory(title)).categoryId).toBe("locations");
  });
  it.each([
    ["Мира_тело_описание", "body"], ["Mira_personality", "personality"], ["Мира_мысли", "thoughts"], ["World_rules", "world-rules"],
    ["Правила_чата", "chat-rules"], ["User_settings", "user-settings"], ["Правки_ограничения", "corrections"], ["Неделя_третья", "weeks"],
    ["Мира_четверг_19", "days"], ["Сцена_встречи", "events"], ["Мира_внешность", "appearance"], ["Семейные отношения", "relationships"],
    ["Принцип_тело_описание", "extra-rules"], ["Принцип_темп", "storytelling"], ["Северная_башня", "locations"], ["Настройки_фетишей", "fetishes"],
    ["MiraBody", "body"], ["Mira.Personalities", "personality"], ["Character: Mira — Appearance", "appearance"], ["Mira / Bodies", "body"],
    ["Writing style", "storytelling"], ["DialogueFormat", "chat-rules"], ["UserPreferences", "user-settings"], ["Character sheet", "character-info"],
  ])("classifies %s as %s, including underscored titles and forms", (title, category) => {
    expect(classifyLoreEntry(memory(title)).categoryId).toBe(category);
  });
  it("keeps ambiguous prose unclassified, explains evidence and honors manual categories", () => {
    const source = memory("Заметка", { content: "Город, семейные отношения, тело, характер и мысли. Ничего конкретного." });
    const original = structuredClone(source);
    expect(classifyLoreEntry(source).confidence).toBe("uncertain");
    expect(classifyLoreEntry({ ...source, mapCategory: "custom-test" })).toEqual({ categoryId: "custom-test", confidence: "manual", matches: [] });
    expect(classifyLoreEntry(memory("Mira_body")).matches).toContain("body");
    expect(source).toEqual(original);
  });
  it("offers repeated name prefixes without generating canonical characters", () => {
    const entries = [memory("Мира_тело"), memory("Мира_характер"), memory("Принцип_тело"), memory("Принцип_характер"), memory("Сцена_тело"), memory("Сцена_характер")];
    const before = structuredClone(entries);
    expect(inferTitlePeople(entries, [])).toEqual([{ token: "мира", name: "Мира", entryIds: ["Мира_тело", "Мира_характер"] }]);
    expect(entries).toEqual(before);
  });
  it("anchors name groups in a character record and recognizes bilingual title references", () => {
    const entries = [memory("Мира_Mira_тело"), memory("Mira_тайна"), memory("Сцена_Мира_встреча"), memory("Принцип_темп")];
    expect(inferTitlePeople(entries, [])).toEqual([{ token: "мира", name: "Мира", aliases: ["mira"], entryIds: [entries[0]!.id, entries[1]!.id, entries[2]!.id] }]);
    const graph = buildLoreGraph({ world, labels, entries, books: [], entities: [], templates: [] });
    expect(graph.nodes.find((n) => n.id === "entry:Mira_тайна")?.categoryId).toBe("character-info");
    expect(graph.nodes.find((n) => n.id === "entry:Сцена_Мира_встреча")?.categoryId).toBe("events");
  });
  it("handles varied English names without merging namesakes or Russian world rules", () => {
    const entries = [memory("MiraBody"), memory("Character: Mira — Appearance"), memory("Mary Jane - Body"), memory("Biography: Mary Jane"), memory("Мира_тело"), memory("Мира_мысли"), memory("Правила_мира"), memory("Admiral Appearance")];
    const groups = inferTitlePeople(entries, []);
    expect(groups.find((g) => g.token === "mira")?.entryIds).toEqual([entries[0]!.id, entries[1]!.id]);
    expect(groups.find((g) => g.token === "mary jane")?.entryIds).toEqual([entries[2]!.id, entries[3]!.id]);
    expect(groups.find((g) => g.token === "мира")?.entryIds).not.toContain(entries[6]!.id);
    expect(groups.some((g) => g.token === "admiral")).toBe(false);
  });
  it("does not let decorative folders change character-name matching", () => {
    const entries = [memory("Mira_body"), memory("Mira_personality"), memory("Scene_Mira_arrival")];
    const original = inferTitlePeople(entries, []);
    expect(inferTitlePeople(entries.map((entry) => ({ ...entry, mapCategory: "custom-not-a-character" })), [])).toEqual(original);
  });
  it.each([
    ["Scene_Mira_body_tower", "events"], ["Сцена_Мира_тело_башня", "events"],
    ["Relationship_Mira_appearance", "relationships"], ["Связь_Мира_характер", "relationships"],
    ["Day3_Mira", "days"], ["Неделя2_Мира", "weeks"],
  ])("recognizes the subject of a structured title: %s", (title, category) => {
    expect(classifyLoreEntry(memory(title)).categoryId).toBe(category);
  });
  it("keeps incidental body words from overpowering an explicit title", () => {
    expect(classifyLoreEntry(memory("Mira personality", { content: "The body, physique, hair, eyes, appearance, age and profile were described earlier." })).categoryId).toBe("personality");
  });
});
describe("connection precision", () => {
  it("recognizes Russian forms, but not distant generic words or a shared profile alone", () => {
    const target = memory("Северная башня", { id: "tower" });
    const source = memory("Сцена", { id: "source", content: "Мы подошли к северной башне.", entityIds: ["mira"] });
    expect(suggestLoreConnections(source, [target])[0]?.reason).toBe("mention");
    expect(suggestLoreConnections({ ...source, content: "Северная тропа. Далее идёт длинное описание. В конце стоит башня." }, [target])).toEqual([]);
    expect(suggestLoreConnections(source, [memory("Мира тело", { keywords: ["тело", "сцена"], entityIds: ["mira"] })])).toEqual([]);
    expect(source.links).toBeUndefined();
  });
  it("requires specific evidence, excludes existing links and caps suggestions", () => {
    const source = memory("A", { keywords: ["серебряный", "амулет", "тело", "сцена"] });
    const targets = Array.from({ length: 10 }, (_, i) => memory("B" + i, { keywords: ["серебряный", "амулет"] }));
    expect(suggestLoreConnections(source, targets)).toHaveLength(5);
    expect(suggestLoreConnections({ ...source, links: [{ targetId: targets[0]!.id, mode: "reference", label: "possible" }] }, [source, targets[0]!])).toEqual([]);
  });
});
describe("radial organization", () => {
  it("has a centered world, foldable thematic branches, unique entries and no automatic lore edges", () => {
    const entries = Array.from({ length: 60 }, (_, i) => memory("Мира_тело_" + i));
    const graph = buildLoreGraph({ world, labels, books: [], entities: [], templates: [], entries });
    const center = graph.nodes[0]!;
    expect(center.x).toBeGreaterThanOrEqual(2400); expect(center.y).toBeGreaterThanOrEqual(2400);
    const roots = graph.nodes.filter((n) => n.parentId === graph.nodes[0]!.id);
    expect(roots.some((n) => n.x < center.x)).toBe(true); expect(roots.some((n) => n.x > center.x)).toBe(true);
    expect(roots.some((n) => n.y < center.y)).toBe(true); expect(roots.some((n) => n.y > center.y)).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === "entry")).toHaveLength(60);
    expect(graph.edges.every((edge) => edge.kind === "branch")).toBe(true);
    expect(visibleLoreNodes(graph, []).size).toBe(roots.length + 1);
    const first = graph.nodes.find((n) => n.kind === "entry")!;
    const visible = visibleLoreNodes(graph, loreAncestors(graph, first.id));
    expect(visible.has(first.id)).toBe(true);
    expect([...visible].filter((id) => id.startsWith("entry:"))).toHaveLength(10);
  });
  it("uses manual positions and custom categories without changing lore", () => {
    const layout = { positions: { "entry:a": { x: 1700, y: 2000 } }, expandedIds: ["branch:custom-extra"], customCategories: [{ id: "custom-extra", title: "My branch", parentId: null }] };
    const entry = memory("a", { mapCategory: "custom-extra" });
    const graph = buildLoreGraph({ world: { ...world, mapLayout: layout }, labels, entries: [entry], books: [], entities: [], templates: [] });
    expect(graph.nodes.find((n) => n.id === "entry:a")).toMatchObject({ x: 1700, y: 2000, parentId: "branch:custom-extra" });
    expect(entry.content).toBe("Original text");
  });
  it("separates automatic visible cards without overriding user placements", () => {
    const graph = buildLoreGraph({ world, labels, books: [], entities: [], templates: [], entries: [memory("Северная башня"), memory("Мост"), memory("Комната"), memory("Озеро")] });
    const expanded = ["branch:locations"];
    const arranged = arrangeVisibleLore(graph, expanded, {});
    const visible = arranged.nodes.filter((n) => visibleLoreNodes(graph, expanded).has(n.id));
    for (const node of visible) for (const other of visible) if (node.id !== other.id) expect(Math.abs(node.x - other.x) >= 280 || Math.abs(node.y - other.y) >= 90).toBe(true);
    const fixed = { "entry:Мост": { x: 2100, y: 2100 } };
    expect(arrangeVisibleLore(graph, expanded, fixed).nodes.find((n) => n.id === "entry:Мост")).toMatchObject(fixed["entry:Мост"]);
  });
  it("keeps the initial orbit exactly rotationally symmetric regardless of entry counts or expansion", () => {
    const graph = buildLoreGraph({ world, labels, books: [], entities: [], templates: [], entries: Array.from({ length: 60 }, (_, i) => memory("Мира_тело_" + i)) });
    const roots = graph.nodes.filter((n) => n.parentId === "world:w");
    const center = graph.nodes[0]!;
    for (const root of roots) {
      expect(Math.hypot(root.x - center.x, root.y - center.y)).toBeCloseTo(LORE_ORBIT_RADIUS, 6);
      expect(roots.some((n) => Math.abs(n.x - (2 * center.x - root.x)) < 0.001 && Math.abs(n.y - root.y) < 0.001)).toBe(true);
    }
    const arranged = arrangeVisibleLore(graph, graph.nodes.map((n) => n.id), {});
    for (const node of roots) expect(arranged.nodes.find((n) => n.id === node.id)).toMatchObject({ x: node.x, y: node.y });
  });
  it("fits the symmetric overview to a compact window without moving its nodes", () => {
    const graph = buildLoreGraph({ world, labels, books: [], entities: [], templates: [], entries: [] });
    const compact = loreOverviewZoom(graph, 680, 550);
    expect(compact).toBeLessThan(0.6);
    for (const node of graph.nodes.filter((n) => n.parentId === "world:w")) {
      expect((Math.abs(node.x - 2400) + 155) * compact).toBeLessThanOrEqual(320);
      expect((Math.abs(node.y - 2400) + 70) * compact).toBeLessThanOrEqual(255);
    }
    expect(loreOverviewZoom(graph, 1800, 1400)).toBe(0.6);
  });
  it("widens the symmetric orbit when many custom root branches are added", () => {
    const mapLayout = { positions: {}, expandedIds: [], customCategories: Array.from({ length: 20 }, (_, i) => ({ id: "custom-" + i, title: "Branch " + i, parentId: null })) };
    const graph = buildLoreGraph({ world: { ...world, mapLayout }, labels, books: [], entities: [], templates: [], entries: [] });
    const root = graph.nodes[0]!; const primary = graph.nodes.filter((n) => n.parentId === root.id);
    expect(primary).toHaveLength(30);
    expect(loreOrbitRadius(primary.length)).toBeGreaterThan(LORE_ORBIT_RADIUS);
    for (const node of primary) {
      expect(Math.hypot(node.x - root.x, node.y - root.y)).toBeCloseTo(loreOrbitRadius(primary.length), 6);
      for (const other of primary) if (node.id !== other.id) expect(Math.abs(node.x - other.x) >= 290 || Math.abs(node.y - other.y) >= 120).toBe(true);
    }
  });
  it("considers outer cards while keeping the usable minimum scale", () => {
    const model = buildLoreGraph({ world, labels, books: [], entities: [], templates: [], entries: Array.from({ length: 60 }, (_, i) => memory("Mira body " + i)) });
    const graph = arrangeVisibleLore(model, model.nodes.map((node) => node.id), {});
    const zoom = loreOverviewZoom(graph, 6000, 6000); const root = graph.nodes[0]!;
    for (const node of graph.nodes) {
      expect((Math.abs(node.x - root.x) + 155) * zoom).toBeLessThanOrEqual(2980 + 1e-6);
      expect((Math.abs(node.y - root.y) + (node.kind === "world" ? 90 : 70)) * zoom).toBeLessThanOrEqual(2980 + 1e-6);
    }
    expect(loreOverviewZoom(graph, 1260, 420)).toBe(0.25);
  });
  it("rejects infinite positions, dangling category parents and recursive branches", () => {
    const layout = { positions: {}, expandedIds: [], customCategories: [] };
    expect(() => validateLoreMapLayout(layout)).not.toThrow();
    for (const patch of [
      { positions: { a: { x: Infinity, y: 0 } } },
      { customCategories: [{ id: "custom-a", title: "A", parentId: "missing" }] },
      { customCategories: [{ id: "custom-a", title: "A", parentId: "custom-b" }, { id: "custom-b", title: "B", parentId: "custom-a" }] },
    ]) expect(() => validateLoreMapLayout({ ...layout, ...patch })).toThrow();
  });
});
