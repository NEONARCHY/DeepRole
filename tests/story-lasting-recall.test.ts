import {expect,it} from 'vitest';
import {compileGameContext} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {lastingRecallWorld} from './fixtures/story-lasting-recall-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
for(const locale of ['ru','en'] as const){
 it(`${locale} keeps whole-record cap8 and restores the exact former selection on overflow`,()=>{
  const f=lastingRecallWorld(locale),words=f.s('ящикодин ящикдва ящиктри ящикчетыре ящикпять ящикшесть ящиксемь ящиквосемь','lockerone lockertwo lockerthree lockerfour lockerfive lockersix lockerseven lockereight').split(' ');
  const details=words.map((word,i)=>{const fact=structuredClone(f.storeroom);fact.text=word+' 7319';fact.quote=f.s(`Мира сказала: «${fact.text}».`,`Mira said: “${fact.text}.”`);fact.claim!.key='locker-'+i;fact.claim!.value=fact.text;return fact;});
  f.input.story!.facts=[...details,...f.noise];f.input.story!.roleSeeds=details.map((fact,i)=>f.seed(fact,'locker-source-'+i,'speaker',f.base.entities[1]!));f.input.story!.episodeSources=[...details.map((_,i)=>'locker-source-'+i),...f.sources.slice(4)];f.input.settings.contextBudget=10000;
  f.input.draft=words.map(word=>f.s('Открываю '+word,'I opened the '+word)).join('; ');expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{lastingRecall:false}));
  f.input.draft=words.slice(0,7).map(word=>f.s('Открываю '+word,'I opened the '+word)).join('; ');const selected=hints(compileGameContext(f.input).text);expect(selected).toHaveLength(8);for(const fact of details.slice(0,7))expect(selected.some(h=>h.text===fact.text)).toBe(true);
 });
 it(`${locale} uses frozen identity after a rename, but not a new person with the same name`,()=>{
  const f=lastingRecallWorld(locale),person=f.input.entities![1]!;person.name=f.s('Новая Мира','Renamed Mira');
  let hint=hints(compileGameContext(f.input).text).find(h=>h.text===f.storeroom.text)!;expect(hint.sourceRoles!.speaker!.id).toBe(person.id);
  const former=person.id;person.id='replacement-person';f.input.character![3]!.presentIds=[person.id];f.input.character![3]!.partnerId=person.id;
  expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{lastingRecall:false}));expect(f.seeds[1]!.binding.roles.speaker!.id).toBe(former);
 });
 it(`${locale} cannot delete stop words inside a qualified object to manufacture a match`,()=>{
  const f=lastingRecallWorld(locale);f.input.draft=f.s('Проверяю дверь для архива.','I checked the archive of door.');expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{lastingRecall:false}));
 });
 for(const status of ['completed','cancelled'] as const)it(`${locale} retains the accepted terminal status, reporter and source ${status}`,()=>{
  const f=lastingRecallWorld(locale);f.closed.task!.status=status;f.input.story!.roleSeeds=f.records.map((fact,i)=>f.seed(fact,f.sources[i]!,fact===f.open?'planner':'speaker',f.base.entities[1]!));f.input.draft=f.s('Беру ключ.','I took the key.');
  const hint=hints(compileGameContext(f.input).text).find(h=>h.text===f.closed.text)!;expect(hint.task!.status).toBe(status);expect(hint.sourceRoles!.speaker!.id).toBe(f.base.entities[1]!.id);expect(hint.episodeSource!.revisionId).toBe(f.sources[0]);expect(hint.timeStatus).not.toBe('persistent');expect(f.closed.task!.status).toBe(status);
 });
 for(const failure of ['speaker','source','quote','foreign-speaker','unavailable','title-only-key','quote-only-object','name-as-object','pronoun-alias','split-fields'] as const)it(`${locale} does not invent lasting evidence from ${failure}`,()=>{
  const f=lastingRecallWorld(locale),input=f.input;input.draft=f.s('Беру ключ.','I took the key.');
  if(failure==='speaker')input.story!.roleSeeds=input.story!.roleSeeds!.filter(s=>s.binding.sourceRevisionId!==f.sources[0]);
  if(failure==='source')input.story!.episodeSources=f.sources.slice(1);
  if(failure==='quote')f.closed.quote+=' edited';
  if(failure==='foreign-speaker')input.character![3]!.presentIds=[f.base.entities[0]!.id];
  if(failure==='unavailable'){input.entities=input.entities!.filter(e=>e.id!==f.base.entities[1]!.id);input.character![2]=input.entities;}
  if(failure==='title-only-key'){f.closed.text=f.s('Мира сказала: «Я закончила работу».','Mira said: “I finished the work.”');f.closed.task!.title=f.s('Вернуть жетон','Return the token');f.closed.task!.key='key';f.closed.quote=f.closed.text;}
  if(failure==='quote-only-object'){input.draft=f.s('Открываю кладовую.','I opened the storeroom.');f.storeroom.text=f.s('Код записан в блокноте.','The code is written in the notebook.');f.storeroom.claim!.value=f.storeroom.text;}
  if(failure==='name-as-object'){input.entities![0]!.aliases=[f.s('Кладовую','Storeroom')];input.draft=f.s('Открываю кладовую.','I opened the storeroom.');}
  if(failure==='pronoun-alias'){input.entities![0]!.aliases=[f.s('Её','Her')];input.draft=f.s('Открываю её кладовую.','I opened her storeroom.');}
  if(failure==='split-fields'){input.draft=f.s('Проверяю дверь архива.','I checked the archive door.');f.archive.text=f.s('Дверь закрыта.','The door is shut.');f.archive.claim!.value=f.s('Архив','Archive');}
  if(['title-only-key','quote-only-object','split-fields'].includes(failure))input.story!.roleSeeds=f.records.map((fact,i)=>f.seed(fact,f.sources[i]!,fact===f.open?'planner':'speaker',f.base.entities[1]!));
  expect(compileGameContext(input)).toEqual(compileGameContext(input,{lastingRecall:false}));
 });
 it(`${locale} recalls the replacement value without reviving the former claim`,()=>{
  const f=lastingRecallWorld(locale),old=structuredClone(f.storeroom),latest=structuredClone(old);latest.text=latest.text.replace('7319','4820');latest.quote=latest.quote.replace('7319','4820');latest.claim!.value=latest.text;
  f.input.story!.facts.splice(2,0,latest);f.input.story!.episodeSources!.splice(2,0,'changed-code');f.input.story!.roleSeeds!.push(f.seed(latest,'changed-code','speaker',f.base.entities[1]!));
  const selected=hints(compileGameContext(f.input).text);expect(selected.some(h=>h.text===latest.text)).toBe(true);expect(selected.some(h=>h.text===old.text)).toBe(false);expect(f.input.story!.facts).toContain(f.storeroom);
 });
 it(`${locale} restores a previous task selection exactly when the whole addition cannot fit`,()=>{
  const f=lastingRecallWorld(locale);f.input.draft=f.s('Осматриваю дверь, открываю кладовую.','I inspected the door, opened the storeroom.');
  f.storeroom.text=f.s('Кладовая. ','Storeroom. ')+('Entire protected condition. '.repeat(40));f.storeroom.claim!.value=f.storeroom.text;f.storeroom.quote=f.s(`Мира сказала: «${f.storeroom.text}».`,`Mira said: “${f.storeroom.text}.”`);f.input.story!.roleSeeds=f.records.map((fact,i)=>f.seed(fact,f.sources[i]!,fact===f.open?'planner':'speaker',f.base.entities[1]!));
  let rolledBack=false;for(let budget=500;budget<=4000;budget+=100){f.input.settings.contextBudget=budget;const old=compileGameContext(f.input,{lastingRecall:false}),out=compileGameContext(f.input);if(old.report.explanation?.openTasks&& !hints(out.text).some(h=>h.text===f.storeroom.text)){expect(out).toEqual(old);rolledBack=true;}}expect(rolledBack).toBe(true);
 });
}
