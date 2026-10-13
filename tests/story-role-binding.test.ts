import {expect,it} from "vitest";
import {captureRoleRoster,sourceRoleRoster,bindStoryRoles,roleSeed,storedRoleReader,validRoleRoster,validRoleBinding,validFactRoleSeeds,selectedRoleSeeds} from "../src/core/story-role-binding";
import {createStoryRoleReader} from "../src/core/story-source-roles";
import {storyWorld} from "./fixtures/story-worlds";
import type {StoryRevision} from "../src/core/story-records";
import type {StoryFact} from "../src/core/story-update";
import {validStoryFact} from "../src/core/story-update";
import type {MergeSeeds} from "../src/core/story-character-merge";
const fixture=()=>{const w=storyWorld("en",3);w.entities[0]!.name="Nora";w.entities[1]!.name="Mira";w.entities[2]!.name="Other";return w;};
const fact:StoryFact={kind:"promise",text:"Bring tools if the road opens.",quote:'Nora told Mira: “I promise to bring tools if the road opens.”'};
const source=(w:ReturnType<typeof fixture>):StoryRevision=>({format:"deeprole-story",contractVersion:1,type:"revision",id:"source",worldId:w.world.id,playthroughId:"game",branchId:"branch",createdAt:1,updatedAt:1,role:"assistant",messageId:"message",nativeMessageKey:"key",parentRevisionId:null,requestId:null,completion:"complete",content:fact.quote,roleRoster:sourceRoleRoster(captureRoleRoster(w.entities,w.world.id),w.world.id,fact.quote)});
it("freezes only names/aliases, filters source mentions and retains ambiguous collision witnesses",()=>{
 const w=fixture();w.entities[2]!.name="Nora Vale";const full=captureRoleRoster(w.entities,w.world.id),frozen=sourceRoleRoster(full,w.world.id,fact.quote);
 expect(full[0]).toEqual({id:"person-1",name:"Nora",aliases:[]});expect(frozen).toHaveLength(3);expect(bindStoryRoles(fact,{...source(w),roleRoster:frozen}).roles.promisor).toBeUndefined();
 w.entities[0]!.name="Changed";expect(full[0]!.name).toBe("Nora");expect(JSON.stringify(full)).not.toContain("Age 35");
});
it("binds a quote to its original source revision and never accepts extra model fact fields",()=>{
 const w=fixture(),binding=bindStoryRoles(fact,source(w));expect(validRoleBinding(binding)).toBe(true);expect(binding).toMatchObject({sourceRevisionId:"source",quote:fact.quote,roles:{promisor:{id:"person-1",name:"Nora"},recipient:{id:"person-2",name:"Mira"}}});
 expect(validStoryFact({...fact,memoryRoles:binding})).toBe(false);expect(validStoryFact(fact)).toBe(true);
});
it("keeps identity after renaming without rewriting source names or facts",()=>{
 const w=fixture(),binding=bindStoryRoles(fact,source(w)),seeds=[roleSeed(fact,binding)];w.entities[0]!.name="Eva";
 const r=createStoryRoleReader({worldId:w.world.id,entities:w.entities},"What did Eva promise?",storedRoleReader(seeds,w.entities,w.world.id));
 expect(r.read(fact)?.promisor).toEqual({id:"person-1",name:"Eva",sourceName:"Nora"});expect(r.score(fact)).toBe(40);expect(binding.roles.promisor!.name).toBe("Nora");expect(fact.quote).toContain("Nora");
});
it("does not transfer an old promise to a new same-name person or a replacement alias",()=>{
 const w=fixture(),seeds=[roleSeed(fact,bindStoryRoles(fact,source(w)))];w.entities[0]!.name="Eva";w.entities[2]!.name="Nora";
 const r=createStoryRoleReader({worldId:w.world.id,entities:w.entities},"What did Nora promise?",storedRoleReader(seeds,w.entities,w.world.id));expect(r.read(fact)?.promisor?.id).toBe("person-1");expect(r.score(fact)).toBe(-12);
});
it("marks a removed historical person unavailable instead of resolving through their name",()=>{
 const w=fixture(),seeds=[roleSeed(fact,bindStoryRoles(fact,source(w)))];w.entities=w.entities.slice(1);w.entities[1]!.name="Nora";
 const r=createStoryRoleReader({worldId:w.world.id,entities:w.entities},"What did Nora promise?",storedRoleReader(seeds,w.entities,w.world.id));expect(r.read(fact)?.promisor).toMatchObject({id:"person-1",name:"Nora",unavailable:true});expect(r.score(fact)).toBe(-12);
});
it("follows only an explicit selected merge and restores the original ID on undo",()=>{
 const w=fixture(),seeds=[roleSeed(fact,bindStoryRoles(fact,source(w)))],merged={...w.entities[0]!,id:"merged",name:"Nora Vale"};
 const merges:MergeSeeds={decision:{sourceIds:["person-1","person-3"],mergedId:"merged",canonical:{name:merged.name,aliases:[]}}};
 const withMerge=storedRoleReader(seeds,[merged,w.entities[1]!],w.world.id,merges);expect(withMerge(fact)?.promisor).toEqual({id:"merged",name:"Nora Vale",sourceName:"Nora",sourceId:"person-1"});
 expect(storedRoleReader(seeds,w.entities,w.world.id)(fact)?.promisor).toEqual({id:"person-1",name:"Nora"});expect(seeds[0]!.binding.roles.promisor!.id).toBe("person-1");
});
it("does not choose among conflicting merges or loop on cycles",()=>{
 const w=fixture(),seeds=[roleSeed(fact,bindStoryRoles(fact,source(w)))];const merges:MergeSeeds={a:{sourceIds:["person-1","person-3"],mergedId:"a",canonical:{name:"A",aliases:[]}},b:{sourceIds:["person-1","person-2"],mergedId:"b",canonical:{name:"B",aliases:[]}}};
 expect(storedRoleReader(seeds,w.entities,w.world.id,merges)(fact)?.promisor?.id).toBe("person-1");
 merges.b={sourceIds:["a","person-2"],mergedId:"person-1",canonical:{name:"Nora",aliases:[]}};expect(storedRoleReader(seeds,w.entities,w.world.id,merges)(fact)?.promisor?.id).toBe("person-1");
});
it("keeps explicitly unknown legacy-source ownership unknown after people are added",()=>{
 const w=fixture(),s=source(w);delete s.roleRoster;const binding=bindStoryRoles(fact,s),seeds=[roleSeed(fact,binding)];expect(binding.roles).toEqual({});
 expect(createStoryRoleReader({worldId:w.world.id,entities:w.entities},"",storedRoleReader(seeds,w.entities,w.world.id)).read(fact)).toBeUndefined();
});
it("keeps unbound managed history unknown instead of using a current same-name person",()=>{
 const w=fixture(),reader=createStoryRoleReader({worldId:w.world.id,entities:w.entities},"What did Nora promise?",storedRoleReader([],w.entities,w.world.id,{},true));
 expect(reader.read(fact)).toBeUndefined();expect(reader.status!(fact)).toBe("unknown");expect(reader.score(fact)).toBe(0);
});
it("fails closed for changed evidence and preserves binding after only a summary edit",()=>{
 const w=fixture(),binding=bindStoryRoles(fact,source(w)),changed={...fact,text:"Edited summary"},reader=storedRoleReader([roleSeed(changed,binding)],w.entities,w.world.id);
 expect(reader(changed)?.promisor?.id).toBe("person-1");expect(reader({...changed,quote:fact.quote+"Changed"})).toBeNull();
});
it("selects current bindings by exact fact/evidence, without leaking an alternative or superseded quote",()=>{
 const w=fixture(),binding=bindStoryRoles(fact,source(w)),seeds=[roleSeed(fact,binding)];expect(selectedRoleSeeds([],seeds)).toEqual([]);expect(selectedRoleSeeds([{...fact,quote:"Other"}],seeds)).toEqual([]);expect(selectedRoleSeeds([fact],seeds)).toEqual(seeds);
 const copied=selectedRoleSeeds([fact],seeds);copied[0]!.binding.roles.promisor!.name="Mutation";expect(seeds[0]!.binding.roles.promisor!.name).toBe("Nora");
});
it.each(["duplicate","foreign-role","extra","bad-source","wrong-quote"])("rejects invalid stored binding shape %s",kind=>{
 const w=fixture(),binding:any=bindStoryRoles(fact,source(w));let seeds:any=[roleSeed(fact,binding)];
 if(kind==="duplicate")seeds.push(structuredClone(seeds[0]));if(kind==="foreign-role")seeds[0].binding.roles.invented={id:"person-1",name:"Nora"};if(kind==="extra")seeds[0].binding.roles.promisor.unavailable=true;if(kind==="bad-source")seeds[0].binding.sourceRevisionId="__proto__";if(kind==="wrong-quote")seeds[0].binding.quote="No source";
 expect(validFactRoleSeeds(seeds,[fact])).toBe(false);
});
it("rejects duplicate roster IDs and protects request-local results against mutation",()=>{
 const w=fixture(),roster=captureRoleRoster(w.entities,w.world.id);expect(validRoleRoster([...roster,roster[0]!])).toBe(false);
 const reader=storedRoleReader([roleSeed(fact,bindStoryRoles(fact,source(w)))],w.entities,w.world.id);reader(fact)!.promisor!.name="Poison";expect(reader(fact)!.promisor!.name).toBe("Nora");
});
