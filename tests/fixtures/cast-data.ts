import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import { DEFAULT_RELATIONSHIP } from "../../src/core/relationships";
import type { CastDraft } from "../../src/core/cast-initialization";
import type { WorldProfile, ChatBinding, DataRecord } from "../../src/core/types";
export const castWorld: WorldProfile = { id:"w", name:"Test story", description:"Leon is the protagonist. Mira trusts Leon after he kept his promise. They are together at the gate.", color:"#123456", contextBudget:2000, relevanceThreshold:6,createdAt:1,updatedAt:1 };
export const castBinding: ChatBinding = { id:"binding:a",chatId:"a",chatUrl:"https://chat.deepseek.com/chat/s/a",worldId:"w",bookId:null,focusIds:[],messageCountAtAnalysis:0,createdAt:1,updatedAt:1 };
export const castRecords = (): DataRecord[] => [{kind:"world",id:"w",data:structuredClone(castWorld)},{kind:"binding",id:castBinding.id,data:structuredClone(castBinding)}];
export function castDraft(request:string): CastDraft {
 const member = (key:string,name:string,protagonist:boolean) => ({key,name,aliases:[],sheet:{...structuredClone(EMPTY_CHARACTER),protagonist,appearance:"Blue coat",personality:"Keeps promises",goals:"Open the gate",background:"Traveller",attributes:[{id:"energy",label:"Energy",initial:75,low:"Tired",high:"Rested",cap:5}]},state:{...EMPTY_STATUS,condition:"Rested",goal:"Open the gate",relationship:"Friends"},completed:[],reason:"Scores inferred from keeping the promise.",evidence:[{source:"w",quote:protagonist?"Leon is the protagonist.":"Mira trusts Leon after he kept his promise."}]});
 const hero=member("p1","Leon",true), mira=member("p2","Mira",false);
 return {version:1,request,characters:[hero,{...mira,completed:["promise"],sheet:{...mira.sheet,relationships:{...structuredClone(DEFAULT_RELATIONSHIP),initial:{trust:82,affinity:71},boundaries:"Needs honesty",reactions:"Values promises",milestones:[{id:"promise",label:"Kept a promise",required:false}]}}}],present:["p1","p2"],partners:["p2"],warnings:[]};
}
