import {expect,it} from "vitest";
import {matchesResetGuard,resetGuard} from "../src/core/world-reset";
import type {ChatBinding,DataRecord,WorldProfile} from "../src/core/types";
import {resetFixture} from "./fixtures/world-reset";

function fixture(){
 const f=resetFixture();
 f.world.sharedGame={version:1,id:"old-game",revision:"old-revision",activationId:"old-active",activeBindingId:f.binding.id,activeChatId:f.binding.chatId,managed:false,scene:f.binding.characterScenes![f.world.id],profileSeeds:{},identitySeeds:{},mergeSeeds:{},memoryOverrides:{includedIds:[],excludedIds:[]},facts:[],updatedAt:1};
 return f;
}
function saved(records:DataRecord[],worldId:string,format:"current"|"legacy"){
 const guard=resetGuard(records,worldId);
 if(format==="current")return guard;
 const snapshot=JSON.parse(guard),world=records.find(r=>r.kind==="world"&&r.id===worldId)!.data as WorldProfile;
 snapshot[2]=records.filter(r=>r.kind==="binding"&&r.id===world.sharedGame!.activeBindingId).map(r=>r.data);
 return JSON.stringify(snapshot);
}
const receipts={createdAt:99,updatedAt:999999,messageCountAtAnalysis:1234,portraitLayouts:{},illustrationAttempts:[],scenePhotos:[],recoveredReplies:[],oldChatNotice:{acknowledged:true}};
for(const format of ["current","legacy"] as const){
 it.each(Object.entries(receipts))(`ignores only local receipt/presentation changes in ${format} guard: %s`,(field,value)=>{
  const f=fixture(),guard=saved(f.records,f.world.id,format);
  Object.assign(f.binding,{[field]:value});
  expect(matchesResetGuard(f.records,f.world.id,guard)).toBe(true);
 });
 it.each(["description","entry","character","character timestamp","game facts","game revision","active chat","memory overrides","scene","focus","book","chat","chat URL","continuation","message mode","unknown field"])(`retains real state protection after idle changes in ${format} guard: %s`,kind=>{
  const f=fixture(),guard=saved(f.records,f.world.id,format),binding=f.binding as ChatBinding;
  Object.assign(binding,receipts);
  if(kind==="description")f.world.description+=" New original lore.";
  if(kind==="entry")f.event.content+=" A new event.";
  if(kind==="character")f.entities[1]!.name="Changed identity";
  if(kind==="character timestamp")f.entities[1]!.updatedAt++;
  if(kind==="game facts")f.world.sharedGame!.facts.push({kind:"event",text:"A new promise",quote:"A new promise"});
  if(kind==="game revision")f.world.sharedGame!.revision="new-revision";
  if(kind==="active chat")f.world.sharedGame!.activeChatId="new-chat";
  if(kind==="memory overrides")binding.memoryOverrides={includedIds:[f.event.id],excludedIds:[]};
  if(kind==="scene")binding.characterScenes![f.world.id]!.states["person-1"]!.goal="New goal";
  if(kind==="focus")binding.focusIds=["person-2"];
  if(kind==="book")binding.bookId="new-book";
  if(kind==="chat")binding.chatId="new-chat";
  if(kind==="chat URL")binding.chatUrl="https://chat.deepseek.com/a/chat/s/new-chat";
  if(kind==="continuation")binding.continuationSnapshotId="new-snapshot";
  if(kind==="message mode")binding.nextStoryMessageMode="out-of-character";
  if(kind==="unknown field")Object.assign(binding,{futureGameState:"changed"});
  expect(matchesResetGuard(f.records,f.world.id,guard)).toBe(false);
 });
}
it("normalizes object key order without changing the saved baseline",()=>{
 const f=fixture(),snapshot=JSON.parse(saved(f.records,f.world.id,"legacy"));
 snapshot[2]=snapshot[2].map((binding:ChatBinding)=>Object.fromEntries(Object.entries(binding).reverse()));
 snapshot[0]=Object.fromEntries(Object.entries(snapshot[0]).reverse());
 expect(matchesResetGuard(f.records,f.world.id,JSON.stringify(snapshot))).toBe(true);
 f.world.description+=" Changed lore.";
 expect(matchesResetGuard(f.records,f.world.id,JSON.stringify(snapshot))).toBe(false);
});
it.each([undefined,"","not JSON","null","{}","[]","[null,null,{},[]]","[null,null,[null],[]]","[null,null,[],null]"])("rejects a missing or malformed saved guard: %s",guard=>{
 const f=fixture();expect(matchesResetGuard(f.records,f.world.id,guard)).toBe(false);
});
