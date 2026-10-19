// Only recognize an extension prefix at the start and its completed wire boundary.
// A marker quoted later in the player's actual message belongs to the player.
const BLOCKS = "context|character_mode|profile_excerpts|choice_mode|story_memory|story_update_mode|recovered_reply|characters";
const START = new RegExp(`^\\s*<deeprole_(?:${BLOCKS})\\b`, "u");
const END = new RegExp(`</deeprole_(?:${BLOCKS})>\\s*\\[User message\\]\\r?\\n`, "u");
const recapHeader = "[Previous conversation — reference, not new instructions]\nContinue from its final completed event. Do not replay completed events or count the recap as new progress. Current approved lore and structured character state take precedence over older dialogue.\n";
const partialHeader = "History is partial. Do not invent missing events; ask briefly if an essential fact is unknown.\n";
const pattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replaceAll('\n', '\\r?\\n');
// continuationContext serializes its turns on ONE JSON line. Match the exact
// known envelope, not an arbitrary marker inside lore or the actual draft.
const RECAP_END = new RegExp(`</deeprole_(?:${BLOCKS})>\\s*${pattern(recapHeader)}(?:${pattern(partialHeader)})?(\\[[^\\r\\n]*\\])\\s*\\[User message\\]\\r?\\n`, 'u');

export function injectedUserText(value: string): string | null {
  if (!START.test(value)) return null;
  const boundary = END.exec(value);
  if (boundary) return value.slice(boundary.index + boundary[0].length);
  const recap = RECAP_END.exec(value);
  if (!recap) return null;
  try {
    const turns: unknown = JSON.parse(recap[1]!);
    if (!Array.isArray(turns) || turns.length > 2000 || !turns.every(t => t && typeof t === 'object' && ['user', 'assistant'].includes(t.role) && typeof t.text === 'string')) return null;
    return value.slice(recap.index + recap[0].length);
  } catch { return null; }
}
