import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
let attempts = 0;
const blocked = () => { attempts++; throw new Error('RP270 offline probe: network forbidden'); };
const patches = [[globalThis, 'fetch'], [http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'], [net, 'connect'], [net, 'createConnection'], [net.Socket.prototype, 'connect']];
const saved = patches.map(([target, key]) => target[key]), start = performance.now();
patches.forEach(([target, key]) => { target[key] = blocked; }); syncBuiltinESMExports();
try { await import('./story-search-priority-benchmark.mjs'); }
finally {
  patches.forEach(([target, key], i) => { target[key] = saved[i]; }); syncBuiltinESMExports();
  console.error(JSON.stringify({ networkAttempts: attempts, totalProcessMs: performance.now() - start, scope: 'Node fetch/http/https/net probe, not browser isolation' }));
}
if (attempts) throw new Error('RP270 attempted network access');
