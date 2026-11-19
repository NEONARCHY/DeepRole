import { expect, it } from "vitest";
import { characterRevision } from "../src/core/characters";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { assertStoryGraph, type StoryRecord } from "../src/core/story-records";
import { compileGameContext } from "../src/core/game-context";
import { decodeStoryMemory } from "../src/core/story-memory-transport";
import { readTaskArchive } from "../src/core/story-task-archive";
import { awaitingTransferredContext } from "../src/core/memory-delivery-view";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame } from "../src/storage/story-game";
import { activateWorldGame } from "../src/storage/world-game";
import { makeHistory } from "./fixtures/story-rp404-history";
import { plots } from "./fixtures/story-rp404-corpus";
import { probes } from "./fixtures/story-rp404-expectations";

it("carries the archived promise through two chats without reopening the completed task", async () => {
  const fixture = makeHistory(plots.find(p => p.id === "orchard")!, "ru", 0);
  const db = new DeepRoleDatabase("orchard-" + crypto.randomUUID()), repo = new DeepRoleRepository(db);
  const worldId = fixture.worldId;
  try {
    await repo.mergeRecords(fixture.records);
    const entities = await repo.list<SceneEntity>("entity");
    for (let turn = 0; turn < 2; turn++) {
      const old = (await repo.get<WorldProfile>("world", worldId))!;
      const chatId = crypto.randomUUID(), chatUrl = "https://chat.deepseek.com/a/chat/s/" + chatId;
      await repo.put<ChatBinding>("binding", { id: "binding:" + chatId, chatId, chatUrl, worldId, bookId: null,
        messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 });
      const game = await activateWorldGame({ worldId, chatId, chatUrl, mode: "attach", expectedRevision: old.sharedGame!.revision }, repo);
      const binding = (await repo.get<ChatBinding>("binding", game.activeBindingId))!;
      if (turn === 1) {
        binding.characterScenes = { ...binding.characterScenes, [worldId]: {
          revision: crypto.randomUUID(), states: {}, presentIds: [entities[0]!.id], updatedAt: Date.now(),
        } };
        await repo.put("binding", binding);
      }
      await runStoryGame({ chatId, worldId, operation: "start", expectedBase: characterRevision(entities, binding.characterScenes?.[worldId]),
        nativeParentKey: null, manual: "stop", snapshot: { chatId, messages: [], selectedNativeKey: null } }, DEFAULT_SETTINGS, repo);
      const world = (await repo.get<WorldProfile>("world", worldId))!;
      expect(world.sharedGame!.facts).toEqual(old.sharedGame!.facts);
      const records = await repo.list<StoryRecord>("story");
      if (turn === 1) expect(world.sharedGame!.activeBindingId).not.toBe(game.activeBindingId);
      const branch = records.find(r => r.type === "projection" && r.bindingId === world.sharedGame!.activeBindingId)!.branchId;
      const activeBinding = (await repo.get<ChatBinding>("binding", world.sharedGame!.activeBindingId))!;
      const checkpoint = records.find(r => r.type === "baseline" && r.branchId === branch);
      if (checkpoint?.type !== "baseline") throw Error("Missing checkpoint");
      const stamp = checkpoint.createdAt + 1;
      const receipt = {format:"deeprole-story-dispatch", contractVersion:1, id:"accepted-first", worldId, bindingId:activeBinding.id,
        identity:{chatId,nativeParentKey:null}, ownerTabId:1, origin:"local", purpose:"user-turn", transport:"fetch",
        sceneRevision:null, originalDraft:"Question", proposedContext:"Game", injection:"context", started:true,
        delivery:{status:"accepted",httpStatus:200}, wire:{phase:"waiting",link:null,sawFinish:false,issue:null}, createdAt:stamp, updatedAt:stamp};
      expect(awaitingTransferredContext(world,activeBinding,records,[])).toBe(true);
      expect(awaitingTransferredContext(world,activeBinding,records,[{...receipt,origin:"restored"},{...receipt,injection:"none"},{...receipt,bindingId:"elsewhere"}])).toBe(true);
      expect(awaitingTransferredContext(world,activeBinding,records,[receipt])).toBe(false);
      if (turn === 1) delete checkpoint.priorTaskSeeds; // Older installs lost the link on the receiving checkpoint.
      const taskArchive = readTaskArchive(records, world, branch);
      const q = probes.orchard!.find(p => p.id === "ambiguous")!, discussion = q.recent![0]![0];
      const checks = [
        {draft:"Сначала заглядываю под кальку на листе для кружка, потом осматриваю канаву у нижнего ряда и подшиваю расписку учебного сада. Какие условия ещё висят, что видно под калькой и за что расписалась Нина?",recent:[],expected:["lower","map","overlay","privacy","pump","receipt"],compound:true},
        {draft:"Что случилось с просьбой гербария о грушевых ветках?",recent:[],expected:["spare"],herbarium:true},
        {draft:probes.orchard!.find(p=>p.id==="reverse-actions")!.draft[0],recent:[],expected:["lower","map","overlay","privacy","pump","receipt"],compound:true},
        {draft:"Можно срезать для питомника те, что перевязаны жёлтыми лентами, раз батарею уже заменили? Кто должен резать?", recent: [], expected:["lower","pump","tags"], unverified:true},
        {draft: probes.orchard!.find(p => p.id === "free")!.draft[0], recent: [], expected: ["lower","pump","tags"]},
        {draft: probes.orchard!.find(p => p.id === "completed")!.draft[0], recent: [], expected: ["inspection","receipt","upper"]},
        {draft: probes.orchard!.find(p => p.id === "owner-upper")!.draft[0], recent: [], expected: ["receipt","upper"]},
        {draft: q.draft[0], recent: [discussion], expected: ["lower","receipt","upper"]},
        {draft: "Нина говорит о двух связках одного сорта для разных мест. " + q.draft[0], recent: [], expected: ["lower","receipt","upper"]},
        {draft: q.draft[0], recent: [discussion,"Я имею в виду питомник."], expected: ["lower"]},
        {draft: "Я имею в виду питомник. Что именно ей пообещали?", recent: [discussion, q.draft[0]], expected: ["lower"]},
        {draft: "Я имею в виду учебный сад. Чем закончилось то обещание?", recent: [], expected: ["receipt","upper"]},
      ];
      for (const check of checks) {
        const result = compileGameContext({ draft: check.draft, recentMessages: check.recent, entries: [], books: [], entities,
          worlds: [world], activeBookId: null, scene: { worldId, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 },
          story: { world, chat: chatId, branch, facts: world.sharedGame!.facts, taskArchive, sheetsEnabled: false } });
        const block = result.text.match(/<deeprole_story_memory>([\s\S]*?)<\/deeprole_story_memory>/)![1]!;
        const selected = decodeStoryMemory(JSON.parse(block.trim().split("\n").at(-1)!));
        const ids = selected.map(s => fixture.byText.get(s.text)?.id).sort();
        if (check.compound) {
          expect(ids,check.draft).toEqual(expect.arrayContaining(check.expected));
          expect(ids).not.toContain("basket");
          expect(ids,check.draft).not.toContain("spare");
        } else if (check.herbarium) expect(ids).toContain("spare");
        else expect(ids,check.draft).toEqual(check.expected);
        if (check.unverified) expect(result.text).toContain("No matching observation");
      }
      const raw = await repo.rawRecords();
      const seedRow = raw.map(r => r.data as StoryRecord).find(r => r.type === "baseline" && r.branchId === branch);
      if (seedRow?.type !== "baseline" || !seedRow.priorTaskSeeds?.[0]) throw Error("Missing archive reference");
      seedRow.priorTaskSeeds[0].baselineId = seedRow.id;
      expect(() => assertStoryGraph(raw)).toThrow();
      if (turn === 0) {
        delete checkpoint.priorTaskSeeds;
        expect(readTaskArchive(records,world,branch)?.facts.some(f => fixture.byText.get(f.text)?.id === "upper")).toBe(false);
        await runStoryGame({chatId,worldId,operation:"sync",expectedBase:characterRevision(entities,activeBinding.characterScenes?.[worldId]),
          nativeParentKey:null,manual:"stop",snapshot:{chatId,selectedNativeKey:key("2"), messages:[
            {identity:{role:"user",nativeMessageKey:key("1"),nativeParentKey:null},completion:"complete",content:"Продолжаю путь."},
            {identity:{role:"assistant",nativeMessageKey:key("2"),nativeParentKey:key("1")},completion:"complete",content:"Дорожка ведёт в сад."},
          ]}},DEFAULT_SETTINGS,repo);
      } else {
        const corrected = structuredClone(world);
        const closing = corrected.sharedGame!.facts.find(f => fixture.byText.get(f.text)?.id === "receipt")!;
        closing.quote += " Уточнение.";
        expect(readTaskArchive(records,corrected,branch)?.facts.some(f => fixture.byText.get(f.text)?.id === "upper")).toBe(false);
      }
    }
  } finally { await db.delete(); }
});
