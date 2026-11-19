import { expect, it } from 'vitest';
import { promisePairEvidence } from '../src/core/story-promise-pair';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import type { StoryFact } from '../src/core/story-update';
import { storyWorld } from './fixtures/story-worlds';

const world=storyWorld('en');
world.entities.forEach((person,index)=>{person.name=['Rosa','Cora','Dina'][index]!;});
const scope={worldId:world.world.id, entities:world.entities};
const make=(kind:StoryFact['kind'],text:string):StoryFact=>({kind,text,quote:text});
const promise=make('promise','Rosa promised Cora the jade carving after inspection.');
const neighbour=make('promise','Rosa promised Dina the jade carving after inspection.');
const delivered=make('event','Rosa handed the jade carving to Cora.');
const otherDelivery=make('event','Rosa handed the jade carving to Dina.');
const draft='What did Rosa promise Cora, and how did the handover end?';
const outcomeQuestion = "How did Rosa’s violin promise end? What was the original condition and what proves the handover?";
it('keeps the original condition, its relevant inspection and the terminal record together', () => {
  const open:StoryFact = {...make('promise','Rosa promised Cora a violin after inspection of the pegs.'),task:{key:'instrument',title:'Violin',status:'open'}};
  const final:StoryFact = {...make('event','Cora received the violin.'),task:{...open.task!,status:'completed'}};
  const check = make('event','Cora inspected the pegs on the violin.');
  const decoys = [make('event','Cora inspected the pegs on the cello.'),make('event','Cora never inspected the pegs on the violin.')];
  const recallOutcome = (rows:StoryFact[], closing=final) => recall([...rows,closing],outcomeQuestion,undefined,[open]);
  expect(recallOutcome([check,...decoys])).toEqual({facts:[open,check,final],certain:true});
  const signed = {...final,...make('event','Cora signed the form for the violin.')};
  expect(recallOutcome([], signed)).toEqual({facts:[open,signed],certain:false});
  const unrelated = {...final,...make('event','Cora received the flute. The violin is still missing.')};
  expect(recallOutcome([], unrelated)).toEqual({facts:[open,unrelated],certain:false});
  expect(recallOutcome([{...check,quote:'Cora inspected the pegs on the cello.'}])).toEqual({facts:[open,final],certain:true});
  expect(recall([final],outcomeQuestion,undefined,[{...open,...make('promise','Rosa promised Cora a flute after inspection of the violin.')}]))
    .toEqual({facts:[],certain:false});
});
function recall(facts:StoryFact[], query=draft, missing?:StoryFact, archive:StoryFact[]=[]) {
  const original=createStoryRoleReader(scope,query);
  const ordered=[...archive,...facts];
  return promisePairEvidence(facts,query,scope,{...original,status:fact=>original.read(fact)?'bound':'unknown'},{
    read:fact=>fact===missing?undefined:{episode:1,period:'earlier-turn',revisionId:'scene-'+ordered.indexOf(fact)},
    position:fact=>ordered.indexOf(fact),
  },archive);
}

it('distinguishes actual transfers of identical objects by their explicit endpoints',()=>{
  expect(recall([promise,neighbour,otherDelivery,delivered])).toEqual({facts:[promise,delivered],certain:true});
  expect(recall([promise,neighbour,otherDelivery])).toEqual({facts:[promise],certain:false});
});
it('declines an unattributed outcome shared by two otherwise identical agreements',()=>{
  const receipt=make('event','The handover of the jade carving was entered in the ledger.');
  expect(recall([promise,neighbour,receipt])).toEqual({facts:[promise],certain:false});
});
it('requires both the summary and its source, and never promotes hearsay',()=>{
  const mismatch={...promise,quote:neighbour.quote};
  expect(recall([mismatch,delivered])).toEqual({facts:[],certain:false});
  expect(recall([promise,delivered],draft,delivered)).toEqual({facts:[promise],certain:false});
  expect(recall([promise,{...delivered,kind:'belief'}])).toEqual({facts:[promise],certain:false});
});
it('keeps each answerable part and warns for the missing part of a two-part question',()=>{
  expect(recall([promise,delivered],'What did Rosa promise Cora? Was the receipt signed and how did the handover end?'))
    .toEqual({facts:[promise,delivered],certain:false});
});
it('keeps separate promises of the same pair ambiguous until the object is specified',()=>{
  const second=make('promise','Rosa promised Cora a silver brooch once the mounting was finished.');
  expect(recall([promise,second],'What did Rosa promise Cora?')).toEqual({facts:[promise,second],certain:false});
  expect(recall([promise,second],'What did Rosa promise Cora about the silver brooch?')).toEqual({facts:[second],certain:true});
  expect(recall([promise,second],'What did Rosa promise Cora about the silver thimble?')).toEqual({facts:[],certain:false});
});
it('leaves coordinated inquiries and possessive recipient descriptions to the general compiler',()=>{
  expect(recall([promise],'What did Rosa promise Cora? What did Cora promise Rosa?')).toBeUndefined();
  expect(recall([promise],"What did Rosa promise Cora’s sister?")).toBeUndefined();
});
it('restores the original agreement with its later closed state only when both revisions are available',()=>{
  const past:StoryFact={...promise,task:{key:'carving',title:'Jade carving',status:'open'}};
  const current:StoryFact={...delivered,task:{key:'carving',title:'Jade carving',status:'completed'}};
  const terms='What did Rosa promise Cora?';
  expect(recall([current,neighbour],terms,undefined,[past])).toEqual({facts:[past,current],certain:true});
  expect(recall([current,neighbour],terms,current,[past])).toEqual({facts:[],certain:false});
});

it('separates a destination from the person addressed and checks what was signed for',()=>{
  const open:StoryFact={...make('promise','Rosa promised Cora a violin for the music school.'),task:{key:'violin',title:'Violin',status:'open'}};
  const closed:StoryFact={...make('event','Dina collected the violin and signed for the violin.'),task:{...open.task!,status:'completed'}};
  const query='What did Rosa promise the music school, and who signed for the violin?';
  const neighbour=make('promise','Rosa promised Cora a flute after a concert for the music school.');
  expect(recall([neighbour,closed],query,undefined,[open])).toEqual({facts:[open,closed],certain:true});
  expect(recall([neighbour],query)).toEqual({facts:[],certain:false});
  expect(recall([closed],query.replace('signed for the violin','signed for the flute'),undefined,[open])).toEqual({facts:[open,closed],certain:false});
  expect(recall([closed],query.replace('music school','music hall'),undefined,[open])).toEqual({facts:[],certain:false});
});
