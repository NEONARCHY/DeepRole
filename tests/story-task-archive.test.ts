import {expect,it} from 'vitest';
import {readTaskArchive} from '../src/core/story-task-archive';
import {longHoldout,longHoldoutWorld} from './fixtures/story-rp344-world';
import {planStoryGame} from '../src/storage/story-game';
import {sharedGameCommit} from '../src/storage/world-game';
import {characterRevision} from '../src/core/characters';
import {DEFAULT_SETTINGS} from '../src/core/defaults';
import type {StoryBaseline,StoryBranch,StoryProjection,StoryRecord,StoryEvent,StoryRevision} from '../src/core/story-records';
import {storyFactIdentity} from '../src/core/story-memory-lifecycle';
import {compactStoryFacts} from '../src/core/story-update';
import {compileGameContext,type GameContextInput} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import type {WorldProfile} from '../src/core/types';
import {bindStoryRoles} from '../src/core/story-role-binding';

function started(index=0){
 const f=longHoldoutWorld(longHoldout.worlds[index]!,0),b=f.base;
 const plan=planStoryGame(b.records,{chatId:b.binding.chatId,worldId:b.world.id,expectedBase:characterRevision(b.entities,b.binding.characterScenes![b.world.id]),operation:'start',nativeParentKey:null,manual:'stop',snapshot:{chatId:b.binding.chatId,selectedNativeKey:null,messages:[]}},DEFAULT_SETTINGS);
 plan.records=sharedGameCommit(b.records,plan.records,plan.removed);
 const keys=new Set([...plan.records,...plan.removed].map(r=>r.kind+':'+r.id));
 const stored=[...b.records.filter(r=>!keys.has(r.kind+':'+r.id)),...plan.records];
 const records=stored.filter(r=>r.kind==='story').map(r=>r.data as StoryRecord),world=stored.find(r=>r.kind==='world')!.data as WorldProfile;
 const base=records.find(r=>r.type==='baseline'&&r.origin.bindingId===world.sharedGame!.activeBindingId) as StoryBaseline;
 const branch=records.find(r=>r.id===base.branchId) as StoryBranch;
 return {f,records,world,base,branch};
}
for(let i=0;i<4;i++)it(`compacted persisted checkpoint ${i}: original and closed task survive query/reload without canon mutation`,()=>{
 const {f,records,world,branch}=started(i),before=structuredClone({records,world});
 expect(world.sharedGame!.facts).toEqual(compactStoryFacts(f.facts));
 expect(world.sharedGame!.facts.some(x=>x.text===f.important[16]!.text)).toBe(false);
 const archive=readTaskArchive(records,world,branch.id)!;
 expect(archive.facts).toContainEqual(f.important[16]);
 const q=f.questions.find(q=>q.id==='completed-history')!;
 const input:GameContextInput={draft:q.draft,recentMessages:[],entries:[],books:[],entities:f.base.entities,worlds:[world],activeBookId:null,scene:{worldId:world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},story:{world,chat:f.base.binding.chatId,branch:branch.id,facts:world.sharedGame!.facts,taskArchive:archive,sheetsEnabled:false}};
 const out=compileGameContext(input),block=out.text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;
 const hints=decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
 for(const index of [16,17]){
  const fact=f.important[index]!,h=hints.find(h=>h.text===fact.text)!;
  expect(h).toBeDefined();expect(h.task).toEqual(fact.task);expect(h.sourceQuote??h.text).toBe(fact.quote);
  expect(h.sourceRoles??{}).toEqual(f.seeds[f.coreIndices[index]!]!.binding.roles);
  expect(h.episodeSource?.revisionId).toBe(f.sources[f.coreIndices[index]!]);
 }
 expect(out.text).toContain('NOT current obligations');
 expect(compileGameContext(structuredClone(input))).toEqual(out);expect({records,world}).toEqual(before);
});
for(const mode of ['world','game','binding','chat','unmanaged','restart','duplicate-id','unknown-branch','missing-projection','stale-head','stale-selection','lineage','missing-source','ooc-source','partial-source','changed-quote'] as const)it(`archive fails closed for ${mode}`,()=>{
 const {f,records,world,base,branch}=started();const game=world.sharedGame!,p=records.find(r=>r.id===branch.projectionId) as StoryProjection;
 let branchId=branch.id;
 if(mode==='world')base.worldId='other';
 if(mode==='game')base.gameId='other';
 if(mode==='binding')game.activeBindingId='other';
 if(mode==='chat')game.activeChatId='other';
 if(mode==='unmanaged')branch.gameManaged=false;
 if(mode==='restart')game.restartPending=true;
 if(mode==='duplicate-id')records.push(structuredClone(records[0]!));
 if(mode==='unknown-branch')branchId='absent';
 if(mode==='missing-projection')branch.projectionId='absent';
 if(mode==='stale-head')p.headRevisionId='absent';
 if(mode==='stale-selection')p.selectionVersion++;
 if(mode==='lineage')game.episodeSources!.reverse();
 const old=records.find(r=>r.id===f.sources[f.coreIndices[16]!]!) as StoryRevision;
 if(mode==='missing-source')records.splice(records.indexOf(old),1);
 if(mode==='ooc-source')old.storyPurpose='out-of-character';
 if(mode==='partial-source')old.completion='partial';
 if(mode==='changed-quote')old.content='Unrelated source.';
 const result=readTaskArchive(records,world,branchId);
 expect(result?.facts.some(fact=>fact.text===f.important[16]!.text)??false).toBe(false);
});
it('unapproved event is excluded, accepted exact memory is included, and OOC cannot supply history',()=>{
 const {records,world,branch,f}=started(),game=world.sharedGame!;
 const original=f.important[16]!,text=original.quote+' Additional receipt.';
 const old=records.find(r=>r.id===f.sources[f.coreIndices[16]!]!) as StoryRevision;
 const user:StoryRevision={...old,id:'archive-user',messageId:'archive-user-message',nativeMessageKey:'archive-user-native',branchId:branch.id,playthroughId:branch.playthroughId,parentRevisionId:null,role:'user',roleRoster:undefined,roleRosterRequestId:undefined,content:'Continue'};
 const source:StoryRevision={...old,id:'archive-assistant',messageId:'archive-assistant-message',nativeMessageKey:'archive-assistant-native',branchId:branch.id,playthroughId:branch.playthroughId,parentRevisionId:user.id,content:text};
 const fact={...original,text,quote:text};
 const event:StoryEvent={format:'deeprole-story',contractVersion:1,type:'event',id:'archive-event',worldId:world.id,playthroughId:branch.playthroughId,branchId:branch.id,createdAt:30,updatedAt:30,revisionId:source.id,ordinal:0,disposition:'candidate',label:'Memory',quote:text,participantIds:[],changes:[],memory:fact,memoryRoles:bindStoryRoles(fact,source)};
 records.push(user,source,event);game.episodeSources!.push(user.id,source.id);
 branch.headRevisionId=source.id;const p=records.find(r=>r.id===branch.projectionId) as StoryProjection;p.headRevisionId=source.id;p.revisionIds=[user.id,source.id];
 expect(readTaskArchive(records,world,branch.id)!.facts).not.toContainEqual(fact);
 p.acceptedEventIds=[event.id];p.appliedEventIds=[event.id];
 expect(readTaskArchive(records,world,branch.id)!.facts).toContainEqual(fact);
 source.storyPurpose='out-of-character';expect(readTaskArchive(records,world,branch.id)).toBeUndefined();
});
it('explicit accepted correction removes an old task even from an earlier checkpoint',()=>{
 const {records,world,base,branch,f}=started();
 const key=storyFactIdentity(f.important[16]!);base.factSeeds!.push({...f.important[17]!,replaces:[key]});
 expect(readTaskArchive(records,world,branch.id)!.facts.some(f=>storyFactIdentity(f)===key)).toBe(false);
});
