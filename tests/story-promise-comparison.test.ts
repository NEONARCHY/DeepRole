import { expect, it } from 'vitest';
import { promiseComparisonEvidence } from '../src/core/story-promise-comparison';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import type { StoryFact } from '../src/core/story-update';
import { storyWorld } from './fixtures/story-worlds';

const world=storyWorld('en');
world.entities.forEach((p,i)=>{p.name=['Rosa','Cora','Dina'][i]!;});
const scope={worldId:world.world.id,entities:world.entities};
const row=(kind:StoryFact['kind'],text:string):StoryFact=>({kind,text,quote:text});
const brass=row('promise','Rosa promised Cora the brass compass after calibration.');
const bone=row('promise','Rosa promised Dina the bone compass after polishing.');
const scene=row('event','The brass compass went in a felt pouch, while the bone compass was packed in a leather sleeve.');
const draft='Compare Rosa’s promises to Cora and Dina. How do I tell the items apart?';
function compare(facts:StoryFact[],question=draft,missing?:StoryFact) {
  const reader=createStoryRoleReader(scope,question);
  return promiseComparisonEvidence(facts,question,scope,{...reader,status:f=>reader.read(f)?'bound':'unknown'},{
    read:f=>f===missing?undefined:{episode:1,period:'earlier-turn',revisionId:'source-'+facts.indexOf(f)},position:f=>facts.indexOf(f),
  });
}

it('uses both beneficiaries of a common giver, including explicit repeated names',()=>{
  const spare=row('promise','Rosa promised the school an iron compass after cleaning.');
  for(const q of [draft,'Compare Rosa’s promise to Cora with Rosa’s promise to Dina.']) {
    expect(compare([brass,bone,spare,scene],q)).toEqual({facts:[brass,bone,scene],certain:true});
  }
});
it('declines a rumour, a missing source and a comparison present only in the summary',()=>{
  const biased={...scene,quote:'The brass compass was packed for travel.'};
  for (const fact of [biased,{...scene,kind:'belief'} as StoryFact,row('event','Someone guessed the brass compass was in felt, while the bone compass was in leather.')]) {
    expect(compare([brass,bone,fact])).toEqual({facts:[brass,bone],certain:false});
  }
  expect(compare([brass,bone,scene],draft,scene)).toEqual({facts:[brass,bone],certain:false});
});
it('retains a single witnessed scene that describes both prerequisites',()=>{
  const conditions=row('event','Calibration of the brass compass is finished, while polishing of the bone compass is still pending.');
  const query='Compare Rosa’s promises to Cora and Dina. Have the conditions been met?';
  expect(compare([brass,bone,conditions],query)).toEqual({facts:[brass,bone,conditions],certain:true});
  expect(compare([brass,bone,scene,conditions],draft+' Have the conditions been met?')).toEqual({facts:[brass,bone,scene,conditions],certain:true});
});
it('does not decide between multiple plausible promises for the same party',()=>{
  const extra=row('promise','Rosa promised Dina a silver clock.');
  expect(compare([brass,bone,extra,scene])).toEqual({facts:[brass],certain:false});
});
it('does not turn a one-sided question or an ordinary action into a comparison',()=>{
  expect(compare([brass,bone,scene],'What did Rosa promise Cora?')).toBeUndefined();
  expect(compare([brass,bone,scene],'I compare the brass and bone compasses on the counter.')).toBeUndefined();
});
