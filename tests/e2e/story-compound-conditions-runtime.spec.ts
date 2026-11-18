import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { COMPOUND_CONDITION_GUIDE } from '../../src/core/story-compound-conditions';
import { HEARSAY_GUIDE } from '../../src/core/story-hearsay';
import { PREVIOUS_OBJECT_GUIDE, UNCERTAIN_PREVIOUS_OBJECT } from '../../src/core/story-previous-object';
import { PROMISE_PAIR_GUIDE, UNCERTAIN_PROMISE_PAIR } from '../../src/core/story-promise-pair';
import { COMPARE_PROMISES, INCOMPLETE_COMPARISON } from '../../src/core/story-promise-comparison';
import { gameMemoryCoverageText } from '../../src/core/game-memory-coverage-i18n';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import { plots, type Bilingual, type Plot } from '../fixtures/story-rp404-corpus';
import { probes } from '../fixtures/story-rp404-expectations';
import { makeHistory } from '../fixtures/story-rp404-history';
import { seedStoryLibrary } from './helpers/seed-story-library';

type EvidenceProbe = {recent:Bilingual[]; draft:Bilingual; scope?:string; wanted:string[]; exclude:string[]; warning:boolean};
function loadStory(path:string,id?:string) {
  const stories=JSON.parse(readFileSync(path,'utf8')) as {plot:Plot; probes:EvidenceProbe[]}[];
  const story=id?stories.find(s=>s.plot.id===id):stories[0];
  if(!story)throw Error('Missing test story in '+path);
  return story;
}
const photoStory=loadStory('tests/fixtures/story-rp409-photo.json');
const pairStory=loadStory('tests/fixtures/story-rp410-pairs.json');
const comparisonPath='tests/fixtures/story-rp411-comparisons.json';
const comparisonStories={
  'promise comparisons':loadStory(comparisonPath,'planetarium'),
  'archived promise comparisons':loadStory(comparisonPath,'dockyard'),
};
for (const topic of ['conditions','photo permissions','promise participants','promise comparisons','archived promise comparisons'] as const)
for (const locale of ['ru','en'] as const) test(`sends ${topic} in the game request after reload (${locale})`,async ({},info)=>{
  test.skip(info.project.name!=='chromium','Installed Edge MV3');
  test.setTimeout(120000);
  const comparison=topic==='promise comparisons'||topic==='archived promise comparisons'?comparisonStories[topic]:undefined;
  const story=comparison??(topic==='photo permissions'?photoStory:topic==='promise participants'?pairStory:undefined);
  const history=story?makeHistory(story.plot,locale,127):makeHistory(plots.find(p=>p.id==='radio')!,locale,126);
  expect(history.facts).toHaveLength(1024);
  const extension=path.resolve('.output/chrome-mv3');
  const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:[
    '--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND',
  ]});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const panel=await context.newPage();
    await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
    await expect(panel.locator('.onboarding')).toBeVisible();
    await seedStoryLibrary(panel,history.records,locale);
    const outgoing:string[]=[];
    const dialogue:{message_id:number;parent_id:number|null;role:string;status:string;has_pending_fragment:boolean;fragments:{type:string;content:string}[]}[]=[];
    await context.route('https://chat.deepseek.com/**',route=>{
      const url=route.request().url();
      if(url.endsWith('/api/v0/chat/completion')){
        outgoing.push(route.request().postDataJSON().prompt);
        return route.fulfill({contentType:'text/event-stream',body:'event: ready\ndata: {"request_message_id":42,"response_message_id":43}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n'});
      }
      if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{
        chat_session:{id:history.chatId,current_message_id:dialogue.at(-1)?.message_id??null},chat_messages:dialogue,
      }}}});
      if(url.includes('/api/v0/'))return route.fulfill({json:{}});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><main><textarea aria-label="Message"></textarea></main>'});
    });
    const chat=await context.newPage();
    await chat.goto('https://chat.deepseek.com/chat/s/'+history.chatId);
    await chat.bringToFront();
    const questions=story?[]:probes.radio!.filter(q=>['two-owners','four-actions','hearsay','owner-original','owner-dub'].includes(q.id));
    expect(questions).toHaveLength(story?0:5);
    for(const [index,q] of questions.entries()){
      if(index)await chat.reload();
      await expect(chat.locator('.dr-character-row')).toHaveCount(3,{timeout:12000});
      const draft=q.draft[locale==='ru'?0:1];
      await chat.getByRole('textbox').fill(draft);
      await chat.evaluate(async ({chatId,draft})=>{
        const response=await fetch('/api/v0/chat/completion',{method:'POST',body:JSON.stringify({chat_session_id:chatId,parent_message_id:null,prompt:draft})});
        await response.text();
      },{chatId:history.chatId,draft});
      expect(outgoing).toHaveLength(index+1);
      const prompt=outgoing[index]!;
      expect(prompt.endsWith(draft)).toBe(true);
      expect(prompt).toContain(q.id.startsWith('owner-')?PROMISE_PAIR_GUIDE:q.id==='hearsay'?HEARSAY_GUIDE:COMPOUND_CONDITION_GUIDE);
      const block=prompt.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;
      const hints=decodeStoryMemory(JSON.parse(block.trim().split('\n').at(-1)!));
      const ids=hints.map(h=>{
        const source=history.byText.get(h.text)!;
        expect(h.episodeSource?.revisionId).toBe(source.revisionId);
        expect(h.kind).toBe(source.fact.kind);
        expect(h.sourceRoles??{}).toEqual(source.roles);
        expect(h.sourceQuote??h.text).toBe(source.fact.quote);
        return source.id;
      });
      for(const needed of q.wanted)expect(ids).toContain(needed);
      for(const excluded of q.exclude)expect(ids).not.toContain(excluded);
    }
    const grounded=probes.radio!.find(q=>q.id==='grounded')!;
    const language=locale==='ru'?0:1;
    const invented=locale==='ru'?'Инес попросила фарфоровую пластинку.':'Ines asked for the porcelain disc.';
    const competing=locale==='ru'?'Инес попросила оригинал для фонотеки. Эмма попросила копию для ведущего.':
      "Ines asked for the library original. Emma asked for the host's dub.";
    const cases=story?story.probes.map(q=>({previous:q.recent.at(-1)?.[language]??(language?'The workroom falls quiet.':'В мастерской становится тихо.'), draft:q.draft[language], warning:q.warning,
      guide:comparison?(q.warning?INCOMPLETE_COMPARISON:COMPARE_PROMISES):q.scope?'photo-scope='+q.scope+' ':q.warning?UNCERTAIN_PROMISE_PAIR:PROMISE_PAIR_GUIDE, wanted:q.wanted, exclude:q.exclude})):
      [grounded.recent![0]![language],invented,competing].map((previous,i)=>({previous,draft:grounded.draft[language],warning:i!==0,
        guide:i?UNCERTAIN_PREVIOUS_OBJECT:PREVIOUS_OBJECT_GUIDE,wanted:i===0?grounded.wanted:i===2?['master','dub']:[],exclude:i===0?grounded.exclude:[]}));
    for(const [i,{previous,draft,warning,guide,wanted,exclude}] of cases.entries()){
      const parent=100+i*2;
      dialogue.push({message_id:parent,parent_id:dialogue.at(-1)?.message_id??null,role:'USER',status:'FINISHED',has_pending_fragment:false,fragments:[{type:'REQUEST',content:'Continue.'}]},
        {message_id:parent+1,parent_id:parent,role:'ASSISTANT',status:'FINISHED',has_pending_fragment:false,fragments:[{type:'RESPONSE',content:previous}]});
      await chat.reload();
      await expect(chat.locator('.dr-character-row')).toHaveCount(3,{timeout:12000});
      await chat.evaluate(({id,line})=>{
        const article=document.createElement('article'),body=document.createElement('div');
        article.dataset.messageId=String(id);article.dataset.role='assistant';
        body.className='ds-markdown';body.textContent=line;article.append(body);
        document.querySelector('main')!.prepend(article);
      },{id:parent+1,line:previous});
      const synced=await panel.evaluate(async url=>{
        const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});
        return api.tabs.sendMessage(tab.id,{type:'DR_STORY_GAME',operation:'sync',manual:'stop'});
      },chat.url());
      expect(synced,JSON.stringify(synced)).toMatchObject({ok:true});
      await chat.getByRole('textbox').fill(draft);
      const caution=chat.locator('.dr-memory-issue:visible, [data-restore-widget="memory"]:visible').filter({hasText:gameMemoryCoverageText(locale).incompleteTitle});
      if(warning)await expect(caution.first()).toBeVisible();
      else await expect(caution).toHaveCount(0);
      await chat.evaluate(async ({id,parent,draft})=>{
        await (await fetch('/api/v0/chat/completion',{method:'POST',body:JSON.stringify({chat_session_id:id,parent_message_id:parent,prompt:draft})})).text();
      },{id:history.chatId,parent:parent+1,draft});
      expect(outgoing).toHaveLength(questions.length+1+i);
      const prompt=outgoing.at(-1)!;
      expect(prompt).toContain(guide);
      expect(prompt.endsWith(draft)).toBe(true);
      const memory=prompt.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
      const ids=memory?decodeStoryMemory(JSON.parse(memory.trim().split('\n').at(-1)!)).map(h=>history.byText.get(h.text)?.id):[];
      if(!wanted.length)expect(ids).toEqual([]);
      for(const source of wanted)expect(ids).toContain(source);
      for(const source of exclude)expect(ids).not.toContain(source);
    }
  } finally { await context.close(); }
});
