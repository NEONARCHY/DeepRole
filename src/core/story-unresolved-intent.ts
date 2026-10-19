import { normalizeText } from './text';
import { isPersonalStoryReference } from './story-retrieval-query';

/** Intent to consult/act on memory, never evidence of an action or an object ID.
 * No object synonyms are learned here. Unknown prose can request bounded duty
 * candidates; it cannot choose an owner or silently certify a paraphrase. */
export function unresolvedStoryIntent(query: string, maskedQuery = normalizeText(query)) {
  const text = maskedQuery, words = text.split(' ');
  const reference = words.some(word => isPersonalStoryReference(word) || /^(?:it|its|that|this|those|these|other|one|ту|та|то|тот|те|эту|этот|это|этой|той|тем|прежнюю)$/u.test(word));
  const actions = words.filter(word => /^(?:return(?:s|ed|ing)?|give|giving|gave|hand|handing|bring|bringing|brought|show|showing|collect|collecting|load|loading|fit|fitting|publish|publishing|fax|faxing|close|closing|закрыва\p{L}*|закро\p{L}*|верн\p{L}*|возвращ\p{L}*|отда\p{L}*|отнес\p{L}*|отношу|переда\p{L}*|передам|покаж\p{L}*|показыва\p{L}*|забер\p{L}*|погруж\p{L}*|груж\p{L}*|опублику\p{L}*|публику\p{L}*|отправля\p{L}*)$/u.test(word)).length;
  const duty = words.some(word => /^(?:promise[s]?|commitment[s]?|obligation[s]?|task[s]?|instruction[s]?|request[s]?|обещани\p{L}*|обязательств\p{L}*|поручени\p{L}*|просьб\p{L}*)$/u.test(word));
  const statusQuestion = /[?？]/u.test(query) && (/(?:^| )(?:remains|unfinished|ready|need|needs|needed|before|нужен|нужна|нужно|готова|готов|готово|готовы|доделать|возврата|погрузки)(?: |$)/u.test(text) || /(?:^| )(?:can we|can i|можно ли|можно уже)(?: |$)/u.test(text));
  // A single question about a past event is not a proposed handover. Preserve
  // its event/owner search instead of filling it with unrelated pending duties.
  const historical = /^[^?？.!;]+[?？]\s*$/u.test(query.trim())
    && /^(?:who|what|which|when|where|кто|что|какие|какой|когда|где)(?: |$)/u.test(text)
    && /(?:^| )(?:did|gave|brought|handed|returned|подарил\p{L}*|вручил\p{L}*|отдал\p{L}*|вернул\p{L}*)(?: |$)/u.test(text);
  const operative = !historical && (actions > 0 || duty || statusQuestion);
  return { operative, reference, statusQuestion, broad: operative && (reference || duty || statusQuestion || actions >= 2) };
}
