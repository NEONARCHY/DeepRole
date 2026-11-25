/** The extension and desktop client use separate trusted chat origins. */
declare const __DEEPROLE_DESKTOP__: boolean;
export const IS_DESKTOP = typeof __DEEPROLE_DESKTOP__ !== "undefined" && __DEEPROLE_DESKTOP__;
export const DEEPSEEK_ORIGIN = "https://chat.deepseek.com";
export const CHAT_ORIGIN = IS_DESKTOP
  ? "https://deeprole.local"
  : DEEPSEEK_ORIGIN;
export const CHAT_HOME = `${CHAT_ORIGIN}/`;
