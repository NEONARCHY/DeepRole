// Deliberately refuse network connections for this Node-process probe. This is
// not a claim that the OS/network adapter was disconnected or a browser tested.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';

if (process.argv.includes('--download-model')) throw new Error('Offline probe cannot download a model.');
let attempts = 0;
const block = () => { attempts++; throw new Error('RP263 offline probe: network access forbidden'); };
const patches = [[globalThis, 'fetch'], [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'], [net, 'connect'], [net, 'createConnection'], [net.Socket.prototype, 'connect']];
const originals = patches.map(([target, key]) => target[key]);
const start = performance.now(), rssBefore = process.memoryUsage().rss;
patches.forEach(([target, key]) => { target[key] = block; }); syncBuiltinESMExports();
try { await import('./story-search-benchmark.mjs'); }
finally {
  patches.forEach(([target, key], i) => { target[key] = originals[i]; }); syncBuiltinESMExports();
  console.error(JSON.stringify({ networkAttempts: attempts, probe: 'Node fetch/http/https/net blocked; not an OS-disconnection test',
    totalProcessMs: performance.now() - start, rssBefore, peakProcessRssBytes: process.resourceUsage().maxRSS * 1024,
    cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() }));
}
if (attempts) throw new Error('Offline probe attempted network access.');
