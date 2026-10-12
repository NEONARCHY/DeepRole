import type { DiscoveryQueueInput } from "../core/discovery-profile-queue";
import { validCharacterDiscoveryPage, type CharacterDiscoveryPage, type DiscoveryProfileInput } from "../core/story-character-discovery";

/** Explicit invocation; reload only reads saved progress and never sends a request. */
export async function runDiscoveryProfileQueue(input: DiscoveryQueueInput, ports: {
  edit: (input: DiscoveryQueueInput) => Promise<void>;
  read: () => Promise<CharacterDiscoveryPage>;
  prepare: (input: DiscoveryProfileInput) => Promise<void>;
  current: () => boolean;
}) {
  const check = () => { if (!ports.current()) throw Error("cancelled"); };
  const read = async () => { check(); const page = await ports.read(); check(); if (!validCharacterDiscoveryPage(page) || page.chatId !== input.chatId || page.worldId !== input.worldId || !page.queue) throw Error("invalid-result"); return page; };
  check(); await ports.edit(input); let page = await read();
  if (input.operation === "clear") return page;
  while (page.queue!.pending) {
    if (page.queue!.stale) throw Error("story-review-stale");
    const next = page.queue!.next; if (!next) throw Error("invalid-result");
    check(); await ports.prepare(next); const after = await read();
    // A successful transport/cleanup is not proof of a durable proposal.
    if (after.queue!.pending >= page.queue!.pending) throw Error("invalid-result");
    page = after;
  }
  return page;
}
