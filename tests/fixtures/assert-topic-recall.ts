import {expect} from 'vitest';
import {compileGameContext,addedContextTokens,type GameContextInput} from '../../src/core/game-context';
import {decodeStoryMemory} from '../../src/core/story-memory-transport';
import type {GameMemoryCoverage} from '../../src/core/game-memory-coverage';
import type {StoryFact} from '../../src/core/story-update';
import {NARRATIVE_RECALL_GUIDE} from '../../src/core/story-narrative-recall';
const hints=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
/** RP337 intentionally supplements previously declined drafts. Verify the new
 * contract without rewriting historical gold or weakening source/identity proof. */
export function assertTopicRecall(input:GameContextInput,current:ReturnType<typeof compileGameContext>,prior:ReturnType<typeof compileGameContext>,substantive:StoryFact[]){
 const before=structuredClone(input),selected=hints(current.text);let coverage:GameMemoryCoverage|undefined;
 expect(compileGameContext(input,{},v=>{coverage=v})).toEqual(current);
 expect(coverage).toMatchObject({kind:'incomplete',reason:'query'});
 expect(current.text).toContain(NARRATIVE_RECALL_GUIDE);
 for(const guard of prior.text.matchAll(/<deeprole_reference_guard>[\s\S]*?<\/deeprole_reference_guard>/gu))expect(current.text).toContain(guard[0]);
 const episodes=input.story!.episodeSources??input.story!.world.sharedGame?.episodeSources;
 const seeds=input.story!.roleSeeds??input.story!.world.sharedGame?.factRoleSeeds;
 for(const h of selected){const fact=input.story!.facts.find(f=>f.text===h.text);expect(fact).toBeDefined();expect(h.kind).toBe(fact!.kind);expect(h.sourceQuote??h.text).toBe(fact!.quote);expect(h.task).toEqual(fact!.task);expect(h.claim).toEqual(fact!.claim);expect(episodes).toContain(h.episodeSource?.revisionId);const seed=seeds?.find(s=>s.binding.sourceRevisionId===h.episodeSource?.revisionId&&s.binding.quote===fact!.quote);if(seed)expect(h.sourceRoles??{}).toEqual(seed.binding.roles);}
 for(const h of hints(prior.text).filter(h=>substantive.some(f=>f.text===h.text)))expect(selected).toContainEqual(h);
 expect(current.report.total).toBe(addedContextTokens(current.text));expect(current.report.total).toBeLessThanOrEqual(current.report.limit);expect(input).toEqual(before);
}
