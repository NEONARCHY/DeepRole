import { expect, it } from 'vitest';
import { storyReplyPurpose, storyReplyProofChanged } from '../src/core/story-reply-purpose';
import { confirmedDispatchText, validStoryDispatchCapture, type StoryDispatchCapture } from '../src/core/story-dispatch-capture';
import type { StoryGameSnapshot } from '../src/core/story-game';
import { characterText } from '../src/core/characters';
const scope = { worldId:'world', bindingId:'binding', chatId:'chat' };
const key = (id:string) => JSON.stringify(['message',id]);
function capture(): StoryDispatchCapture {
  return { format:'deeprole-story-dispatch', contractVersion:1, id:'request', worldId:scope.worldId, bindingId:scope.bindingId, ownerTabId:7, origin:'local', purpose:'out-of-character', transport:'xhr', identity:{chatId:'chat',nativeParentKey:key('1')}, sceneRevision:null, originalDraft:'OOC: Explain.', proposedContext:'REFERENCE', injection:'context', started:true, delivery:{status:'accepted',httpStatus:200}, wire:{phase:'closed',sawFinish:true,issue:null,link:{requestId:'request',chatId:'chat',nativeParentKey:key('1'),userMessageKey:key('2'),assistantMessageKey:key('3')}},createdAt:1,updatedAt:2 };
}
it('labels only the exact completed native reply, including virtual-list identity', () => {
  const c=capture(),before=structuredClone(c); expect(validStoryDispatchCapture(c)).toBe(true);
  expect(storyReplyPurpose([c],scope,key('3'))).toBe('out-of-character');
  expect(storyReplyPurpose([c],scope,JSON.stringify(['virtual','3']))).toBe('out-of-character');
  c.purpose='user-turn';expect(storyReplyPurpose([c],scope,key('3'))).toBe('user-turn');c.purpose='out-of-character';expect(c).toEqual(before);
});
it.each(['worldId','bindingId','chatId'] as const)('does not hide errors in another %s', field => {
  expect(storyReplyPurpose([capture()],{...scope,[field]:'other'},key('3'))).toBeUndefined();
});
it.each(['restored','unconfirmed','unfinished','failed','wrong-reply','ambiguous','invalid'] as const)('abstains on %s proof', mode => {
  const c=capture();let captures:unknown[]=[c],reply=key('3');
  if(mode==='restored')c.origin='restored';if(mode==='unconfirmed'){c.injection='unconfirmed';c.started=false;c.delivery=null;}
  if(mode==='unfinished'){c.wire.phase='ready';c.wire.sawFinish=false;}if(mode==='failed')c.delivery={status:'failed',code:'network'};
  if(mode==='wrong-reply')reply=key('4');if(mode==='ambiguous')captures=[c,structuredClone(c)];if(mode==='invalid')captures=[{...c,purpose:'guessed'}];
  expect(storyReplyPurpose(captures,scope,reply)).toBeUndefined();
});
it('has a neutral localised status while real missing updates keep their warning', () => {
  expect(characterText('ru','outOfCharacter')).toBe('Вне игры — состояние сцены не меняется.');
  expect(characterText('en','outOfCharacter')).toBe('Out of character — scene state is unchanged.');
  expect(characterText('ru','missing')).toContain('не прислал обновление');
});

function waiting(transport: 'fetch'|'xhr'): StoryDispatchCapture {
  return {...capture(),transport,wire:{phase:'waiting',link:null,sawFinish:false,issue:null}};
}
function snapshot(c:StoryDispatchCapture):StoryGameSnapshot {
  return {chatId:'chat',selectedNativeKey:key('3'),messages:[
    {identity:{role:'user',nativeMessageKey:key('2'),nativeParentKey:key('1')},completion:'complete',content:confirmedDispatchText(c)!},
    {identity:{role:'assistant',nativeMessageKey:key('3'),nativeParentKey:key('2')},completion:'complete',content:'Explanation; not a played event.'},
  ]};
}
it.each(['user-turn','out-of-character'] as const)('rescans a late accepted or finished %s receipt, but not duplicate notifications',purpose=>{
  const next={...capture(),purpose},prior={...waiting('xhr'),purpose};
  expect(storyReplyProofChanged(undefined,prior)).toBe(true);
  expect(storyReplyProofChanged(prior,next)).toBe(true);
  expect(storyReplyProofChanged(next,structuredClone(next))).toBe(false);
});
it.each(['restored','unconfirmed','malformed'] as const)('does not schedule proof from %s receipt',mode=>{
  const c=capture();if(mode==='restored')c.origin='restored';if(mode==='unconfirmed'){c.started=false;c.injection='unconfirmed';c.delivery=null;}
  expect(storyReplyProofChanged(undefined,mode==='malformed'?{}:c)).toBe(false);
});
it.each(['fetch','xhr'] as const)('recognises completed exact server pair without %s SSE markers, without mutating receipts',transport=>{
  const c=waiting(transport),s=snapshot(c),before=structuredClone({c,s});
  expect(validStoryDispatchCapture(c)).toBe(true);
  expect(storyReplyPurpose([c],scope,JSON.stringify(['virtual','3']),s)).toBe('out-of-character');
  expect({c,s}).toEqual(before);
  c.purpose='user-turn';expect(storyReplyPurpose([c],scope,key('3'),s)).toBe('user-turn');
});
it.each(['scope','chat','selection','user-text','user-parent','reply-parent','partial-user','partial-reply','missing-user','restored','unconfirmed','failed','ambiguous','conflicting-link'] as const)('server proof abstains on %s',mode=>{
  const c=waiting('fetch'),s=snapshot(c);let captures=[c],matchScope=scope;
  if(mode==='scope')matchScope={...scope,bindingId:'other'};
  if(mode==='chat')s.chatId='other';if(mode==='selection')s.selectedNativeKey=key('4');
  if(mode==='user-text')s.messages[0]!.content+=' edited';if(mode==='user-parent')s.messages[0]!.identity.nativeParentKey=key('9');
  if(mode==='reply-parent')s.messages[1]!.identity.nativeParentKey=key('9');
  if(mode==='partial-user')s.messages[0]!.completion='partial';if(mode==='partial-reply')s.messages[1]!.completion='interrupted';
  if(mode==='missing-user')s.messages.shift();if(mode==='restored')c.origin='restored';
  if(mode==='unconfirmed'){c.injection='unconfirmed';c.started=false;c.delivery=null;}
  if(mode==='failed')c.delivery={status:'failed',code:'network'};if(mode==='ambiguous')captures=[c,structuredClone(c)];
  if(mode==='conflicting-link'){c.transport='xhr';c.wire={...capture().wire,phase:'ready',sawFinish:false,link:{...capture().wire.link!,assistantMessageKey:key('9')}};}
  expect(storyReplyPurpose(captures,matchScope,key('3'),s)).toBeUndefined();
});
