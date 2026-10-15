/** Isolated RP269 hypothesis. It never writes facts, produces new facts, binds
 * an actor or changes statuses. Grounding here is narrow syntax, not universal
 * truth detection. Every selected item still carries its entire original proof. */
const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().replace(/\s+/gu, ' ');
const frames = [
  ['occurrence', /^(?:что действительно произошло с|what actually happened with) (.+)$/u],
  ['promise', /^(?:какие обещания касались|what promises concerned) (.+)$/u],
  ['plan', /^(?:какие планы касались|what plans concerned) (.+)$/u],
  ['completed', /^(?:напомни выполненное поручение про|remind me about the completed duty concerning) (.+)$/u],
  ['cancelled', /^(?:напомни отмененное поручение про|remind me about the cancelled duty concerning) (.+)$/u],
  ['conditions', /^(?:какие условия у поручений про|what are the conditions of the duties concerning) (.+)$/u],
  ['state', /^какой код (.+) теперь$/u],
  ['state', /^what is the (.+) code now$/u],
];
const validSource = (d, c) => d.sourceVerified === true && d.source !== 'unknown' && c.currentSourceIds.includes(d.source);
const available = role => !!role && role.unavailable !== true && !!role.id && !!role.name;
const typed = (d, mode) => {
  const f = d.fact;
  if (mode === 'promise') return f.kind === 'promise' && (!f.task || f.task.status === 'open');
  if (mode === 'plan') return f.kind === 'plan' && (!f.task || f.task.status === 'open');
  if (mode === 'conditions') return f.task?.status === 'open' && ['promise', 'plan', 'task'].includes(f.kind);
  if (mode === 'completed' || mode === 'cancelled') return f.kind === 'event' && f.task?.status === mode;
  if (mode === 'state') return f.kind === 'event' && f.claim?.scope === 'state' && f.claim?.lifetime === 'persistent';
  return false;
};
const attributed = (d, mode) => {
  if (d.identityStatus !== 'bound') return false;
  if (mode === 'promise') return available(d.roles.promisor);
  if (mode === 'plan') return available(d.roles.planner);
  if (mode === 'conditions') return available(d.roles.promisor) || available(d.roles.planner);
  return available(d.roles.speaker);
};
function playedSubject(f) {
  if (f.kind !== 'event' || f.task || f.claim || f.text !== f.quote) return;
  const source = f.quote.normalize('NFKC').toLocaleLowerCase().replaceAll('ё', 'е').trim();
  // Reject the entire source, not just its summary, when it may describe a
  // hypothetical, remembered, reported, negated or questioned action.
  if (/[«»“”"'?:]/u.test(source) || /(?:\b(?:not|would|could|if|perhaps|maybe|discussed|said|believed|recalled|story|dream)\b|(?:^|\s)(?:не|бы|если|кажется|возможно)(?:\s|$)|обсужд|сказал|считает|вспомин|рассказ|снил)/u.test(source)) return;
  const ru = source.match(/^(.+?) (?:починили|перевезли|установили|вернули|открыли|закрыли|передали|доставили|получили)(?=\s|[.;]|$)/u);
  const en = source.match(/^(?:the |an? )?(.+?) was (?:repaired|moved|installed|returned|opened|closed|delivered|received)(?=\s|[.;]|$)/u);
  return ru?.[1] ?? en?.[1];
}

export function groundingCandidates(c, tokens) {
  const fallback = (reason, priorities = [], mode) => ({ ids: [...c.baseline], reason, priorities, ...(mode ? { mode } : {}) });
  const byId = new Map(c.documents.map(d => [d.id, d]));
  if (byId.size !== c.documents.length || new Set(c.baseline).size !== c.baseline.length || c.baseline.length > 8 ||
      c.lexical.length !== byId.size || new Set(c.lexical).size !== byId.size || c.lexical.some(id => !byId.has(id)) ||
      c.baseline.some(id => !byId.has(id)) || new Set(c.mandatory).size !== c.mandatory.length || c.mandatory.some(id => !c.baseline.includes(id))) throw new Error('Invalid grounding candidate contract');
  if (c.protected) return fallback('protected-current-selection');
  if (/[«»“”"';:\n]/u.test(c.query) || /\?.*\?/u.test(c.query)) return fallback('unsupported-query');
  const query = normalize(c.query), frame = frames.map(([mode, re]) => ({ mode, topic: query.match(re)?.[1] })).find(p => p.topic);
  if (!frame) return fallback('unsupported-query');
  const { mode, topic } = frame, requested = tokens(topic);
  if (!requested.length || /(?:^| )(?:не|если|бы|not|if|would|and|и|или|or)(?: |$)/u.test(topic) ||
      c.names.some(n => (' ' + topic + ' ').includes(' ' + normalize(n) + ' '))) return fallback('unsupported-topic', [], mode);
  if (c.baseline.some(id => !validSource(byId.get(id), c))) return fallback('unproved-baseline', [], mode);
  const matches = value => { const terms = new Set(tokens(value)); return requested.every(term => terms.has(term)); };
  const plausible = c.lexical.filter(id => {
    const d = byId.get(id);
    if (mode === 'occurrence') { const subject = playedSubject(d.fact); return subject !== undefined && matches(subject); }
    return typed(d, mode) && (matches(d.fact.text) || !!d.fact.task && matches(d.fact.task.title));
  });
  if (!plausible.length) return fallback('no-proved-matching-kind', [], mode);
  if (plausible.some(id => !validSource(byId.get(id), c) || mode !== 'occurrence' && !attributed(byId.get(id), mode))) return fallback('unknown-source-or-identity', [], mode);
  const selected = [...new Set([...plausible, ...c.mandatory])];
  if (selected.length > 8) return fallback('mandatory-union-overflow', plausible, mode);
  for (const id of c.lexical) if (selected.length < 8 && !selected.includes(id)) selected.push(id);
  if (!c.mandatory.every(id => selected.includes(id))) throw new Error('Grounding experiment lost mandatory evidence');
  return { ids: selected, reason: 'literal-typed-source-priority', priorities: plausible, mode };
}

export function evaluateGrounding(cases, tokens) {
  const rows = cases.map(c => {
    const out = groundingCandidates(c, tokens), lexical = c.lexical.slice(0, 8);
    return { id: c.id, split: c.split, family: c.family, gold: c.gold, baseline: c.baseline, lexical, candidate: out.ids,
      priorities: out.priorities, reason: out.reason, ...(out.mode ? { mode: out.mode } : {}), mandatory: c.mandatory,
      controlDrift: !c.gold.length && JSON.stringify(out.ids) !== JSON.stringify(c.baseline),
      mandatoryLoss: c.mandatory.filter(id => !out.ids.includes(id)), lostLexicalGold: c.gold.filter(id => lexical.includes(id) && !out.ids.includes(id)) };
  });
  const groups = [];
  for (const split of [...new Set(rows.map(r => r.split))]) for (const family of [...new Set(rows.filter(r => r.split === split).map(r => r.family))]) {
    const g = rows.filter(r => r.split === split && r.family === family), positive = g.filter(r => r.gold.length);
    const complete = field => positive.filter(r => r.gold.every(id => r[field].includes(id))).length;
    groups.push({ split, family, cases: g.length, positive: positive.length, baselineComplete: complete('baseline'), lexicalComplete: complete('lexical'), candidateComplete: complete('candidate'),
      lexicalWrongFirst: positive.filter(r => !r.gold.includes(r.lexical[0])).length, candidateWrongFirst: positive.filter(r => !r.gold.includes(r.candidate[0])).length,
      controlDrift: g.filter(r => r.controlDrift).length, mandatoryLoss: g.reduce((n, r) => n + r.mandatoryLoss.length, 0), lostLexicalGold: g.reduce((n, r) => n + r.lostLexicalGold.length, 0) });
  }
  return { groups, rows };
}
