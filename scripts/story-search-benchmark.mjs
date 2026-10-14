import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { digest, prepareEvaluation, evaluateCandidates } from './story-search-evaluation.mjs';
import { encodeLocal, modelPlan } from './story-search-local-model.mjs';
import { evaluateDiversification, policyDigest, searchPolicy } from './story-search-diversify.mjs';
import { evaluateEvidence, evidencePolicyDigest } from './story-search-evidence.mjs';

const { values: args } = parseArgs({ options: { plan: { type: 'boolean' }, export: { type: 'string' }, evaluate: { type: 'string' }, encode: { type: 'boolean' },
  out: { type: 'string' }, runtime: { type: 'string' }, 'model-dir': { type: 'string' }, 'download-model': { type: 'boolean' }, freeze: { type: 'string' }, experiment: { type: 'string', default: 'rp263' } } });
if (!['rp263', 'rp264', 'rp264b'].includes(args.experiment)) throw new Error('Unknown experiment.');
if (args.freeze && (args.encode || args.evaluate)) throw new Error('Freeze a new experiment in a separate step before inference/evaluation.');
if (args.encode && args.evaluate) throw new Error('Choose encode or evaluate.');
const diverse = args.experiment !== 'rp263', evidence = args.experiment === 'rp264b';
const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom' });
let workload, probe, scenarios, provenanceDigest;
try {
  if (diverse) {
    const module = await vite.ssrLoadModule(evidence ? '/tests/fixtures/story-search-evidence.ts' : '/tests/fixtures/story-search-diverse.ts'); scenarios = module.diverseScenarios();
    workload = prepareEvaluation(scenarios.map(module.diverseCase)); probe = module.promptProbeReport;
    provenanceDigest = digest(scenarios.map(c => ({ id: c.name, input: c.input, facts: c.facts, seeds: c.seeds, sources: c.sources })));
  } else { const { prototypeCases } = await vite.ssrLoadModule('/tests/fixtures/story-search-prototype.ts'); workload = prepareEvaluation(prototypeCases()); }
}
finally { await vite.close(); }
const save = async (path, value) => { await mkdir(dirname(resolve(path)), { recursive: true }); await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); };
if (args['download-model'] && !args.encode) throw new Error('--download-model requires --encode.');
const baseAlgorithmDigest = diverse ? digest(await readFile(new URL('./story-search-diversify.mjs', import.meta.url), 'utf8')) : undefined;
const algorithmDigest = evidence ? digest(await readFile(new URL('./story-search-evidence.mjs', import.meta.url), 'utf8')) : baseAlgorithmDigest;
const registration = diverse ? { policyDigest, algorithmDigest, provenanceDigest, ...(evidence ? { baseAlgorithmDigest, evidencePolicyDigest } : {}) } : {};
if (args.freeze) await writeFile(args.freeze, JSON.stringify({ version: 1, ...registration, inputDigest: workload.inputDigest, goldDigest: workload.goldDigest,
  cases: workload.cases.map(c => ({ id: c.id, baseline: c.baseline, lexical: c.lexical, gold: c.gold, protected: c.protected })) }, null, 2) + '\n', { flag: 'wx' });
else {
  const frozen = JSON.parse(await readFile(new URL(evidence ? '../tests/fixtures/story-search-evidence-baseline.json' : diverse ? '../tests/fixtures/story-search-diverse-baseline.json' : '../tests/fixtures/story-search-baseline.json', import.meta.url), 'utf8'));
  if (frozen.inputDigest !== workload.inputDigest || frozen.goldDigest !== workload.goldDigest || Object.entries(registration).some(([key, value]) => frozen[key] !== value)) throw new Error('Frozen benchmark/protocol changed. Review explicitly before freezing a NEW experiment; do not overwrite the viewed holdout.');
}
if (args.export) await save(args.export, { version: 1, inputDigest: workload.inputDigest, inputs: workload.inputs }); // No labels/expected IDs to encoder.
let artifact, timing;
if (args.encode) {
  if (!args.out) throw new Error('--encode requires --out.');
  ({ artifact, timing } = await encodeLocal(workload, { runtime: args.runtime, modelDirectory: args['model-dir'], cache: args.out,
    downloadModel: !!args['download-model'], log: message => process.stderr.write(message + '\n') }));
} else if (args.evaluate) artifact = JSON.parse(await readFile(args.evaluate, 'utf8'));
if (artifact) {
  const start = performance.now(), report = evidence ? evaluateEvidence(workload, artifact) : diverse ? evaluateDiversification(workload, artifact) : evaluateCandidates(workload, artifact);
  report.registration = registration;
  report.timing = { ...timing, evaluateMs: performance.now() - start };
  if (diverse) { const probeStart = performance.now(); report.promptProbes = probe(scenarios, report.rows, searchPolicy.probeBudgets); report.timing.promptProbeMs = performance.now() - probeStart; }
  const prefix = args.encode ? args.out.replace(/\.json$/i, '') + '-report' : args.out;
  if (!prefix) throw new Error('--evaluate requires --out report-prefix.');
  await save(prefix + '.json', report);
  const table = diverse ? [
    '| Split | Intent | Cases | Baseline complete | Lexical top8 | Diverse top8 | Wrong first lexical/diverse | Lost lexical gold | Control drift |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |', ...report.groups.map(g => `| ${g.split} | ${g.intent} | ${g.cases} | ${g.baselineComplete} | ${g.lexicalComplete} | ${g.diverseComplete} | ${g.lexicalWrongFirst}/${g.diverseWrongFirst} | ${g.lostLexicalGold} | ${g.controlDrift} |`),
  ] : [
    '| Split | Intent | Cases | Baseline complete | Lexical top8 | Dense top8 | Hybrid | Wrong first lexical/dense/hybrid | Control drift |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |', ...report.groups.map(g => `| ${g.split} | ${g.intent} | ${g.cases} | ${g.baselineComplete} | ${g.lexicalComplete} | ${g.denseComplete} | ${g.hybridComplete} | ${g.lexicalWrongFirst}/${g.denseWrongFirst}/${g.hybridWrongFirst} | ${g.controlDrift} |`),
  ];
  await save(prefix + '.md', ['# ' + (evidence ? 'RP264B' : diverse ? 'RP264' : 'RP263') + ' candidate comparison', '', report.scope, '', 'Baseline = actual compiled selection; lexical = current lexical top8 before prompt admission. Candidate capacity and whole-prompt probes are distinct.', '', ...table, '',
    'Input SHA256: ' + report.inputDigest, 'Gold SHA256: ' + report.goldDigest, '', 'Model: ' + JSON.stringify(report.model), '', 'Timing: ' + JSON.stringify(report.timing), ''].join('\n'));
  console.log(JSON.stringify({ groups: report.groups, promptBudgets: report.promptProbes?.budgetGroups, timing: report.timing }));
} else console.log(JSON.stringify({ cases: workload.cases.length, inputs: workload.inputs.length, inputDigest: workload.inputDigest, goldDigest: workload.goldDigest,
  ...registration, localModelBytes: modelPlan.files.reduce((sum, f) => sum + f.bytes, 0), model: modelPlan, downloaded: false }));
