import { batchFixture } from "./story-memory-batch";
import { automationMarker } from "../../src/core/story-automation";
import { prepareDispatchCapture,confirmDispatchCapture,advanceDispatchCapture } from "../../src/storage/story-dispatch-capture";
import { nativeStoryMessageKey } from "../../src/core/story-transport";
import { readAutomationReview,resolveAutomationReview } from "../../src/storage/story-automation-review";
import { activateWorldGame } from "../../src/storage/world-game";
export async function lifecycleFixture() {
 const f=await batchFixture(0);
 const send=async(facts:unknown[])=>{
  const n=f.snapshot.messages.length+1,reply=n+1,parent=f.snapshot.selectedNativeKey!;
  const draft="Continue the story.",context=automationMarker(await f.world()),outgoing=context+"\n\n[User message]\n"+draft,id=crypto.randomUUID(),b=await f.binding();
  const route={requestId:id,identity:{chatId:f.input.chatId,nativeParentKey:parent},transport:"fetch" as const};
  await prepareDispatchCapture({id,worldId:f.input.worldId,bindingId:b.id,identity:route.identity,transport:"fetch",sceneRevision:b.characterScenes![f.input.worldId]!.revision,originalDraft:draft,proposedContext:context},7,f.repo);
  await confirmDispatchCapture({...route,outgoingText:outgoing},7,f.repo);
  await advanceDispatchCapture({...route,phase:"started"},7,f.repo);
  await advanceDispatchCapture({...route,phase:"settled",delivery:{status:"accepted",httpStatus:200}},7,f.repo);
  const content=facts.map(v=>(v as any).quote).join("\n")+"\n<deeprole_characters>"+JSON.stringify({version:2,world:f.input.worldId,chat:f.input.chatId,updates:[],facts})+"</deeprole_characters>";
  f.snapshot.messages.push({identity:{nativeMessageKey:nativeStoryMessageKey(String(n)),nativeParentKey:parent,role:"user"},completion:"complete",content:outgoing},f.message(reply,n,"assistant",content));
  f.snapshot.selectedNativeKey=nativeStoryMessageKey(String(reply));await f.play();return f.snapshot.selectedNativeKey;
 };
 const read=()=>readAutomationReview({chatId:f.input.chatId,worldId:f.input.worldId,query:""},f.repo);
 const resolve=async(accept:boolean,replace=true)=>{
  const page=await read(),item=page.items[0]!;
  return resolveAutomationReview({chatId:page.chatId,worldId:page.worldId,guard:page.guard,gameRevision:page.gameRevision,eventId:item.id,accept,fields:[],entityId:null,name:"",...(accept&&replace&&item.conflicts?.length?{replaceKeys:item.conflicts.map(c=>c.key)}:{})},f.repo);
 };
 const attach=async()=>{
  const b=await f.binding();f.input.chatId="lifecycle-b";const next={...b,id:"lifecycle-binding-b",chatId:f.input.chatId,chatUrl:"https://chat.deepseek.com/a/chat/s/"+f.input.chatId};delete next.characterScenes;await f.repo.put("binding",next);
  await activateWorldGame({chatId:f.input.chatId,worldId:f.input.worldId,chatUrl:next.chatUrl,expectedRevision:(await f.world()).sharedGame!.revision,mode:"attach"},f.repo);
  f.snapshot.chatId=f.input.chatId;f.snapshot.messages=[f.message(1,null,"user","Begin again."),f.message(2,1,"assistant","Another room.")];f.snapshot.selectedNativeKey=nativeStoryMessageKey("2");await f.play("start");
 };
 return {...f,send,review:read,resolve,attach};
}
export const taskFact=(text:string,status:"open"|"completed"|"cancelled"="open",key="mira.gate",title="repair the gate")=>({text,quote:text,kind:status==="open"?"promise":"event",risk:"ordinary",task:{key,title,status}});
