import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { digest } from './story-search-evaluation.mjs';
const { values: args } = parseArgs({ options: { 'freeze-baseline': { type: 'boolean' }, 'freeze-protocol': { type: 'boolean' }, evaluate: { type: 'boolean' } } });
if (Object.values(args).filter(Boolean).length > 1) throw new Error('Freeze and evaluate must be separate invocations.');
const baselinePath = new URL('../tests/fixtures/story-search-grounding-baseline.json', import.meta.url);
const protocolPath = new URL('./story-search-grounding-registration.json', import.meta.url);
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
let module, scenarios, cases, baseline;
try {
  module = await server.ssrLoadModule('/tests/fixtures/story-search-grounding.ts');
  scenarios = module.groundingScenarios(); cases = scenarios.map(module.groundingCase);
  baseline = { version: 1, recordedAt: '2026-10-15', inputDigest: digest(cases.map(({ gold, ...rest }) => rest)),
    goldDigest: digest(cases.map(c => [c.id, c.gold])), provenanceDigest: digest(scenarios.map(c => ({ id: c.name, input: c.input, seeds: c.seeds, sources: c.input.story.episodeSources }))),
    cases: cases.map(c => ({ id: c.id, split: c.split, family: c.family, baseline: c.baseline, lexical: c.lexical, gold: c.gold, mandatory: c.mandatory })) };
  if (args['freeze-baseline']) {
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ baseline: 'created-without-candidate-algorithm', cases: cases.length, inputDigest: baseline.inputDigest, goldDigest: baseline.goldDigest }));
  } else {
    const saved = JSON.parse(await readFile(baselinePath, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(baseline)) throw new Error('Frozen inputs, gold or baseline changed; register a NEW experiment, never overwrite.');
    if (args['freeze-protocol'] || args.evaluate) {
      const registration = { version: 1, inputDigest: baseline.inputDigest, goldDigest: baseline.goldDigest,
        algorithmDigest: digest(await readFile(new URL('./story-search-grounding.mjs', import.meta.url), 'utf8')),
        policyDigest: digest(JSON.parse(await readFile(new URL('./story-search-grounding-policy.json', import.meta.url), 'utf8'))),
        coreTextDigest: digest(await readFile(new URL('../src/core/text.ts', import.meta.url), 'utf8')),
        benchmarkDigest: digest(await readFile(new URL('./story-search-grounding-benchmark.mjs', import.meta.url), 'utf8')),
        admissionProbeDigest: digest(await readFile(new URL('../tests/fixtures/story-search-diverse.ts', import.meta.url), 'utf8')) };
      if (args['freeze-protocol']) {
        await writeFile(protocolPath, JSON.stringify(registration, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ protocol: 'registered-before-evaluation', ...registration }));
      } else {
        if (JSON.stringify(JSON.parse(await readFile(protocolPath, 'utf8'))) !== JSON.stringify(registration)) throw new Error('Registered candidate protocol changed.');
        const { evaluateGrounding } = await import('./story-search-grounding.mjs');
        const report = evaluateGrounding(cases, module.groundingTokens);
        const { probeCandidatePrompt } = await server.ssrLoadModule('/tests/fixtures/story-search-diverse.ts');
        const { decodeStoryMemory } = await server.ssrLoadModule('/src/core/story-memory-transport.ts');
        const byId = new Map(scenarios.map(c => [c.name, c]));
        report.promptProbes = report.rows.flatMap(row => [900, 1500, 2300, 4000, 6000].map(budget => {
          let p = probeCandidatePrompt(byId.get(row.id), row.candidate, budget);
          const byFact = new Map(byId.get(row.id).facts.map((f, i) => [f.text, 'fact-' + i]));
          if (p.accepted && p.currentMandatoryIds.some(id => !row.candidate.includes(id))) {
            p = { ...p, text: p.originalText, accepted: false, reason: 'budget-specific-mandatory-fallback' };
          }
          const sourceText = p.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
          const hints = sourceText ? decodeStoryMemory(JSON.parse(sourceText.split('\n')[1])) : [];
          const selected = hints.map(h => byFact.get(h.text));
          // The old compiler may legitimately carry unproved evidence. The
          // experiment must fallback exactly rather than invent a source for it.
          if (!p.accepted && p.text !== p.originalText || p.accepted && p.total > p.limit) throw new Error('Whole-prompt rollback/budget invariant failed.');
          const mandatoryLoss = p.currentMandatoryIds.filter(id => !selected.includes(id));
          if (mandatoryLoss.length) throw new Error('Actual budget-specific mandatory evidence lost.');
          return { id: row.id, split: row.split, budget, accepted: p.accepted, reason: p.reason, total: p.total, selected,
            complete: !!row.gold.length && row.gold.every(id => selected.includes(id)), mandatoryLoss };
        }));
        report.registration = registration;
        report.scope = 'RP269 read-only lexical/source-aware prototype, not runtime or native DeepSeek context compression. New independently authored synthetic data; algorithm fixed before evaluation. No model/download/network API.';
        const path = new URL('../docs/benchmarks/rp269-grounding-results.json', import.meta.url);
        await writeFile(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ groups: report.groups, probes: report.promptProbes.length }));
      }
    } else console.log(JSON.stringify({ verifiedBaseline: true, cases: cases.length, inputDigest: baseline.inputDigest, goldDigest: baseline.goldDigest }));
  }
} finally { await server.close(); }
