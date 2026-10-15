import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { performance } from 'node:perf_hooks';
let attempts = 0;
const block = () => { attempts++; throw new Error('RP269 probe: network access forbidden'); };
const patches = [[globalThis, 'fetch'], [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'], [net, 'connect'], [net, 'createConnection'], [net.Socket.prototype, 'connect']];
const originals = patches.map(([target, key]) => target[key]), start = performance.now();
patches.forEach(([target, key]) => { target[key] = block; }); syncBuiltinESMExports();
try { await import('./story-search-grounding-benchmark.mjs'); }
finally {
  patches.forEach(([target, key], i) => { target[key] = originals[i]; }); syncBuiltinESMExports();
  console.error(JSON.stringify({ networkAttempts: attempts, totalProcessMs: performance.now() - start,
    peakProcessRssBytes: process.resourceUsage().maxRSS * 1024, scope: 'Node fetch/http/https/net probe, not OS or browser isolation' }));
}
if (attempts) throw new Error('RP269 probe attempted network access.');
