import { tokenize } from './text';

// Query-local vocabulary for CANDIDATES, never canonical IDs, role bindings or
// action proof. Related containers/optical instruments may name different things;
// the caller must retain every literal source and its uncertainty guard.
const groups = [
  ['telescope', 'observing tube', 'телескоп', 'труба'],
  ['pump', 'помпа', 'насос'],
  ['curtain', 'drape', 'занавес', 'портьера'],
  ['case', 'box', 'container', 'футляр', 'коробка', 'коробочка'],
  ['envelope', 'packet', 'конверт', 'пакет'],
  ['basket', 'carrier', 'корзина', 'корзинка'],
  ['silver', 'silvery', 'серебряный', 'серебристый'],
  ['red', 'scarlet', 'crimson', 'красный', 'алый', 'алую', 'алого', 'алому', 'алым'],
  ['birch', 'birchbark', 'берестяной', 'берестяная', 'береста'],
  ['spring', 'родниковый', 'родниковая', 'источник'],
];
const equivalents = new Map<string, string>();
for (const [index, group] of groups.entries()) for (const phrase of group) {
  // Only individual words are equated; a phrase cannot join source fields or
  // cross a name/barrier. "observing tube" contributes "tube", not an action.
  const term = tokenize(phrase).at(-1);
  if (term) equivalents.set(term, `__topic_${index}`);
}
export const topicTerm = (term: string) => equivalents.get(term) ?? term;

/** A bounded unordered query window also permits "pump at the spring".
 * Source membership remains an exact literal label match in the caller. */
export function topicWindow(clauses: string[][], terms: string[]) {
  const target = terms.map(topicTerm);
  return clauses.some(words => words.some((_, at) => {
    const window = words.slice(at, at + Math.max(6, terms.length)).map(topicTerm);
    const barrier = window.indexOf('__deeprole_name__');
    const available = barrier < 0 ? window : window.slice(0, barrier);
    return target.every(term => available.includes(term));
  }));
}
