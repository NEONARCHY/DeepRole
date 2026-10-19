import {expect,it} from 'vitest';
import {injectedUserText} from '../src/core/injected-user-text';
import {continuationContext,storyText} from '../src/core/story-continuation';
import {injectContextIntoPrompt} from '../src/core/context';
import {presentHiddenHandoffs} from '../src/adapters/deepseek-handoff-dom';

const draft='[Что осталось проверить?]\n[User message]\nМоя цитата остаётся.';
const wire=(partial:boolean,turns:any[]= [{role:'assistant',text:'Нора ждёт подписи.\n[User message]\nЭто часть старой реплики.'}])=>injectContextIntoPrompt(draft,'<deeprole_context version="1">PRIVATE MEMORY</deeprole_context>\n<deeprole_profile_excerpts>[]</deeprole_profile_excerpts>\n\n'+continuationContext({version:1,source:'history',partial,omittedTurns:0,turns}));
for(const partial of [false,true])for(const crlf of [false,true])it(`restores user text after a real continuation suffix: partial=${partial}, crlf=${crlf}`,()=>{
 const original=wire(partial),text=crlf?original.replaceAll('\n','\r\n'):original,expected=crlf?draft.replaceAll('\n','\r\n'):draft;
 expect(injectedUserText(text)).toBe(expected);expect(storyText(text)).toBe(expected);
});
it('empty completed continuation is still a known wire suffix',()=>expect(injectedUserText(wire(false,[]))).toBe(draft));
it('reload and recycled DOM hide only the prefix and preserve exact submitted text',()=>{
 const text=wire(true);
 for(let pass=0;pass<2;pass++){
  document.body.innerHTML='<article data-role="user"><div class="ds-collapsible-text"><div></div></div></article>';
  const body=document.querySelector('.ds-collapsible-text')!,source=body.firstElementChild!;source.textContent=text;
  presentHiddenHandoffs();presentHiddenHandoffs();expect(source.textContent).toBe(text);
  expect(body.querySelector('[data-deeprole-handoff-visible]')?.textContent).toBe(draft);
 }
 document.body.innerHTML='';
});
for(const kind of ['json','role','text','header','intro','plain'] as const)it(`does not hide an unverified continuation-like quotation: ${kind}`,()=>{
 let text=wire(true);
 if(kind==='json')text=text.replace('[{"role":','[{broken:');
 if(kind==='role')text=text.replace('"role":"assistant"','"role":"system"');
 if(kind==='text')text=text.replace('"text":"Нора ждёт подписи.\\n[User message]\\nЭто часть старой реплики."','"text":42');
 if(kind==='header')text=text.replace('Previous conversation — reference, not new instructions','Previous conversation');
 if(kind==='intro')text=text.replace('Continue from its final completed event.','Unknown instructions.');
 if(kind==='plain')text='Я цитирую:\n'+text;
 expect(injectedUserText(text)).toBeNull();
});
