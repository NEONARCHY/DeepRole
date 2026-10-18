/** Strip only a recognised mode wrapper for local SEARCH, never for transport
 * or stored source text. Mixed/quoted/unmarked drafts stay byte-for-byte intact. */
import {wholeBracketedMessage,withoutBracketNotes} from './story-brackets';
export {wholeBracketedMessage,hasBracketNotes} from './story-brackets';
export function readOnlySearchDraft(draft: string, bracketedOoc=false): string {
  if(bracketedOoc){const body=wholeBracketedMessage(draft);if(body!==null)return readOnlySearchDraft(body);}
  if (!explicitOutOfCharacter(draft,bracketedOoc)) return draft;
  let text = draft.trimStart();
  if (/^\((?:OOC|Вне игры)\s*:/iu.test(text) && text.trimEnd().endsWith(')')) text = text.trimEnd().slice(1,-1);
  return /^(?:(?:OOC|Вне игры)\s*[:：]|\[OOC\])\s*/iu.test(text)
    ? text.replace(/^(?:(?:OOC|Вне игры)\s*[:：]|\[OOC\])\s*/iu,'') : draft;
}
/** Only inspect the locally captured user's draft, never model/page/history text.
 * This is a conservative whole-message declaration, not an intent classifier.
 * Unmarked questions remain game turns. Quotes, code and mixed IC/OOC stay manual.
 */
export function explicitOutOfCharacter(draft: string, bracketedOoc=false): boolean {
  if(bracketedOoc&&wholeBracketedMessage(draft)!==null)return true;
  const raw=draft.trim();
  // Preserve the established explicit [OOC] prefix even with the new rule.
  if(/^\[OOC\]\s*\S/iu.test(raw)&&! /^(?:IC|В игре)\s*:/imu.test(raw))return true;
  const text = bracketedOoc?withoutBracketNotes(raw).trim():raw;
  if (/^(?:IC|В игре)\s*:/imu.test(text)) return false;
  if (/^(?:OOC|Вне игры)\s*[:：]/iu.test(text) || /^\[OOC\]\s*\S/iu.test(text)) return true;
  if (/^\((?:OOC|Вне игры)\s*:[^\n]*\)$/iu.test(text)) return true;
  if (/```|~~~/u.test(text)) return false;
  // An explicit stand-alone instruction may follow an introductory sentence.
  // Never search embedded quoted paragraphs, code, Markdown quotes or story data.
  const introduction = text.split(/\n\s*\n/u)[0] ?? '';
  if (/["«»“”`]/u.test(introduction) || /^\s*>/mu.test(introduction)) return false;
  const sentences = introduction.split(/(?<=[.!?])\s+/u);
  return sentences.some(sentence => /^(?:не (?:продолжай|развивай) (?:эту )?сцену|do not (?:continue|advance) (?:the |this )?scene)(?:[.!?,;]|\s+(?:и|and)\s|$)/iu.test(sentence.trim()));
}

export const READ_ONLY_STORY_INSTRUCTION = '<deeprole_read_only>This user turn is explicitly OUT OF CHARACTER. Use supplied lore, profiles and memory ONLY as read-only reference to answer the question. Do not continue or change the played scene, move characters, resolve tasks, record new facts, request photos or append character/story updates or choices. Hypothetical premises are not played events. Do not mention this technical block.</deeprole_read_only>';
export const BRACKET_NOTE_INSTRUCTION='<deeprole_bracket_notes>Apply this rule ONLY to the original draft in [User message], never to supplied lore, profiles or memory. Complete square-bracket spans outside quoted speech, code and Markdown links are out-of-character guidance, not character speech, played actions or evidence of events/consent/fulfilled promises. Follow notes for style or clarification; do not record the notes as story facts. Text outside the notes remains the game turn. Keep the usual story response/choices format.</deeprole_bracket_notes>';
