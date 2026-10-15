import { expect,it,vi } from 'vitest';
vi.mock('../src/core/text',async importOriginal=>{
 const original=await importOriginal<typeof import('../src/core/text')>();
 return {...original,deriveKeywords:vi.fn(original.deriveKeywords),uniqueTokens:vi.fn(original.uniqueTokens)};
});
vi.mock('../src/core/lore-categories',async importOriginal=>{
 const original=await importOriginal<typeof import('../src/core/lore-categories')>();
 return {...original,inferTitlePeople:vi.fn(original.inferTitlePeople)};
});
import { deriveKeywords,uniqueTokens } from '../src/core/text';
import { MemorySearchIndexOwner } from '../src/core/memory-search-index';
import { GameSearchIndex } from '../src/core/game-search-index';
import { compileGameContext } from '../src/core/game-context';
import { contextualWorld } from './fixtures/story-contextual-reference';
import type { MemoryEntry } from '../src/core/types';
import { inferTitlePeople } from '../src/core/lore-categories';

it('actual keyword derivation: unchanged cloned compiler input=0, one edited fact=1',()=>{
 const c=contextualWorld('en'),index=new GameSearchIndex();c.input.draft='What about her gift?';
 compileGameContext(c.input,{searchIndex:index});
 const clone=structuredClone(c.input);vi.mocked(deriveKeywords).mockClear();
 const warm=compileGameContext(clone,{searchIndex:index});expect(deriveKeywords).toHaveBeenCalledTimes(0);
 expect(warm).toEqual(compileGameContext(structuredClone(clone)));
 clone.story!.facts[12]!.text='Oren said: “The violet lantern is outside.”';
 vi.mocked(deriveKeywords).mockClear();const edited=compileGameContext(clone,{searchIndex:index});expect(deriveKeywords).toHaveBeenCalledTimes(1);
 expect(edited).toEqual(compileGameContext(structuredClone(clone)));
});
it('actual lore tokenization: 1000 storage clones=0; one edited content field=1',()=>{
 const entries:MemoryEntry[]=Array.from({length:1000},(_,i)=>({id:String(i),worldId:'w',bookId:null,title:`Parcel ${i}`,content:`Box ${i} is sealed.`,keywords:['box'],enabled:true,activation:'smart',priority:'normal',source:{type:'manual'},createdAt:0,updatedAt:0})),index=new MemorySearchIndexOwner();
 index.prepare(entries);const clone=structuredClone(entries);vi.mocked(uniqueTokens).mockClear();index.prepare(clone);expect(uniqueTokens).toHaveBeenCalledTimes(0);
 clone[500]!.content='The parcel is open.';vi.mocked(uniqueTokens).mockClear();index.prepare(clone);expect(uniqueTokens).toHaveBeenCalledTimes(1);
 clone[500]!.priority='high';clone[500]!.updatedAt++;vi.mocked(uniqueTokens).mockClear();index.prepare(clone);expect(uniqueTokens).toHaveBeenCalledTimes(0);
});
it('title associations survive clones but rebuild after changed source or clearing',()=>{
 const c=contextualWorld('en'),index=new GameSearchIndex();c.input.draft='Lida';
 c.input.entries=[{id:'profile-info',worldId:c.base.world.id,bookId:null,title:'Lida appearance',content:'Green coat.',keywords:[],enabled:true,activation:'smart',priority:'normal',source:{type:'manual'},createdAt:0,updatedAt:0}];
 compileGameContext(c.input,{searchIndex:index});const clone=structuredClone(c.input);vi.mocked(inferTitlePeople).mockClear();
 compileGameContext(clone,{searchIndex:index});expect(inferTitlePeople).toHaveBeenCalledTimes(0);
 clone.entries[0]!.title='Oren appearance';vi.mocked(inferTitlePeople).mockClear();compileGameContext(clone,{searchIndex:index});expect(inferTitlePeople).toHaveBeenCalledTimes(1);
 index.clear();vi.mocked(inferTitlePeople).mockClear();compileGameContext(clone,{searchIndex:index});expect(inferTitlePeople).toHaveBeenCalledTimes(1);
});
