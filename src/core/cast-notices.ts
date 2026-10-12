import type { CastDraft } from "./cast-initialization";

const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/ё/gu,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
function fingerprint(text: string): string {
  // Only this narrow, single-sentence factual template is treated as a paraphrase.
  const repair = /^ремонт (.+?) (?:только )?запланирован (?:но|и) не (?:выполнен|завершен)$/u.exec(normalized(text));
  const english = /^(?:the )?(.+?) repair is (?:only )?planned (?:but|and) not (?:completed|done)$/u.exec(normalized(text));
  return repair || english ? `planned-repair:${(repair ?? english)![1]}` : normalized(text);
}
function resolvedProgress(text: string, draft: CastDraft): boolean {
  const value = normalized(text);
  return draft.characters.some(c => [c.name,...c.aliases].some(name => {
    const start = normalized(name);
    if (!start || !value.startsWith(start + " ")) return false;
    const tail = value.slice(start.length + 1);
    return /^(?:еще )?не подготовлен[ао]?(?: (?:он |она )?(?:остается|останется) на следующий батч| и остается вне этого батча)?$/u.test(tail)
      || /^(?:is )?(?:not yet prepared|has not been prepared yet)(?: (?:and )?(?:she |he |they )?(?:remains? for|will be prepared in) the next batch)?$/u.test(tail);
  }));
}

/** Presentation only: preserve original model output and never infer new story facts. */
export function castNotices(draft: CastDraft): { review: string[]; notes: string[] } {
  const review: string[] = [], notes: string[] = [], seen = new Set<string>();
  for (const warning of draft.warnings) {
    if (resolvedProgress(warning,draft)) continue;
    const key = fingerprint(warning);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // Unknown model remarks remain visible for review; don't guess their severity.
    const context = key.startsWith("planned-repair:")
      || /^(?:романтических отношений в лоре нет|романтические отношения в лоре отсутствуют|there are no romantic relationships in (?:the )?lore)$/u.test(key)
      || /^(?:the )?\w+ repair is (?:only )?planned (?:but|and) not (?:completed|done)$/u.test(key)
      || /^[\p{L}\p{N} ]+ в последней сцене находится в [\p{L}\p{N} ]+ а не у [\p{L}\p{N} ]+ (?:он|она) включен[а]? в present как участни(?:ца|к) текущего состояния истории но не той же локации$/u.test(key);
    (context ? notes : review).push(warning);
  }
  return {review,notes};
}
