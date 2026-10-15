import {compileGameContext,type GameContextOptions,type GameContextInput} from '../../src/core/game-context';
import {rankStoryFacts} from '../../src/core/story-fact-context';
import {storyRetrievalQuery} from '../../src/core/story-retrieval-query';
import {storyContentRelevance} from '../../src/core/story-content-relevance';
import {createStoryRoleReader} from '../../src/core/story-source-roles';
import {storedRoleReader} from '../../src/core/story-role-binding';
import {createEpisodeReader} from '../../src/core/story-episodes';
import {decodeStoryMemory} from '../../src/core/story-memory-transport';
import type {SearchScenario} from './story-search-prototype';
import type {GroundingScenario} from './story-search-grounding';
import type {GroundingCase} from '../../scripts/story-search-grounding.mjs';

/** Explicit comparison profile for the RP258–268 experiments. Every feature
 * option is spelled out: adding another option requires an intentional review.
 * This replays historical measured inputs, NOT a claim to emulate an old binary.
 * Frozen full workload/provenance digests below its callers certify exact replay.
 * Current runtime contracts are tested separately with current defaults. */
export const RP268_CONTEXT_OPTIONS=Object.freeze({
 memoryTransport:'compact',contentRelevance:true,topicAdmission:true,
 continuationBalance:true,actionBalance:true,taskGoalBalance:true,
 compoundActionBalance:true,naturalRecall:true,lastingRecall:true,
 referenceRecall:true,referenceBundle:true,discussionPriority:false,
 flexiblePriority:false,sequencePriority:false,budgetPriority:false,contextualRecall:false,
} satisfies Required<Omit<GameContextOptions,'searchIndex'>>);
export const historicalSearchContext=(input:GameContextInput,lastingRecall=true)=>compileGameContext(input,{...RP268_CONTEXT_OPTIONS,lastingRecall});

/** Reconstruct from original prose/roles/source order. No gold, saved baseline
 * or saved candidate IDs are read here, substituted, truncated or padded. */
export function historicalEvidenceCase(c:SearchScenario){
 const scope={worldId:c.base.world.id,entities:c.input.entities!},roles=createStoryRoleReader(scope,c.input.draft,storedRoleReader(c.seeds,scope.entities,scope.worldId));
 const episodes=createEpisodeReader(c.seeds,c.sources),ranked=rankStoryFacts(c.facts,c.input.draft,scope,roles),original=new Map(c.facts.map((f,i)=>[f.text,'fact-'+i]));
 if(original.size!==c.facts.length)throw Error('Historical fixture repeats exact fact text');
 const current=ranked.filter(r=>episodes.read(r.fact)),ids=new Map(current.map(r=>[r.fact.text,original.get(r.fact.text)!]));
 const block=historicalSearchContext(c.input).text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
 const baseline=block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)).map(h=>ids.get(h.text)!):[];
 const retrieval=storyRetrievalQuery(c.input.draft,scope),admission=storyContentRelevance(ranked.map(r=>r.fact),c.input.draft,retrieval.relevanceNames).admission;
 const selected=ranked.filter(r=>baseline.includes(original.get(r.fact.text)!)).map(r=>r.fact),covered=!!admission?.covers(selected),protectedIdentity=!!roles.question||retrieval.ambiguousName;
 const evidenceIds=baseline.filter(id=>{const fact=c.facts[Number(id.slice(5))]!;return !!fact.task||!!fact.claim||!!Object.keys(roles.read(fact)??{}).length;});
 return {id:c.name,split:c.split,family:c.family,intent:c.intent,query:retrieval.query,
  documents:current.map(r=>({id:ids.get(r.fact.text)!,text:[r.fact.text,r.fact.task?.title??''].filter(Boolean).join('\n'),source:episodes.read(r.fact)!.revisionId})),
  lexical:current.map(r=>ids.get(r.fact.text)!),baseline,gold:c.wanted.map(f=>ids.get(f.text)!),protected:protectedIdentity,
  preserve:protectedIdentity||covered,protectionReason:[protectedIdentity?'owner-or-ambiguous-identity':'',covered?'covered-topic-admission':''].filter(Boolean),evidenceIds};
}

export function historicalGroundingCase(c:GroundingScenario):GroundingCase{
 const scope={worldId:c.base.world.id,entities:c.input.entities!},roles=createStoryRoleReader(scope,c.input.draft,storedRoleReader(c.seeds,scope.entities,scope.worldId));
 const episodes=createEpisodeReader(c.seeds,c.input.story!.episodeSources),ranked=rankStoryFacts(c.input.story!.facts,c.input.draft,scope,roles),ids=new Map(c.facts.map((f,i)=>[f.text,'fact-'+i]));
 if(ids.size!==c.facts.length)throw Error('Historical grounding fixture repeats exact fact text');
 const documents=ranked.map(r=>({id:ids.get(r.fact.text)!,text:[r.fact.text,r.fact.task?.title??''].filter(Boolean).join('\n'),source:episodes.read(r.fact)?.revisionId??'unknown',fact:r.fact,sourceVerified:!!episodes.read(r.fact),roles:roles.read(r.fact)??{},identityStatus:roles.status?.(r.fact)??'legacy'}));
 const block=historicalSearchContext(c.input).text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
 const baseline=block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)).map(h=>ids.get(h.text)!):[],retrieval=storyRetrievalQuery(c.input.draft,scope),byId=new Map(documents.map(d=>[d.id,d]));
 const mandatory=baseline.filter(id=>{const d=byId.get(id)!;return !!d.fact.task||!!d.fact.claim||!!Object.keys(d.roles).length;});
 return {id:c.name,split:c.split,family:c.family,intent:c.intent,query:c.input.draft,documents,lexical:documents.map(d=>d.id),baseline,gold:c.wanted.map(f=>ids.get(f.text)!),protected:!!roles.question||retrieval.ambiguousName,mandatory,names:[...retrieval.relevanceNames],currentSourceIds:[...c.input.story!.episodeSources!]};
}
