import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { digest } from './story-search-evaluation.mjs';
const { values: args } = parseArgs({ options: { 'freeze-baseline': { type: 'boolean' }, 'freeze-protocol': { type: 'boolean' }, evaluate: { type: 'boolean' } } });
if (Object.values(args).filter(Boolean).length > 1) throw new Error('Use separate baseline, protocol and evaluation invocations.');
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const module = await server.ssrLoadModule('/tests/fixtures/story-discussion-priority.ts');
  const scenarios = module.discussionScenarios(), cases = scenarios.map(module.discussionCase);
  const baseline = { version: 1, recordedAt: '2026-10-15', inputDigest: digest(cases.map(({ gold, ...rest }) => rest)), goldDigest: digest(cases.map(c => [c.id, c.gold])),
    provenanceDigest: digest(scenarios.map(c => ({ id: c.name, input: c.input }))), cases };
  const path = new URL('../tests/fixtures/story-discussion-priority-baseline.json', import.meta.url);
  if (args['freeze-baseline']) {
    await writeFile(path, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ frozenBeforeAlgorithm: true, cases: cases.length, inputDigest: baseline.inputDigest, goldDigest: baseline.goldDigest }));
  } else {
    if (JSON.stringify(JSON.parse(await readFile(path, 'utf8'))) !== JSON.stringify(baseline)) throw new Error('Frozen RP270 inputs/gold/prior baseline changed.');
    if (args['freeze-protocol'] || args.evaluate) {
      const registration = { version: 1, inputDigest: baseline.inputDigest, goldDigest: baseline.goldDigest,
        amendment: 'Mechanical closing-quote punctuation fix found by development unit test; initial protocol/report retained, labels and ranking policy unchanged',
        initialProtocolDigest: digest(JSON.parse(await readFile(new URL('./story-search-priority-registration.json', import.meta.url), 'utf8'))),
        initialAlgorithmDigest: digest(await readFile(new URL('../docs/benchmarks/rp270-initial-algorithm.txt', import.meta.url), 'utf8')),
        evaluationDigest: digest(await readFile(new URL('../tests/fixtures/story-discussion-priority-evaluation.ts', import.meta.url), 'utf8')),
        algorithmDigest: digest(await readFile(new URL('../src/core/story-discussion-priority.ts', import.meta.url), 'utf8')),
        policyDigest: digest(JSON.parse(await readFile(new URL('./story-search-priority-policy.json', import.meta.url), 'utf8'))),
        fixtureDigest: digest(await readFile(new URL('../tests/fixtures/story-discussion-priority.ts', import.meta.url), 'utf8')),
        benchmarkDigest: digest(await readFile(new URL('./story-search-priority-corrected-benchmark.mjs', import.meta.url), 'utf8')) };
      const protocol = new URL('./story-search-priority-corrected-registration.json', import.meta.url);
      if (args['freeze-protocol']) {
        await writeFile(protocol, JSON.stringify(registration, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ registeredBeforeEvaluation: true, ...registration }));
      } else {
        if (JSON.stringify(JSON.parse(await readFile(protocol, 'utf8'))) !== JSON.stringify(registration)) throw new Error('RP270 registered protocol changed.');
        const { priorityReport } = await server.ssrLoadModule('/tests/fixtures/story-discussion-priority-evaluation.ts');
        const report = priorityReport(scenarios, cases); report.registration = registration;
        await writeFile(new URL('../docs/benchmarks/rp270b-priority-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ groups: report.groups, budgets: report.budgets }));
      }
    } else console.log(JSON.stringify({ baselineUnchanged: true, cases: cases.length }));
  }
} finally { await server.close(); }
