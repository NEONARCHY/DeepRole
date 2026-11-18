import { expect, it } from 'vitest';
import { photoPermissionEvidence } from '../src/core/story-photo-permission';
import type { StoryFact } from '../src/core/story-update';
import { plots } from './fixtures/story-rp404-corpus';
import { probes } from './fixtures/story-rp404-expectations';

const event = (text: string): StoryFact => ({kind:'event', text, quote:text});
const question = 'May I photograph the whole thing?';
const scene = 'She unrolled the velvet banner.';
const grant = event('The owner allowed photographing the velvet banner in full for private study.');
const ban = event('The owner forbade photographing the velvet banner.');
const roles = { status: () => 'unknown' as const, read: () => undefined, question: undefined, score: () => 0 };
function recall(facts: StoryFact[], last = scene, draft = question, missing?: StoryFact) {
  return photoPermissionEvidence(facts, draft, [last], [], roles, {
    read: f => f === missing ? undefined : {episode:1, revisionId:'r'+facts.indexOf(f), period:'earlier-turn'},
    position: f => facts.indexOf(f),
  });
}

it('keeps the scope and purpose with the exact evidence, including when a current ban replaces an ended grant', () => {
  expect(recall([grant])?.facts).toEqual([grant]);
  expect(recall([grant, ban])).toMatchObject({scope:'unknown',facts:[grant,ban]});
  const ended: StoryFact = {...grant, claim:{key:'camera',scope:'state',value:grant.text, lifetime:'scene',transition:'progress',status:'ended'}};
  expect(recall([ended,ban])).toMatchObject({scope:'prohibited', facts:[ban]});
});
it('does not transfer a grant across a sentence or from permission to inspect', () => {
  for (const separator of ['. ', ', ', ' but ', ' and ']) {
    const row=event('You may inspect the velvet banner'+separator+'you may photograph the entire paper model.');
    expect(recall([row])?.scope).toBe('unknown');
  }
  expect(recall([event('You may inspect a photograph of the entire velvet banner.')])?.scope).toBe('unknown');
});
it('requires an episode, a matching source quote and a grounded preceding turn', () => {
  expect(recall([grant],scene,question,grant)?.scope).toBe('unknown');
  expect(recall([{...grant,quote:ban.quote}])?.scope).toBe('unknown');
  expect(recall([{...grant,kind:'belief'}])?.scope).toBe('unknown');
  expect(recall([grant], 'Perhaps she unrolled the velvet banner.')?.scope).toBe('unknown');
  expect(recall([grant], scene,'May I photograph the entire brass vase?')).toBeUndefined();
});
it.each([
  ['Она открыла футляр.','Разрешено фотографировать футляр целиком.','Разрешено фотографировать медный футляр целиком.','Можно сфотографировать это целиком?'],
  ['She showed the harp.','You may photograph the harp in full.','The brass harp may be photographed in full.',question],
])('uses an explicitly named single object with a bare source and declines competing variants (%s)', (last, bare, qualified, draft) => {
  expect(recall([event(bare)],last,draft)?.scope).toBe('full');
  expect(recall([event(bare),event(qualified)],last,draft)?.scope).toBe('unknown');
});
it('keeps private copying distinct from publication and preserves conditional bans', () => {
  expect(recall([grant,event('Publishing a photograph of the velvet banner is forbidden.')])?.facts).toEqual([grant]);
  expect(recall([event('It is forbidden to photograph the velvet banner with flash.')])?.scope).toBe('unknown');
});
it.each([0,1] as const)('retrieves both the copying ban and the scene showing what the strip hides, language %i', lang => {
  const plot=plots.find(p=>p.id==='orchard')!, q=probes.orchard!.find(q=>q.id==='grounded')!;
  const facts=plot.beats.map(b=>({...event(b.prose[lang]),kind:b.kind}));
  const evidence=recall(facts,q.recent![0]![lang],q.draft[lang]);
  expect(evidence?.scope).toBe('prohibited');
  expect(evidence!.facts.map(f=>plot.beats[facts.indexOf(f)]!.id)).toEqual(['privacy','overlay']);
});
