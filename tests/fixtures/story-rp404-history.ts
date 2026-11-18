import { characterRevision, EMPTY_STATUS } from "../../src/core/characters";
import { DEFAULT_SETTINGS } from "../../src/core/defaults";
import { assertStoryGraph } from "../../src/core/story-records";
import { validStoryFact, type StoryFact } from "../../src/core/story-update";
import type { Locale } from "../../src/core/types";
import { planStoryGame } from "../../src/storage/story-game";
import { sharedGameCommit } from "../../src/storage/world-game";
import { withPersistedEvidence } from "./story-persisted-evidence";
import type { Plot } from "./story-rp404-corpus";
import { storyWorld } from "./story-worlds";

export function makeHistory(plot: Plot, locale: Locale, perAct: number) {
  const lang = locale === "ru" ? 0 : 1;
  const base = storyWorld(locale);
  const local = (ru: string, en: string) => lang === 0 ? ru : en;
  base.world.name = plot.title[lang];
  base.world.description = "";
  base.world.contextBudget = 6000;
  for (const [i, person] of base.entities.entries()) {
    person.name = plot.cast[i]![lang];
    person.characterSheet!.protagonist = false;
  }
  const scene = base.binding.characterScenes![base.world.id]!;
  scene.presentIds = base.entities.map(p => p.id);
  scene.states = Object.fromEntries(base.entities.map(p => [p.id, { ...structuredClone(EMPTY_STATUS), stats: [] }]));
  base.records = base.records.filter(row => row.kind !== "entry");

  const sources = new Map<string, string>();
  const facts: StoryFact[] = [];
  function add(id: string, fact: StoryFact) {
    if (!validStoryFact(fact) || sources.has(fact.text)) throw Error("Invalid source: " + id);
    facts.push(fact);
    sources.set(fact.text, id);
  }
  for (let act = 0; act < 8; act++) {
    for (const beat of plot.beats.filter(row => row.act === act)) {
      const text = beat.prose[lang];
      const task = beat.task && { key: plot.id + "-" + beat.task[0][1], title: beat.task[0][lang], status: beat.task[1] };
      add(beat.id, { text, quote: text, kind: beat.kind, ...(task ? { task } : {}) });
    }
    for (let shift = 0; shift < perAct; shift++) {
      const n = act * perAct + shift, who = base.entities[n % base.entities.length]!.name;
      const topic = plot.shifts[(shift + act) % plot.shifts.length]![lang];
      const prefix = local(`Смена ${n + 1}, журнал дежурств. `, `Shift ${n + 1}, duty log. `);
      const note = plot.id === "radio" ? local("бланки фонотеки", "sound library forms") : local("этикетки для питомника", "nursery labels");
      const text = prefix + (shift % 7 === 0
        ? local(`${who}: «В канцелярию доставлены ${note}. Выдача расходных материалов закрыта».`, `${who} delivered ${note} to the office. The stationery request is closed.`)
        : topic + ".");
      const task = shift % 7 === 0 ? { key: "stationery-" + n, title: note + " " + (n + 1), status: "completed" as const } : undefined;
      add("shift-" + (n + 1), { kind: "event", text, quote: text, ...(task ? { task } : {}) });
    }
  }
  base.world.sharedGame = {
    version: 1, id: "persisted-game", revision: "persisted-revision", activationId: "persisted-activation",
    activeChatId: base.binding.chatId, activeBindingId: base.binding.id, managed: true,
    memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {},
    facts, factRoleSeeds: [], episodeSources: [], updatedAt: 20,
  };
  const evidence = withPersistedEvidence({ base, facts, important: [], questions: [], sources: [], seeds: [], s: local });
  // Start a managed branch via the same projection/compaction and archive path as RP346.
  const plan = planStoryGame(base.records, {
    chatId: base.binding.chatId, worldId: base.world.id, expectedBase: characterRevision(base.entities, scene),
    operation: "start", nativeParentKey: null, manual: "stop",
    snapshot: { chatId: base.binding.chatId, selectedNativeKey: null, messages: [] },
  }, DEFAULT_SETTINGS);
  const committed = sharedGameCommit(base.records, plan.records, plan.removed);
  const changed = new Set([...committed, ...plan.removed].map(r => r.kind + ":" + r.id));
  const records = [...base.records.filter(r => !changed.has(r.kind + ":" + r.id)), ...committed];
  assertStoryGraph(records);
  const byText = new Map(facts.map((fact, i) => [fact.text, {
    id: sources.get(fact.text)!, fact, revisionId: evidence.sources[i]!, roles: evidence.seeds[i]!.binding.roles,
  }]));
  return { records, byText, facts, worldId: base.world.id, chatId: base.binding.chatId };
}
