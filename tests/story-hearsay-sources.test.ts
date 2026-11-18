import { expect,it } from 'vitest';
import { hearsayEvidence } from '../src/core/story-hearsay';
import type { StoryFact } from '../src/core/story-update';

const fact=(text:string,kind:StoryFact['kind']='event'):StoryFact=>({text,quote:text,kind});
const belief=fact('Vera thinks the green beacon was delivered.','belief');
const draft='Vera thinks the green beacon was delivered. I check her story against the register.';
function select(records:StoryFact[],text=draft,missing?:StoryFact){
  return hearsayEvidence(records,text,['Vera'],{question:undefined,read:()=>undefined,score:()=>0,status:()=>'unknown'},
    {position:f=>records.indexOf(f)+1,read:f=>f===missing?undefined:{revisionId:f.quote,episode:1,period:'earlier-turn'}});
}
it('does not promote a second report, an empty ledger or an entry about a different beacon',()=>{
  for(const row of [
    fact('The register repeats a rumour that the green beacon was delivered.'),
    fact('The register contains no entry about delivery of the green beacon.'),
    fact('The register confirms that the red beacon was delivered.'),
    fact('The green beacon sits on the shelf beside the register.'),
    fact('Vera says the register confirms that the green beacon was delivered.'),
    fact('The register shows that delivery of the green beacon is scheduled for next week.'),
  ])expect(select([belief,row])?.certain).toBe(false);
});
it('requires the original quote and the recorded scene for corroboration',()=>{
  const entry=fact('The register confirms that the green beacon was delivered.');
  expect(select([belief,entry])).toEqual({facts:[belief,entry],certain:true});
  expect(select([belief,entry],draft,entry)).toEqual({facts:[belief],certain:false});
  expect(select([belief,{...entry,quote:'The red beacon was delivered.'}])?.certain).toBe(false);
});
it('a newly raised rumour can retrieve a recorded event without inventing an earlier belief',()=>{
  const entry=fact('The register confirms that the green beacon was delivered.');
  expect(select([entry])).toEqual({facts:[entry],certain:true});
  expect(select([belief],'I check the register for the quarterly totals.')).toBeUndefined();
});
