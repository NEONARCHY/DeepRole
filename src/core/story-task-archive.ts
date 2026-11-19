import type { StoryRecord, StoryBaseline, StoryBranch } from './story-records';
import type { WorldProfile } from './types';
import { projectStoryBranch } from './story-projection';
import { validEpisodeLineage } from './story-episodes';
import { roleSeed, validRoleBinding, type FactRoleSeed } from './story-role-binding';
import { storyFactIdentity } from './story-memory-lifecycle';
import { storyReplyProse, type StoryFact } from './story-update';

export interface TaskArchive { facts: StoryFact[]; roleSeeds: FactRoleSeed[] }
/** Read-only view of accepted checkpoints and selected events. The active
 * episode lineage bounds earlier chat segments; unrelated branches, drafts and
 * rejected proposals are never searched. Missing evidence stays missing. */
export function readTaskArchive(records: StoryRecord[], world: WorldProfile, branchId: string, origins?: Map<string, string>): TaskArchive | undefined {
  const game = world.sharedGame;
  if (!game?.managed || game.restartPending || !game.episodeSources?.length) return;
  const all = new Map(records.map(r => [r.id, r]));
  if (all.size !== records.length) return;
  const branch = all.get(branchId), baseline = branch?.type === 'branch' ? all.get(branch.baselineId) : undefined;
  if (branch?.type !== 'branch' || !branch.gameManaged || baseline?.type !== 'baseline'
    || baseline.worldId !== world.id || baseline.gameId !== game.id
    || baseline.origin.bindingId !== game.activeBindingId || baseline.origin.chatId !== game.activeChatId) return;
  if (!validEpisodeLineage(game.episodeSources, records, {worldId:world.id,gameId:game.id})) return;
  const allowed = new Set(game.episodeSources), bases = new Map<string,StoryBaseline>([[baseline.id,baseline]]);
  const segmentHeads = new Map<string,{branch:StoryBranch;head:string}>();
  for (const id of game.episodeSources) {
    const r=all.get(id), owner=r && all.get(r.branchId), base=owner?.type==='branch' ? all.get(owner.baselineId) : undefined;
    if(r?.type!=='revision'||owner?.type!=='branch'||base?.type!=='baseline'||base.gameId!==game.id)return;
    bases.set(base.id,base);segmentHeads.set(base.id,{branch:owner,head:id});
  }
  const candidates: {fact:StoryFact;seed?:FactRoleSeed}[]=[], removed=new Set<string>();
  const checkpoint = new Map<string, string>();
  const add=(fact:StoryFact,seed?:FactRoleSeed)=>{
    for(const key of fact.replaces??[])removed.add(key);
    if(fact.task)candidates.push({fact,seed});
  };
  try {
    const currentClosings = new Map(game.facts.flatMap(f => f.task && f.task.status !== "open" ? [[f.task.key, f] as const] : []));
    const sourceRows = new Map<string, Map<string, {fact:StoryFact; seed?:FactRoleSeed}>>();
    // Older transfers can omit the link on their receiving checkpoint. A
    // played segment on this exact lineage may still witness the same closure.
    for (const base of bases.values()) {
      if (!base.priorTaskSeeds?.length) continue;
      const closedHere = new Set(base.factSeeds?.flatMap(f => {
        const current = f.task && currentClosings.get(f.task.key);
        return current && current.quote === f.quote && storyFactIdentity(current) === storyFactIdentity(f) ? [f.task!.key] : [];
      }));
      for (const ref of base.priorTaskSeeds) {
        let rows = sourceRows.get(ref.baselineId);
        if (!rows) {
          const old = all.get(ref.baselineId);
          if (old?.type !== "baseline" || old.gameId !== game.id || old.worldId !== world.id) return;
          const seeds = new Map(old.factRoleSeeds?.map(s => [s.key,s]));
          rows = new Map((old.factSeeds ?? []).map(fact => {
            const key = storyFactIdentity(fact);
            return [key, {fact, seed:seeds.get(key)}];
          }));
          sourceRows.set(old.id,rows);
        }
        const row = rows.get(ref.key);
        if (row?.fact.kind !== "promise" || row.fact.task?.status !== "open"
          || (base.id !== baseline.id && !closedHere.has(row.fact.task.key))) continue;
        candidates.push(row);
        checkpoint.set(ref.key, ref.baselineId);
      }
    }
    for(const base of bases.values()){
      const seeds=new Map((base.factRoleSeeds??[]).map(s=>[s.key,s]));
      for(const fact of base.factSeeds??[]){
        const key=storyFactIdentity(fact);
        add(fact,seeds.get(key));
        if(origins && fact.task && seeds.has(key)) checkpoint.set(key,base.id);
      }
      const segment=base.id===baseline.id?{branch,head:branch.headRevisionId}:segmentHeads.get(base.id);
      if(!segment)continue;
      const projection=all.get(segment.branch.projectionId??'');
      // Pre-automation legacy checkpoints can supply seeds, never unapproved events.
      if(!projection){if(base.id===baseline.id)return;continue;}
      if(projection.type!=='projection'||projection.branchId!==segment.branch.id
        ||projection.baselineId!==base.id||projection.headRevisionId!==segment.branch.headRevisionId
        ||projection.selectionVersion!==segment.branch.selectionVersion)return;
      const projected=projectStoryBranch(records,segment.branch.id,segment.head,projection.acceptedEventIds);
      for(const id of projected.appliedEventIds){
        const event=all.get(id), source=event?.type==='event' ? all.get(event.revisionId) : undefined;
        if(event?.type!=='event'||!event.memory||source?.type!=='revision'||!allowed.has(source.id)
          ||source.completion!=='complete'||source.storyPurpose==='out-of-character')continue;
        add(event.memory,event.memoryRoles?roleSeed(event.memory,event.memoryRoles):undefined);
      }
    }
  }catch{return;}
  const found=new Map<string,{fact:StoryFact;seed:FactRoleSeed}>();
  for(const {fact,seed} of candidates){
    const key=storyFactIdentity(fact),source=seed && all.get(seed.binding.sourceRevisionId);
    if(removed.has(key)||!seed||seed.key!==key||!validRoleBinding(seed.binding)||seed.binding.quote!==fact.quote
      ||source?.type!=='revision'||source.worldId!==world.id||source.completion!=='complete'
      ||source.storyPurpose==='out-of-character'||!allowed.has(source.id)||!storyReplyProse(source.content).includes(fact.quote))continue;
    const old=found.get(key);
    // Conflicting frozen evidence is not resolved by array order.
    if(old&&JSON.stringify(old.seed)!==JSON.stringify(seed))return;
    found.set(key,{fact,seed});
  }
  if (origins) for (const key of found.keys()) {
    const id = checkpoint.get(key);
    if (id) origins.set(key, id);
  }
  return {facts:[...found.values()].map(v=>v.fact),roleSeeds:[...found.values()].map(v=>v.seed)};
}

export function transferTaskSeeds(records: StoryRecord[], world: WorldProfile): StoryBaseline["priorTaskSeeds"] {
  const game = world.sharedGame;
  if (!game?.managed || game.restartPending) return;
  const closed = new Set(game.facts.flatMap(f => f.task && f.task.status !== "open" ? [f.task.key] : []));
  if (!closed.size) return;
  const projection = records.find(r => r.type === "projection" && r.bindingId === game.activeBindingId && r.worldId === world.id);
  if (!projection) return;
  const origins = new Map<string, string>();
  const archive = readTaskArchive(records, world, projection.branchId, origins);
  const refs = archive?.facts.flatMap(f => {
    const key = storyFactIdentity(f), baselineId = origins.get(key);
    return baselineId && f.kind === "promise" && f.task?.status === "open" && closed.has(f.task.key) ? [{baselineId, key}] : [];
  });
  return refs?.length ? refs : undefined;
}
