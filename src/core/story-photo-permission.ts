import type { EpisodeReader } from './story-episodes';
import { storyRecallLexicon } from './story-natural-recall';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { normalizeText, storyObjectTokens } from './text';

type Scope = 'full' | 'partial' | 'prohibited' | 'unknown';
const scopeGuide: Record<Scope, string> = {
  full: 'The source permits a whole-object photograph. Preserve the stated audience, purpose and conditions. Do not extend this to publication.',
  partial: 'Only the stated part or angle may be photographed. Tell the player exactly what must stay out of frame.',
  prohibited: 'The source forbids the requested whole-object shot. Preserve the scope of the recorded restriction, including who issued it.',
  unknown: 'A whole-object photograph is not established. Inspection, sketching, hearsay and permission for another object cannot establish consent. If necessary, clarify in the scene.',
};
export const photoGuide = (scope: Scope) => '<deeprole_reference_guard>photo-scope=' + scope + ' ' + scopeGuide[scope] + ' Treat the question as an inquiry, not a completed photograph.</deeprole_reference_guard>';

const camera = /(?:^| )(?:с?фотограф\p{L}*|сфотк\p{L}*|снимок|фото|photograph\p{L}*|photos?|pictures?)(?: |$)/u;
const phone = /(?:^| )(?:сн(?:ять|имать)|съемк\p{L}*)(?: |$)/u;
const copy = /(?:^| )(?:копирова\p{L}*|copying|copy)(?: |$)/u;
const whole = /(?:^| )(?:целиком|полностью|все это|все сразу|весь|всю|все|entire|whole|in full|all of it)(?: |$)/u;
const permit = /(?:^| )(?:разреш\p{L}*|можно|допускается|allow\p{L}*|permit\p{L}*|may|can)(?: |$)/u;
const deny = /(?:^| )(?:запрет\p{L}*|запрещ\p{L}*|нельзя|не разреш\p{L}*|отозва\p{L}*|forbade|forbid\p{L}*|prohibited|banned|revoked|must not|may not|cannot|not permitted|not allowed|no photos)(?: |$)/u;
const view = /(?:^| )(?:осмотр\p{L}*|рассмотр\p{L}*|срисова\p{L}*|показа\p{L}*|листать|inspect|see|view|sketch|look at|leafed through)(?: |$)/u;
const limitedFrame = /(?:только (?:с (?:лицев|обратн|одной)|обложк|фотографи\p{L}* обложк|лицев|фрагмент|часть)|only (?:from (?:the (?:front|back|side)|one side)|the (?:front|back|cover)|a photograph of the cover)|кроме (?:подпис|адрес|имен|обложк)|except (?:the )?(?:signature|address|names|cover)|only with .{1,35} (?:hidden|covered))/u;
const covering = /(?:прикры\p{L}*|закры\p{L}*|скры\p{L}*|covered|hid|over the address)/u;
const uncertain = /(?:^| )(?:якобы|наверное|возможно|кажется|слух\p{L}*|считает|сомнева\p{L}*|вероятно|думает|будто|perhaps|maybe|rumou?r|supposedly|believes?|thinks?|might)(?: |$)/u;
const cuts = /[.!?？;:\n]|\s+(?:и|или|либо|and|or|beside|рядом с)\s+/iu;
const capturePermission = /(?:^| )(?:(?:разреш\p{L}*|можно) (?:только )?(?:с?фотограф\p{L}*|снять|снимать|сделать (?:фото|снимок))|(?:с?фотографировать|снимать) (?:можно|разреш\p{L}*)|(?:may|can|allowed to|permitted to) (?:be photographed|photograph|take (?:a )?(?:photo|picture))|(?:allowed|permits?|permitted) (?:photographing|taking (?:a )?(?:photo|picture))|(?:photograph\p{L}*|picture|photo).{0,90} (?:is |was )?(?:permitted|allowed))(?: |$)/u;
// Singular, explicitly presented object with no adjective or trailing phrase.
const presentedObject = /(?:^| )(?:достал[аи]?|развернул[аи]?|открыл[аи]?|показал[аи]?|протянул[аи]?|поднял[аи]?|opened|unrolled|unfolded|showed|presented|held out|lifted) (?:the |a |an )?(\p{L}{3,})$/u;
const bareRuleObject = /(?:^| )(?:(?:с?фотографировать|снимать|осмотреть|photograph(?:ing)?|inspect|sketch) (?:the |a |an )?(\p{L}{3,})(?= (?:целиком|полностью|только|запрещено|нельзя|для|in full|only|for)(?!\p{L})|$)|^(?:the )?(\p{L}{3,}) (?:may be photographed|must not be photographed|можно (?:с?фотографировать|снимать)|фотографировать нельзя)(?: |$))/u;

function isPhotoQuestion(draft: string) {
  if (draft.length > 350 || !/[?？]$/u.test(draft.trim()) || /[<>"«»\n]/u.test(draft)) return false;
  const text = normalizeText(draft);
  if (!whole.test(text) || !camera.test(text) && !(phone.test(text) && text.includes('телефон'))) return false;
  // A named object in the question has its own retrieval path. Only accept
  // an elliptical camera question here, optionally with a purpose or device.
  const question = text.replace(/^.*(?:собираюсь |get ready to )/u, '').split(/ (?:для|for) /u)[0]!;
  return /(?:^| )(?:можно|can|could|may)(?: |$)/u.test(text) &&
    question.split(' ').every(word => /^(?:а|и|тогда|можно|мне|ли|сфотографировать|сфоткать|фотографировать|сделать|снимок|снять|на|телефон|это|его|ее|все|всю|весь|целиком|полностью|may|can|could|i|we|photograph|take|a|photo|picture|of|the|this|that|it|thing|whole|entire|all|in|full|on|my|phone)$/u.test(word));
}

function rule(text: string): Scope | 'view' | undefined {
  const normalized = normalizeText(text);
  if (uncertain.test(normalized) || /[?？]/u.test(text)) return;
  if (/(?:^| )(?:публиков\p{L}*|публикаци\p{L}*|выкладыва\p{L}*|posting|publish\p{L}*|sell\p{L}*)(?: |$)/u.test(normalized)) return;
  const shot = camera.test(normalized) || phone.test(normalized) && /(?:телефон|камер|кадр|сторон)/u.test(normalized);
  if (!shot && !(copy.test(normalized) && whole.test(normalized))) {
    if (view.test(normalized) && permit.test(normalized)) return 'view';
    return;
  }
  if (/(?:не запрет|не запрещ|not forbidden|never forbade|never banned|used to|formerly|no longer|раньше|прежде)/u.test(normalized)) return 'unknown';
  if (deny.test(normalized)) {
    const qualified = /(?:^| )(?:if|unless|until|flash|after dark|если|пока|до открытия|со вспышкой)(?: |$)/u.test(normalized);
    return limitedFrame.test(normalized) || qualified ? 'unknown' : 'prohibited';
  }
  if (permit.test(normalized) && limitedFrame.test(normalized)) return 'partial';
  if (capturePermission.test(normalized) && whole.test(normalized) && !copy.test(normalized)) return 'full';
  return 'unknown';
}

// Link the rule to the object in the same clause. An immediately following
// instruction about "the original sheet" may qualify that clause. An explicit
// rule for a different named item cannot qualify a neighbouring sentence.
function policyFor(text: string, objectKeys: Set<string>, mask: (s: string) => string, bare?: string) {
  const policies = new Set<Scope | 'view'>();
  let preceding = false;
  for (const clause of text.split(/[.!?？;,\n]|\s+(?:но|а|и|but|and|whereas)\s+/iu)) {
    if (!clause.trim()) continue;
    const direct = [...pairs(clause, mask, bare)].some(key => objectKeys.has(key));
    const refersBack = /(?:^| )(?:исходный лист|оригинал|его|ее|original sheet|original page|photograph it|copy it)(?: |$)/u.test(normalizeText(clause));
    if (direct || preceding && refersBack) {
      const policy = rule(clause);
      if (policy) policies.add(policy);
    }
    preceding = direct;
  }
  if (policies.size > 1) policies.delete('view');
  return policies.size > 1 ? 'unknown' : policies.values().next().value;
}

// Both words in an object description must be adjacent in the previous
// message and in the recorded evidence. A shared noun (e.g. "lantern") is
// insufficient. Common staging language cannot supply that second word.
const staging = new Set(storyObjectTokens(normalizeText('перед нами на столе положила протянула показала подняла вынесла последний этот гость стол ладонь перед стоит у окна beside the window held out on the table toward the visitors in front of us brought in put down set down next to up to the light the whole thing may i can i')).filter(Boolean));
function pairs(text: string, mask: (s: string) => string, bare?: string) {
  const keys = new Set<string>();
  for (const part of text.split(cuts)) {
    const masked = mask(part), words = storyObjectTokens(masked);
    if (bare) {
      const match = bareRuleObject.exec(masked);
      if (storyObjectTokens(match?.[1] ?? match?.[2] ?? '')[0] === bare) keys.add(bare);
    }
    for (let i = 1; i < words.length; i++) {
      if (!staging.has(words[i-1]!) && !staging.has(words[i]!)) keys.add(words[i-1] + ' ' + words[i]);
    }
  }
  return keys;
}

export function photoPermissionEvidence(facts: StoryFact[], draft: string, recent: string[], names: string[], roles?: StoryRoleReader, episodes?: EpisodeReader) {
  if (!isPhotoQuestion(draft)) return;
  const unresolved = (facts: StoryFact[] = []) => ({ scope: 'unknown' as Scope, certain: false, facts });
  const latest = recent.at(-1)?.trim();
  if (!latest || latest.length > 3000 || /[<>?？]/u.test(latest) || uncertain.test(normalizeText(latest)) ||
    /(?:^| )(?:не|вместо|not|instead of)(?: |$)/u.test(normalizeText(latest)) || !roles || !episodes) return unresolved();
  const { mask } = storyRecallLexicon(names);
  const parts = latest.split(cuts).filter(part => part.trim());
  const bare = parts.length === 1 ? storyObjectTokens(presentedObject.exec(mask(latest))?.[1] ?? '')[0] : undefined;
  const anchors = parts.map(part => pairs(part, mask));
  if (bare) anchors[0]!.add(bare);
  const rows = [];
  for (const fact of facts) {
    if (fact.kind !== 'event' && fact.kind !== 'secret' || fact.claim?.status === 'ended') continue;
    const normalized = normalizeText(fact.text);
    if (!camera.test(normalized) && !phone.test(normalized) && !copy.test(normalized) && !view.test(normalized) && !covering.test(normalized)) continue;
    const shield = covering.test(normalized) && covering.test(normalizeText(fact.quote));
    const text = pairs(fact.text, mask, bare), quote = fact.text === fact.quote ? text : pairs(fact.quote, mask, bare);
    if (bare && !text.has(bare) && storyObjectTokens(mask(fact.text)).includes(bare)) return unresolved();
    const hits = anchors.map(anchor => [...anchor].filter(key => text.has(key) && quote.has(key)));
    if (!hits.some(group => group.length)) continue;
    const keys = new Set(hits.flat());
    const policy = policyFor(fact.text, keys, mask, bare);
    if (!policy && !shield) continue;
    const verified = !!episodes.read(fact) && roles.status?.(fact) !== undefined &&
      !Object.values(roles.read(fact) ?? {}).some(person => person.unavailable);
    rows.push({ fact, policy, shield, hits, verified: verified && (fact.quote === fact.text || policyFor(fact.quote, keys, mask, bare) === policy) });
  }
  const relevant = rows.filter(row => row.policy);
  if (!relevant.length || relevant.some(row => !row.verified)) return unresolved();
  // A second focus requires an actual scene connecting both (e.g. a privacy
  // strip on the map). A rule for only one of two objects cannot resolve "it".
  const shields = rows.filter(row => row.shield && row.verified);
  if (anchors.length > 1 && !(relevant.every(row => row.policy === 'prohibited') &&
    shields.some(row => row.hits.every(group => group.length)))) return unresolved();
  const cameraRules = relevant.filter(row => row.policy !== 'view');
  if (!cameraRules.length) return unresolved(relevant.slice(0, 4).map(row => row.fact));
  const scopes = new Set(cameraRules.map(row => row.policy));
  const selected = [...new Set([...cameraRules, ...shields].map(row => row.fact))];
  if (selected.length > 8) return unresolved();
  selected.sort((a, b) => episodes.position(a) - episodes.position(b));
  const scope = scopes.size === 1 ? cameraRules[0]!.policy as Scope : 'unknown';
  return { scope, certain: scope !== 'unknown', facts: selected };
}
