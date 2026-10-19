import { expect, it } from "vitest";
import { assertWorldGameTab, type WorldGameActivation } from "../src/core/world-game";
import { planWorldGameActivation } from "../src/storage/world-game";
import { storyWorld } from "./fixtures/story-worlds";

const input: WorldGameActivation = {chatId:"test",chatUrl:"https://chat.deepseek.com/a/chat/s/test",worldId:"world",expectedRevision:null,mode:"resume"};
it("keeps the foreground/URL/chat guard and its initialize exception unchanged", () => {
  expect(()=>assertWorldGameTab(input,{url:input.chatUrl,active:true})).not.toThrow();
  expect(()=>assertWorldGameTab({...input,mode:"initialize"},{url:input.chatUrl,active:false})).not.toThrow();
});
it.each([
  [{...input}, {url:input.chatUrl,active:false},"activation-tab-inactive"],
  [{...input}, {url:input.chatUrl+"?changed",active:true},"activation-tab-url"],
  [{...input,chatId:"other"}, {url:input.chatUrl,active:true},"activation-tab-chat"],
] as const)("rejects with the original public error plus only a static reason", (request,tab,cause) => {
  try { assertWorldGameTab(request,tab); throw Error("accepted incorrectly"); }
  catch(error) { expect(error).toMatchObject({message:"story-binding-conflict",cause}); }
});
it.each(["world-missing","binding-missing","binding-world","binding-url"] as const)("keeps storage activation refusal for %s with no record changes", mode => {
  const f=storyWorld("en",2);
  const records=structuredClone(f.records);
  const request:WorldGameActivation={worldId:f.world.id,chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,expectedRevision:null,mode:"resume"};
  if(mode==="world-missing")records.splice(records.findIndex(r=>r.kind==="world"),1);
  if(mode==="binding-missing")records.splice(records.findIndex(r=>r.kind==="binding"),1);
  const binding=records.find(r=>r.kind==="binding");
  if(mode==="binding-world") (binding!.data as any).worldId="other";
  if(mode==="binding-url") (binding!.data as any).chatUrl="https://chat.deepseek.com/a/chat/s/another";
  const before=structuredClone(records);
  try { planWorldGameActivation(records,request); throw Error("accepted incorrectly"); }
  catch(error) { expect(error).toMatchObject({message:"story-binding-conflict",cause:"activation-"+mode}); }
  expect(records).toEqual(before);
});
