import { MemorySearchIndexOwner } from './memory-search-index';
import { StoryFactSearchIndexOwner } from './story-fact-search-index';
import type { StoryFact } from './story-update';

/** In-memory owner for one page/compiler, never a global text/ID registry.
 * Scope changes and vault locking release all strong references. Preparing
 * current membership prunes deleted/undone/replaced data on the next compile. */
export class GameSearchIndex {
 readonly lore = new MemorySearchIndexOwner();
 readonly facts = new StoryFactSearchIndexOwner();
 private scope: string | undefined;
 begin(scope: string, facts: StoryFact[]) {
  if (scope !== this.scope) { this.clear(); this.scope = scope; }
  return this.facts.prepare(facts);
 }
 clear() { this.lore.clear(); this.facts.clear(); this.scope = undefined; }
}
