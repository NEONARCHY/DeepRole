import { identityOwners } from "./story-character-identity";
import type { SceneEntity } from "./types";

const speechVerb = String.raw`сказал[аи]?|спросил[аи]?|ответил[аи]?|прошептал[аи]?|шепнул[аи]?|произн[её]с(?:ла|ли)?|добавил[аи]?|пробормотал[аи]?`;
const speakerAfterDash = new RegExp(String.raw`^\s*[—–]\s*[^\n]{1,500}?[,!?…»”]\s*[—–]\s*(?:${speechVerb})\s+([^.,!?…:;—–\n]{1,80}?)(?=\s+и\s|[.,!?…:;—–]|$)`, "iu");
const speakerBeforeQuote = new RegExp(String.raw`^\s*([^.,!?…:;—–\n]{1,80}?)\s+(?:${speechVerb}|said|asked|replied|whispered)\s*:\s*[«“"—–]`, "iu");
const speakerAfterQuote = /^\s*[“"][^\n]{1,500}?[”"]\s+([^.,!?…:;—–\n]{1,80}?)\s+(?:said|asked|replied|whispered)\b/iu;
const visibleAction = /^\s*([^.,!?…:;—–\n«»"“”]{1,80}?)\s+(?:замер(?:ла|ли)?|приподнял[аи]?|фыркнул[аи]?|кивнул[аи]?|усмехнул(?:ся|ась|ись)|улыбнул(?:ся|ась|ись)|отвернул(?:ся|ась|ись)|шагнул[аи]?|вздрогнул[аи]?|наклонил(?:ся|ась|ись)|встал[аи]?|сел[аи]?|nodded|smiled|flinched|paused|turned)(?![\p{L}\p{N}_])/iu;
const subject = String.raw`^\s*([^.,!?…:;—–\n«»"“”]{1,80}?)\s+(?:(?:тихо|молча|снова|затем|спокойно|quietly|then)\s+)?`;
const room = String.raw`(?:комнат|зал|мастерск|кабинет|кухн|коридор|спальн|гостин|помещен|библиотек)\p{L}*`;
const arrival = new RegExp(String.raw`${subject}(?:(?:вош[её]л|вошла|входит|заходит|заш[её]л|зашла|вернул(?:ся|ась)|возвращается)\s+(?:в\s+${room}|через дверь|на порог)|появил(?:ся|ась)\s+(?:в дверях|на пороге)|(?:entered|enters|walked into|walks into|stepped into|steps into|returned to|returns to)\s+(?:the\s+)?(?:room|workshop|hall|kitchen|office|library|doorway)\b)`, "iu");
const exit = String.raw`(?:(?:встал[аи]?|вста[её]т|кивнул[аи]?|кивает|прощается|попрощал(?:ся|ась)|улыбнул(?:ся|ась)|stood up|nodded|smiled)\s+(?:и|and)\s+)?(?:(?:покинул[аи]?|покидает)\s+${room}|(?:выш[её]л|вышла|выходит|уш[её]л|ушла|уходит)(?=\s*(?:[,.!?;…]|$)|\s+(?:из\s+${room}|за дверь|в коридор))|(?:left|leaves|exited|exits)\s+(?:the\s+)?(?:room|workshop|hall|kitchen|office|library)\b|(?:walked out|walks out|stepped out|steps out)(?=\s*(?:[,.!?;…]|$)|\s+of\s+(?:the\s+)?(?:room|workshop|hall|kitchen|office|library)\b))`;
const departure = new RegExp(subject + exit, "iu");
const detachedReturn = /^\s*(?:(она)\s+вернулась|(он)\s+вернулся)[\s.!…]*$/iu;
const feminineDeparture = /\s(?:покинула|вышла|ушла)(?=\s|[,.!?;…]|$)/iu;
const masculineDeparture = /\s(?:покинул|выш[её]л|уш[её]л)(?=\s|[,.!?;…]|$)/iu;
const remoteOrRemembered = /(?:телефон|по связи|по рации|громк\p{L}* связи|вчера|накануне|в детстве|вспомн\p{L}*|припомн\p{L}*|представи\p{L}*|yesterday|earlier that day|last night|remember\w*|imagin\w*|phone|radio|speakerphone|voicemail)/iu;
const conditional = /(?:^|\s)(?:бы|если|будь|would|could|if)(?=\s|[.,!?…]|$)/iu;
const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" });

/** A facts-only packet leaves membership to the visible story. An explicit
 * list (including an empty or rejected list) is handled by the scene parser. */
export function hasPortraitCast(text: string): boolean {
  if (!text.includes("<deeprole_characters>")) return false;
  const blocks = [...text.matchAll(/<deeprole_characters>\s*([\s\S]*?)\s*<\/deeprole_characters>/gu)];
  if (blocks.length !== 1) return true;
  try {
    const packet = JSON.parse(blocks[0]![1]!);
    return !packet || typeof packet !== "object" || Array.isArray(packet) || Object.hasOwn(packet, "present");
  } catch { return true; }
}

type ReturnPronoun = "она" | "он";
type PortraitObservation = { id: string; present: boolean; pronoun?: ReturnPronoun } | { returning: ReturnPronoun };

/** Literal prose observations from one played reply. */
export function observePortraitPresence(entities: SceneEntity[], paragraphs: string[]): PortraitObservation[] {
  const observations: PortraitObservation[] = [];
  const ownerOf = (name: string | undefined) => {
    if (!name) return undefined;
    const owners = identityOwners(entities, name);
    const owner = owners.length === 1 ? entities.find(entity => entity.id === owners[0]!.id) : undefined;
    return owner?.characterSheet && !owner.characterSheet.protagonist ? owner.id : undefined;
  };
  let previousActor: string | undefined;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (remoteOrRemembered.test(paragraph) || remoteOrRemembered.test(paragraphs[index - 1] ?? "")) {
      previousActor = undefined;
      continue;
    }
    const speaker = speakerAfterDash.exec(paragraph) ?? speakerBeforeQuote.exec(paragraph) ?? speakerAfterQuote.exec(paragraph);
    const speakerId = ownerOf(speaker?.[1]);
    if (speakerId) observations.push({ id: speakerId, present: true });
    if (/^\s*[—–]/u.test(paragraph)) { previousActor = undefined; continue; }
    const narration = paragraph.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu, " ");
    for (const { segment, index: offset } of sentences.segment(narration)) {
      const antecedent = previousActor;
      previousActor = undefined;
      if (conditional.test(segment)) continue;
      // Other sentences in this reply can introduce their own referent.
      const returning = index === 0 && offset === 0 ? detachedReturn.exec(segment) : null;
      if (returning) {
        observations.push({ returning: returning[1] ? "она" : "он" });
        continue;
      }
      const left = departure.exec(segment);
      const entered = left ? null : arrival.exec(segment);
      const match = left ?? entered ?? visibleAction.exec(segment);
      if (!match?.[1]) continue;
      const pronoun = /^(?:он|она|he|she)$/iu.test(match[1]);
      const actor = pronoun ? (left || entered ? antecedent : undefined) : ownerOf(match[1]);
      if (!actor) continue;
      const departurePronoun = left
        ? feminineDeparture.test(left[0]) ? "она" : masculineDeparture.test(left[0]) ? "он" : undefined
        : undefined;
      observations.push({ id: actor, present: !left, pronoun: departurePronoun });
      if (!pronoun && /^[\s.!?…]*$/u.test(segment.slice(match[0].length))) previousActor = actor;
    }
  }
  return observations;
}

/** Replay the selected line in order. A bare return needs one recent known departure. */
export function replayPortraitPresence(turns: readonly PortraitObservation[][]): Map<string, boolean> {
  const presence = new Map<string, boolean>();
  const departures = new Map<string, { turn: number; pronoun?: ReturnPronoun }>();
  for (const [turn, observations] of turns.entries()) {
    for (const observation of observations) {
      if ("id" in observation) {
        presence.set(observation.id, observation.present);
        if (observation.present) departures.delete(observation.id);
        else departures.set(observation.id, { turn, pronoun: observation.pronoun });
      } else if (departures.size === 1) {
        const [id, departure] = departures.entries().next().value!;
        // Leave at most two played replies between departure and return.
        if (turn - departure.turn <= 3 && departure.pronoun === observation.returning) {
          presence.set(id, true);
          departures.delete(id);
        }
      }
    }
  }
  return presence;
}

export function portraitPresence(entities: SceneEntity[], paragraphs: string[]): Map<string, boolean> {
  return replayPortraitPresence([observePortraitPresence(entities, paragraphs)]);
}
