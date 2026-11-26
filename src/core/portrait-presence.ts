import { identityOwners } from "./story-character-identity";
import type { SceneEntity } from "./types";

const speechVerb = String.raw`сказал[аи]?|спросил[аи]?|ответил[аи]?|прошептал[аи]?|шепнул[аи]?|произн[её]с(?:ла|ли)?|добавил[аи]?|пробормотал[аи]?`;
const speakerAfterDash = new RegExp(String.raw`^\s*[—–]\s*[^\n]{1,500}?[,!?…»”]\s*[—–]\s*(?:${speechVerb})\s+([^.,!?…:;—–\n]{1,80}?)(?=\s+и\s|[.,!?…:;—–]|$)`, "iu");
const speakerBeforeQuote = new RegExp(String.raw`^\s*([^.,!?…:;—–\n]{1,80}?)\s+(?:${speechVerb}|said|asked|replied|whispered)\s*:\s*[«“"—–]`, "iu");
const speakerAfterQuote = /^\s*[“"][^\n]{1,500}?[”"]\s+([^.,!?…:;—–\n]{1,80}?)\s+(?:said|asked|replied|whispered)\b/iu;
const visibleAction = /^\s*([^.,!?…:;—–\n«»"“”]{1,80}?)\s+(?:замер(?:ла|ли)?|приподнял[аи]?|фыркнул[аи]?|кивнул[аи]?|усмехнул(?:ся|ась|ись)|улыбнул(?:ся|ась|ись)|отвернул(?:ся|ась|ись)|шагнул[аи]?|вздрогнул[аи]?|наклонил(?:ся|ась|ись)|встал[аи]?|сел[аи]?|nodded|smiled|flinched|paused|turned)(?![\p{L}\p{N}_])/iu;
const remoteOrRemembered = /(?:телефон|по связи|по рации|громк\p{L}* связи|вчера|накануне|в детстве|вспомн\p{L}*|припомн\p{L}*|представи\p{L}*|yesterday|earlier that day|last night|remember\w*|imagin\w*|phone|radio|speakerphone|voicemail)/iu;
const conditional = /(?:^|\s)(?:бы|если|будь|would|could|if)(?=\s|[.,!?…]|$)/iu;

/** Display-only fallback from a named speaker or an observed physical action. */
export function portraitParticipants(entities: SceneEntity[], paragraphs: string[]): string[] {
  const ids = new Set<string>();
  for (const [index, paragraph] of paragraphs.entries()) {
    if (remoteOrRemembered.test(paragraph) || remoteOrRemembered.test(paragraphs[index - 1] ?? "")) continue;
    const match = speakerAfterDash.exec(paragraph) ?? speakerBeforeQuote.exec(paragraph) ?? speakerAfterQuote.exec(paragraph)
      ?? (!conditional.test(paragraph) ? visibleAction.exec(paragraph) : null);
    if (!match?.[1]) continue;
    const owners = identityOwners(entities, match[1]);
    const owner = owners.length === 1 ? entities.find(entity => entity.id === owners[0]!.id) : undefined;
    if (owner?.characterSheet && !owner.characterSheet.protagonist) ids.add(owner.id);
    if (ids.size === 4) break;
  }
  return [...ids];
}
