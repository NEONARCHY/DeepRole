// Only recognize an extension prefix at the start and its completed wire boundary.
// A marker quoted later in the player's actual message belongs to the player.
const BLOCKS = "context|character_mode|profile_excerpts|choice_mode|story_memory|story_update_mode|recovered_reply|characters";
const START = new RegExp(`^\\s*<deeprole_(?:${BLOCKS})\\b`, "u");
const END = new RegExp(`</deeprole_(?:${BLOCKS})>\\s*\\[User message\\]\\r?\\n`, "u");

export function injectedUserText(value: string): string | null {
  if (!START.test(value)) return null;
  const boundary = END.exec(value);
  return boundary ? value.slice(boundary.index + boundary[0].length) : null;
}
