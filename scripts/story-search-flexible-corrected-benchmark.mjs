import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { digest } from './story-search-evaluation.mjs';
const { values: args } = parseArgs({ options: { 'freeze-baseline': { type: 'boolean' }, 'freeze-protocol': { type: 'boolean' }, evaluate: { type: 'boolean' } } });
if (Object.values(args).filter(Boolean).length > 1) throw new Error('Separate baseline, registration and comparison invocations required.');
const server = await createServer({ configFile: false, cacheDir: '.wxt/rp271-benchmark', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const f = await server.ssrLoadModule('/tests/fixtures/story-flexible-priority.ts'), scenarios = f.flexibleScenarios();
  const cases = scenarios.map(c => {
    const prior = f.priorFlexibleContext(c.input), labels = new Map(c.facts.map((fact, i) => [fact.text, 'source-' + i]));
    return { id: c.id, split: c.split, family: c.family, positive: c.positive, query: c.input.draft, inputDigest: digest(c.input),
      gold: c.wanted.map(f => labels.get(f.text)), baseline: f.flexibleHints(prior.text).map(h => labels.get(h.text)), baselineDigest: digest(prior) };
  });
  const snapshot = { version: 1, prior: 'RP270', inputDigest: digest(cases.map(({ gold, ...rest }) => rest)), goldDigest: digest(cases.map(c => [c.id, c.gold])), cases };
  const baselinePath = new URL('../tests/fixtures/story-flexible-priority-baseline.json', import.meta.url);
  if (args['freeze-baseline']) {
    await writeFile(baselinePath, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ frozenBeforeAlgorithm: true, cases: cases.length, inputDigest: snapshot.inputDigest, goldDigest: snapshot.goldDigest }));
  } else {
    if (JSON.stringify(JSON.parse(await readFile(baselinePath, 'utf8'))) !== JSON.stringify(snapshot)) throw new Error('RP271 frozen data/gold/RP270 baseline changed.');
    if (args['freeze-protocol'] || args.evaluate) {
      const registration = { version: 1, amendment: 'Keep the existing literal ambiguity guard and ALL independent candidate sources for supported actions; first comparison preserved, reused evaluation is not independent', initialProtocolDigest: digest(JSON.parse(await readFile(new URL('./story-search-flexible-registration.json', import.meta.url), 'utf8'))), inputDigest: snapshot.inputDigest, goldDigest: snapshot.goldDigest,
        algorithmDigest: digest(await readFile(new URL('../src/core/story-flexible-priority.ts', import.meta.url), 'utf8')),
        compilerDigest: digest(await readFile(new URL('../src/core/game-context.ts', import.meta.url), 'utf8')),
        fixtureDigest: digest(await readFile(new URL('../tests/fixtures/story-flexible-priority.ts', import.meta.url), 'utf8')),
        benchmarkDigest: digest(await readFile(new URL('./story-search-flexible-corrected-benchmark.mjs', import.meta.url), 'utf8')) };
      const protocolPath = new URL('./story-search-flexible-corrected-registration.json', import.meta.url);
      if (args['freeze-protocol']) { await writeFile(protocolPath, JSON.stringify(registration, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ registeredBeforeComparison: true, ...registration })); }
      else {
        if (JSON.stringify(JSON.parse(await readFile(protocolPath, 'utf8'))) !== JSON.stringify(registration)) throw new Error('Registered RP271 protocol changed.');
        const { compileGameContext } = await server.ssrLoadModule('/src/core/game-context.ts');
        const rows = [], budgets = [];
        for (const [i, c] of scenarios.entries()) {
          const prior = f.priorFlexibleContext(c.input), now = compileGameContext(c.input), old = f.flexibleHints(prior.text), hints = f.flexibleHints(now.text);
          const repeats = new Set(c.discussions.map(f => f.text));
          rows.push({ id: c.id, split: c.split, family: c.family, positive: c.positive, baselineComplete: c.wanted.every(f => old.some(h => h.text === f.text)),
            complete: c.wanted.every(f => hints.some(h => h.text === f.text)), controlDrift: !c.positive && digest(prior) !== digest(now),
            substantiveLoss: old.filter(h => !repeats.has(h.text) && !hints.some(n => n.text === h.text)).map(h => h.text), baselineDigest: cases[i].baselineDigest, outputDigest: digest(now) });
          for (const limit of [900, 1500, 6000]) {
            const input = structuredClone(c.input); input.settings.contextBudget = limit;
            const before = f.priorFlexibleContext(input), after = compileGameContext(input), selected = f.flexibleHints(after.text);
            budgets.push({ id: c.id, limit, changed: digest(before) !== digest(after), complete: c.wanted.every(f => selected.some(h => h.text === f.text)),
              sourceExact: selected.every(h => { const fact = input.story.facts.find(f => f.text === h.text); return !!fact && (h.sourceQuote ?? h.text) === fact.quote && digest(h.task ?? null) === digest(fact.task ?? null) && digest(h.claim ?? null) === digest(fact.claim ?? null); }),
              budget: after.report.required > limit || after.report.total <= limit });
          }
        }
        const groups = ['development', 'evaluation'].map(split => { const p = rows.filter(r => r.split === split && r.positive); return { split, count: p.length, baselineComplete: p.filter(r => r.baselineComplete).length, complete: p.filter(r => r.complete).length }; });
        const report = { registration, groups, rows, budgets };
        await writeFile(new URL('../docs/benchmarks/rp271b-flexible-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ groups, controls: rows.filter(r => !r.positive).length, drift: rows.filter(r => r.controlDrift).length, substantiveLoss: rows.reduce((n, r) => n + r.substantiveLoss.length, 0), probes: budgets.length, invalidBudgetOrSource: budgets.filter(b => !b.sourceExact || !b.budget).length }));
      }
    } else console.log(JSON.stringify({ baselineUnchanged: true, cases: cases.length }));
  }
} finally { await server.close(); }
