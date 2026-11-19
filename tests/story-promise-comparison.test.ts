import { expect, it } from 'vitest';
import { prerequisiteEvidence, promiseComparisonEvidence } from '../src/core/story-promise-comparison';
import { maintenancePremise } from '../src/core/story-maintenance-premise';
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
it('keeps an explicit Russian denial scoped to the observed action and location', () => {
  const observe = maintenancePremise('Можно начинать, раз часы уже починили?')!;
  const here = (part:string) => part.includes('у ворот');
  expect(observe('Утром у ворот часы не починили.',here)).toBe('denied');
  expect(observe('Утром у ворот часы починили.',here)).toBe('reported');
  expect(observe('Утром у ворот проверили часы.',here)).toBeUndefined();
  expect(observe('Утром у ворот проверили часы, а в саду часы починили.',here)).toBeUndefined();
  expect(observe('Если бы у ворот часы починили, мы бы услышали звон.',here)).toBeUndefined();
});
function compare(facts:StoryFact[],question=draft,missing?:StoryFact) {
  const reader=createStoryRoleReader(scope,question);
  return promiseComparisonEvidence(facts,question,scope,{...reader,status:f=>reader.read(f)?'bound':'unknown'},{
    read:f=>f===missing?undefined:{episode:1,period:'earlier-turn',revisionId:'source-'+facts.indexOf(f)},position:f=>facts.indexOf(f),
  });
}

it('uses the designated job, its marking and the last observation of its prerequisite', () => {
  const job:StoryFact = {...row('promise','Rosa promised Cora the west panel for the theatre after a pressure test.'),
    task:{key:'west',title:'Deliver panel',status:'open'}};
  const other = row('promise','Dina promised Cora the east panel for the gallery after a pressure test.');
  const mark = row('event','Cora tied a red ribbon to the west panel and a blue ribbon to the east panel.');
  const machine = row('event','Rosa replaced the machine beside the west panel.');
  const pending = row('event','The pressure test of the west panel is still pending.');
  const later = row('event','The west panel passed the pressure test and shipment was authorized.');
  const query = 'Can we ship the marked one for the theatre now that the machine works? Whose job is it?';
  function select(extra:StoryFact[], question=query) {
    const facts = [job,other,...extra], reader = createStoryRoleReader(scope,question);
    return prerequisiteEvidence(facts,question,scope,{...reader,status:f=>reader.read(f)?'bound':'unknown'},{
      read:f=>({episode:1,period:'earlier-turn',revisionId:'source-'+facts.indexOf(f)}),position:f=>facts.indexOf(f),
    });
  }
  expect(select([mark,machine])).toEqual({facts:[job,mark],certain:false});
  expect(select([mark,pending,machine,row('belief','Dina believes that the west panel passed the pressure test.')])).toEqual({facts:[job,mark,pending],certain:true});
  expect(select([mark,pending,later])).toEqual({facts:[job,mark,later],certain:true});
  expect(select([row('event','Cora marked the east panel blue.'),pending])).toEqual({facts:[job,pending],certain:false});
  expect(select([mark,{...pending,quote:'Only the east panel is still awaiting its pressure test.'}])).toEqual({facts:[job,mark],certain:false});
  expect(select([mark,pending],query.replace('for the theatre','for the depot'))).toBeUndefined();
  const gaugeQuery = query.replace('the machine works','the gauge was replaced');
  const denied = row('event','Rosa did not replace the gauge beside the west panel.');
  const replaced = row('event','Rosa replaced the gauge beside the west panel.');
  const unrelated = [
    machine, row('event','If Rosa replaced the gauge beside the west panel, the reading would improve.'),
    row('event','Rosa replaced the gauge beside the east panel and checked the west panel.'),
    row('event','Rosa replaced the gauge cover beside the west panel.'),
    row('event','Rosa inspected the gauge beside the west panel.'), {...denied,text:replaced.text},
  ];
  expect(select([mark,pending,...unrelated],gaugeQuery)).toEqual({facts:[job,mark,pending],certain:true,unverified:true});
  for (const witness of [denied,replaced]) {
    expect(select([mark,pending,...unrelated,witness],gaugeQuery)).toEqual({facts:[job,mark,pending,witness],certain:true});
  }
});

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
