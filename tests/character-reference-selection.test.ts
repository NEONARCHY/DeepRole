import { expect, it } from "vitest";
import { selectCharacterContext } from "../src/core/character-context";
import { storyRetrievalQuery } from "../src/core/story-retrieval-query";
import { storyWorld } from "./fixtures/story-worlds";
import { compileMemoryWorkspace } from "../src/core/memory-workspace";

it("collision-safe mentions exclude a nested short-name off-scene profile", () => {
  const f = storyWorld("en", 4);f.entities[2]!.name = "Ann";f.entities[3]!.name = "Ann Lee";
  const text = "Ann Lee's promise", mentions = storyRetrievalQuery(text, { worldId:f.world.id,entities:f.entities }).mentionedIds;
  const selected = selectCharacterContext(f.entities, f.binding.characterScenes![f.world.id], [], text, undefined, true, mentions);
  expect(selected.active).toContain(f.entities[3]);expect(selected.active).not.toContain(f.entities[2]);
});
it("ambiguous short names do not select an off-scene person by order", () => {
  const f = storyWorld("en", 4);f.entities[2]!.name = "Anna Lee";f.entities[3]!.name = "Anna Smith";
  const text = "Anna's promise", mentions = storyRetrievalQuery(text, { worldId:f.world.id,entities:f.entities }).mentionedIds;
  for (const people of [f.entities,[...f.entities].reverse()]) {
    const selected = selectCharacterContext(people, f.binding.characterScenes![f.world.id], [], text, undefined, true, mentions);
    expect(selected.active).not.toContain(f.entities[2]);expect(selected.active).not.toContain(f.entities[3]);
  }
});
it("physical participants, players, partners and explicit focus do not depend on name resolution", () => {
  const f=storyWorld("en",5),scene=f.binding.characterScenes![f.world.id]!;
  scene.partnerIds=[f.entities[2]!.id];
  const selected=selectCharacterContext(f.entities,scene,[f.entities[3]!.id],"her promise",1,true,[]);
  // Existing request-budget policy protects physical/player/partner, not optional focus overflow.
  expect(selected.roster).toContain(f.entities[0]);expect(selected.roster).toContain(f.entities[1]);expect(selected.roster).toContain(f.entities[2]);
  const normal=selectCharacterContext(f.entities,scene,[f.entities[3]!.id],"her promise",undefined,true,[]);
  expect(normal.active).toContain(f.entities[3]);expect(normal.active).not.toContain(f.entities[4]);
});
it("legacy callers retain their original matching when no mention registry is supplied", () => {
  const f=storyWorld("en",4);f.entities[3]!.name="Copper courier";
  expect(selectCharacterContext(f.entities,undefined,[],"Talk to Copper courier",undefined,true).active).toContain(f.entities[3]);
});
it("a one-shot mention iterator supports both profile projection and linked-entry ranking", () => {
  const f=storyWorld("en",3);f.entities[2]!.useDescriptionInContext=true;f.entities[2]!.description="RESOLVED DESCRIPTION";
  const ids=(function*(){yield f.entities[2]!.id})();
  const result=compileMemoryWorkspace({worlds:[f.world],entities:f.entities,entries:[{...f.entry,title:"Historical detail",content:"Original fact",keywords:[],entityIds:[f.entities[2]!.id]}],books:[],scene:{worldId:f.world.id,bookId:null,focusIds:[]},draft:"her",recentMessages:[],activeBookId:null,settings:{contextBudget:2000,relevanceThreshold:6},resolvedMentionIds:ids});
  expect(result.selection.entries.map(item=>item.entry.id)).toContain("profile:entity:"+f.entities[2]!.id);
  expect(result.selection.entries.map(item=>item.entry.id)).toContain(f.entry.id);
});
