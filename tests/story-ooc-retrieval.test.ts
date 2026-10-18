import { expect, it } from 'vitest';
import { compileGameContext } from '../src/core/game-context';
import { rp05IndependentPlotScenarios } from './fixtures/story-rp05-independent-plot';
import { readOnlySearchDraft } from '../src/core/story-message-mode';
it.each(['Обычный вопрос?', '> OOC: quoted', '```\nOOC: code\n```', 'Он сказал: «OOC: объясни».', 'OOC: explain\nIC: I open the door.', 'Не продолжай сцену. Объясни.'])('does not strip non-wrapper source text: %s', draft=>{
  expect(readOnlySearchDraft(draft)).toBe(draft);
});
it.each(['OOC: Question?', '[OOC] Question?', '(OOC: Question?)', 'Вне игры: Question?', 'Вне игры： Question?'])('removes only the explicit search wrapper: %s', draft=>{
  expect(readOnlySearchDraft(draft)).toBe('Question?');
});
// Controlled wrapper invariance, not a new independent story. A mode prefix
// must not disable the anchored owner/condition grammar of the same question.
for(const locale of ['ru','en'] as const)for(const scenario of rp05IndependentPlotScenarios(locale))for(const prefix of locale==='ru'?['Вне игры: ','[OOC] ']:['OOC: ','[OOC] ']) {
  it(`RP321 OOC retrieval ${locale}/${scenario.id}/${prefix}`,()=>{
    const plain=structuredClone(scenario.input);plain.readOnly=true;
    const wrapped=structuredClone(plain);wrapped.draft=prefix+wrapped.draft;
    if(wrapped.character)wrapped.character[6]=prefix+wrapped.character[6];
    const before=structuredClone(wrapped),expected=compileGameContext(plain),actual=compileGameContext(wrapped);
    expect(actual.text).toBe(expected.text);expect(actual.report).toEqual(expected.report);expect(wrapped).toEqual(before);
  });
}
