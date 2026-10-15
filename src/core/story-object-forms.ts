import {stemToken, tokenize} from './text';

// Retrieval-only supplement to the existing stemmer. A four-letter plural
// (сани, часы) is deliberately left intact by the shared tokenizer. Compare
// that spelling with explicit plural case endings, without changing the shared
// index, accepting arbitrary prefixes, or claiming a noun's identity/meaning.
const shortPlural = /^[а-я]{3}[ыи]$/u;
const pluralCases = /^(?:ей|ев|ов|ям|ам|ями|ами|ях|ах)$/u;
function inflectedPair(a: string, b: string) {
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return shortPlural.test(short) && long.startsWith(short.slice(0, -1)) && pluralCases.test(long.slice(3));
}

/** Input words/field have already been normalized and roster names masked by
 * the action parser. All object words must remain adjacent in ONE source
 * clause/field. '#' is a barrier, never an omitted person or inferred owner. */
export function storyObjectForms(words: readonly string[]) {
  const target = words.filter(w => tokenize(w).length).map(word => ({word, stem: stemToken(word)}));
  if (!target.some(t => shortPlural.test(t.word) || /^[а-я]{3}(?:ей|ев|ов|ям|ам|ями|ами|ях|ах)$/u.test(t.word))) return;
  return (normalizedField: string) => {
    const field = normalizedField.split(' ').filter(w => w === '#' || tokenize(w).length).map(word => ({word, stem: stemToken(word)}));
    return field.some((_, at) => {
      let inflected = false;
      for (let i = 0; i < target.length; i++) {
        const a = target[i]!, b = field[at + i];
        if (!b || b.word === '#') return false;
        if (a.stem === b.stem) continue;
        if (!inflectedPair(a.word, b.word)) return false;
        inflected = true;
      }
      return inflected;
    });
  };
}

export function sameStoryObjectForms(a: string, b: string) {
  return tokenize(a).length === tokenize(b).length && !!storyObjectForms(a.split(' '))?.(b);
}
