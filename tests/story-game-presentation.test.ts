import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StoryGameClient} from '../src/adapters/story-game-client';
import type {StoryGameSnapshot} from '../src/core/story-game';
const key=(id:string)=>JSON.stringify(['message',id]);
beforeEach(()=>{document.body.innerHTML='<div data-virtual-list-item-key="3"><article data-role="assistant">Reply</article></div>';});
afterEach(()=>{vi.restoreAllMocks();document.body.innerHTML='';});
function fixture(){
  const scope={chatId:'chat',worldId:'world',base:'base',url:location.href,locked:false,generating:false,managed:false,replySignature:'reply-v1'};
  const store={storyGameStatus:vi.fn(async()=>true),runStoryGame:vi.fn(async()=>({active:true,changed:false}))};
  const snapshot:StoryGameSnapshot={chatId:'chat',selectedNativeKey:key('3'),messages:[{identity:{role:'user',nativeMessageKey:key('2'),nativeParentKey:null},completion:'complete',content:'Request'},{identity:{role:'assistant',nativeMessageKey:key('3'),nativeParentKey:key('2')},completion:'complete',content:'Reply'}]};
  const requests:any[]=[];const post=vi.spyOn(window,'postMessage').mockImplementation(data=>{requests.push(data);});
  const reply=(value:unknown=snapshot,origin=location.origin)=>window.dispatchEvent(new MessageEvent('message',{source:window,origin,data:{source:'deeprole-page-bridge',type:'STORY_GAME_SNAPSHOT_RESULT',requestId:requests.at(-1)?.requestId,snapshot:value}}));
  return{scope,store,snapshot,requests,post,reply,client:new StoryGameClient(window,()=>scope,store)};
}
it('reads a selected server pair without enabling tracking or writing anything, then caches the GET',async()=>{
  const f=fixture(),task=f.client.readForPresentation();expect(f.requests).toHaveLength(1);f.reply();expect(await task).toEqual(f.snapshot);
  expect(await f.client.readForPresentation()).toEqual(f.snapshot);expect(f.requests).toHaveLength(1);
  expect(f.store.storyGameStatus).not.toHaveBeenCalled();expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
it('reuses an existing managed read for presentation instead of fetching again',async()=>{
  const f=fixture();f.scope.managed=true;const task=f.client.run();await vi.waitFor(()=>expect(f.requests).toHaveLength(1));f.reply();await task;
  expect(await f.client.readForPresentation()).toEqual(f.snapshot);expect(f.requests).toHaveLength(1);expect(f.store.runStoryGame).toHaveBeenCalledTimes(1);
});
it.each(['world','chat','url','locked','generating','anchor','reset','reply'] as const)('does not expose cached proof after %s changes',async mode=>{
  const f=fixture(),task=f.client.readForPresentation();f.reply();await task;
  if(mode==='world')f.scope.worldId='other';if(mode==='chat')f.scope.chatId='other';if(mode==='url')f.scope.url+='?other';
  if(mode==='locked')f.scope.locked=true;if(mode==='generating')f.scope.generating=true;
  if(mode==='anchor')document.querySelector('[data-virtual-list-item-key]')!.setAttribute('data-virtual-list-item-key','5');if(mode==='reset')f.client.resetPresentation();
  if(mode==='reply')f.scope.replySignature='reply-v2';
  expect(f.client.presentationSnapshot()).toBeUndefined();expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
it.each(['navigation','base','reset','partial','wrong-chat','missing','malformed','reply','generating'] as const)('rejects a late/unusable %s result without writes',async mode=>{
  const f=fixture(),task=f.client.readForPresentation();
  if(mode==='navigation')f.scope.worldId='other';if(mode==='base')f.scope.base='changed';if(mode==='reset')f.client.resetPresentation();
  if(mode==='reply')f.scope.replySignature='reply-v2';if(mode==='generating')f.scope.generating=true;
  if(mode==='partial')f.snapshot.messages[1]!.completion='partial';if(mode==='wrong-chat')f.snapshot.chatId='other';if(mode==='missing')f.snapshot.messages=[];
  f.reply(mode==='malformed'?{}:f.snapshot);expect(await task).toBeUndefined();expect(f.client.presentationSnapshot()).toBeUndefined();expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
it('ignores a wrong-origin packet, then accepts only its own response',async()=>{
  const f=fixture(),task=f.client.readForPresentation();f.reply({},'https://foreign.test');f.reply();expect(await task).toEqual(f.snapshot);
});
it.each(['native-http','native-format','native-too-large','native-unreadable','native-exception','native-shape','PRIVATE_LORE'])('reports safe parent failure %s without accepting a malformed snapshot',async failure=>{
  const f=fixture();f.scope.managed=true;
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const task=f.client.run('parent',key('3'));
  await vi.waitFor(()=>expect(f.requests).toHaveLength(1));
  window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{source:'deeprole-page-bridge',type:'STORY_GAME_SNAPSHOT_RESULT',requestId:f.requests[0].requestId,snapshot:null,failure}}));
  await expect(task).rejects.toThrow('story-native-line-unavailable');
  expect(f.store.runStoryGame).not.toHaveBeenCalled();
  expect(JSON.parse(warn.mock.calls[0]?.[1])).toMatchObject({revision:'RP333',stage:'native-snapshot',code:failure==='PRIVATE_LORE'?'unknown':failure});
  expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE_LORE');
});
it('defers choices before and during native verification, not just after the GET starts',async()=>{
  const f=fixture();expect(f.client.presentationPending()).toBe(true);
  const task=f.client.readForPresentation();expect(f.client.presentationPending()).toBe(true);
  f.reply();await task;expect(f.client.presentationPending()).toBe(false);
  f.scope.replySignature='next-reply';expect(f.client.presentationPending()).toBe(true);
});
it('releases unclassified choices after a failed bounded read, and resets for a new scope',async()=>{
  const f=fixture(),task=f.client.readForPresentation();f.reply({});await task;
  expect(f.client.presentationPending()).toBe(false);
  f.client.resetPresentation();expect(f.client.presentationPending()).toBe(true);
  f.scope.worldId='another-world';expect(f.client.presentationPending()).toBe(true);
});
it('does not let a stale read release verification of a newer reply',async()=>{
  const f=fixture(),task=f.client.readForPresentation();f.scope.replySignature='newer';f.reply();await task;
  expect(f.client.presentationPending()).toBe(true);
  document.querySelector('[data-virtual-list-item-key]')!.remove();expect(f.client.presentationPending()).toBe(false);
});
it('releases choices after the existing nine-second timeout without another request or write',async()=>{
  vi.useFakeTimers();
  try{
    const f=fixture(),task=f.client.readForPresentation();expect(f.client.presentationPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(9001);expect(await task).toBeUndefined();
    expect(f.client.presentationPending()).toBe(false);expect(f.requests).toHaveLength(1);
    expect(f.store.runStoryGame).not.toHaveBeenCalled();
  }finally{vi.useRealTimers();}
});
it('rechecks the same visible reply after a late accepted receipt invalidates its proof',async()=>{
  const f=fixture(),first=f.client.readForPresentation();f.reply();await first;
  expect(f.client.presentationPending()).toBe(false);f.client.resetPresentation();
  expect(f.client.presentationPending()).toBe(true);
  const second=f.client.readForPresentation();expect(f.requests).toHaveLength(2);f.reply();await second;
  expect(f.client.presentationPending()).toBe(false);expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
it('keeps parent preparation independent of a late receipt invalidating UI proof',async()=>{
  const f=fixture();f.scope.managed=true;
  const task=f.client.run('parent',key('3'));await vi.waitFor(()=>expect(f.requests).toHaveLength(1));
  f.client.resetPresentation();f.reply();
  await expect(task).resolves.toEqual({active:true,changed:false});
  expect(f.store.runStoryGame).toHaveBeenCalledTimes(1);
  expect(f.client.presentationSnapshot()).toBeUndefined();
});
it('reports a changed parent base as stale so preparation can refresh without weakening the check',async()=>{
  const f=fixture();f.scope.managed=true;
  const task=f.client.run('parent',key('3'));await vi.waitFor(()=>expect(f.requests).toHaveLength(1));
  f.scope.base='new-checkpoint';f.reply();
  await expect(task).rejects.toThrow('story-review-stale');expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
it.each(['world','chat','url','locked'] as const)('still rejects parent preparation after %s changes',async mode=>{
  const f=fixture();f.scope.managed=true;
  const task=f.client.run('parent',key('3'));await vi.waitFor(()=>expect(f.requests).toHaveLength(1));
  if(mode==='world')f.scope.worldId='other';if(mode==='chat')f.scope.chatId='other';
  if(mode==='url')f.scope.url+='?other';if(mode==='locked')f.scope.locked=true;
  f.reply();await expect(task).rejects.toThrow('story-native-line-unavailable');expect(f.store.runStoryGame).not.toHaveBeenCalled();
});
