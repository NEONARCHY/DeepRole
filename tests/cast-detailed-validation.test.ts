import { expect, it } from "vitest";
import { parseCastDraft, castSources } from "../src/core/cast-initialization";
import { CastValidationError } from "../src/core/cast-validation";
import { parseCastBatch, mergeCastBatches } from "../src/core/cast-batches";
import { castDraft, castRecords } from "./fixtures/cast-data";
const sources=castSources(castRecords(),'w');
const cases: [string,(v:any)=>void][] = [
 ['version',v=>v.version=2],['present',v=>v.present=null],['partners',v=>v.partners='wrong'],['warnings[0]',v=>v.warnings=['x'.repeat(601)]],
 ['characters[0].name',v=>v.characters[0].name=''],['characters[0].aliases',v=>v.characters[0].aliases=[1]],['characters[0].reason',v=>v.characters[0].reason=null],
 ['characters[1].sheet.gender',v=>v.characters[1].sheet.gender='PRIVATE CONTENT'],['characters[1].sheet.protagonist',v=>v.characters[1].sheet.protagonist='false'],
 ['characters[1].sheet.appearance',v=>v.characters[1].sheet.appearance='x'.repeat(1201)],['characters[1].sheet.attributes',v=>v.characters[1].sheet.attributes=null],
 ['characters[1].sheet.relationships.initial.trust',v=>v.characters[1].sheet.relationships.initial.trust=101],
 ['characters[1].sheet.relationships.pace',v=>v.characters[1].sheet.relationships.pace='fast'],
 ['characters[1].sheet.relationships.milestones',v=>v.characters[1].sheet.relationships.milestones=null],
 ['characters[1].sheet.relationships.stageBehavior[0]',v=>v.characters[1].sheet.relationships.stageBehavior={PRIVATE_CONTENT:'PRIVATE CONTENT'}],
 ['characters[0].state.action',v=>v.characters[0].state.action='x'.repeat(33)],['characters[0].state.condition',v=>v.characters[0].state.condition=1],
 ['characters[0].state.stats[0].value',v=>v.characters[0].state.stats=[{label:'Coat',value:42}]],
 ['characters[0].evidence[0].source',v=>v.characters[0].evidence[0].source='unknown'],
 ['characters[0].evidence[0].quote',v=>v.characters[0].evidence[0].quote='PRIVATE CONTENT'],
 ['characters[*].key',v=>v.characters[1].key=v.characters[0].key],['characters[*].sheet.protagonist',v=>v.characters[1].sheet.protagonist=true],
 ['present[0]',v=>v.present=['unprepared']],['partners[0]',v=>v.partners=[v.characters[0].key]],
];
for(const [path,mutate]of cases)it('reports exact rule at '+path,()=>{
 const value:any=castDraft('r');mutate(value);
 try{parseCastDraft(JSON.stringify(value),'r',sources);throw Error('unexpected success');}catch(e){expect(e).toBeInstanceOf(CastValidationError);const issues=(e as CastValidationError).issues;expect(issues.some(i=>i.path===path)).toBe(true);expect(JSON.stringify(issues)).not.toContain('PRIVATE');}
});
it('reports duplicate merged keys at the merge boundary',()=>{
 const before=castDraft('r'),after=castDraft('r');after.characters=after.characters.slice(1).map(c=>({...c,name:'Other person',aliases:[],key:before.characters[0]!.key,sheet:{...c.sheet,protagonist:false}}));after.present=[];after.partners=[];
 try{mergeCastBatches(before,after,'r',sources);throw Error('unexpected success');}catch(e){expect(e).toBeInstanceOf(CastValidationError);expect((e as CastValidationError).issues[0]!.path).toBe('characters[*].key');}
});
it('reports an empty unfinished batch and multiple response blocks',()=>{
 expect(()=>parseCastBatch(JSON.stringify({version:1,request:'r',characters:[],more:true,present:[],partners:[],warnings:[]}),'r',sources,2)).toThrow(CastValidationError);
 expect(()=>parseCastBatch('<deeprole_cast>{}</deeprole_cast><deeprole_cast>{}</deeprole_cast>','r',sources,2)).toThrow(CastValidationError);
});
