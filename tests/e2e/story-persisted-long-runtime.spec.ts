import { chromium, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { persistedLongWorld } from '../fixtures/story-persisted-long-audit';
import { withPersistedEvidence } from '../fixtures/story-persisted-evidence';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';

const rows = (page: Page) => page.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, tx = db.transaction('records'), get = tx.objectStore('records').getAll(); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); tx.oncomplete = () => db.close(); };
}));
for (const locale of ['ru', 'en'] as const) test(`persisted long ${locale}: 409 sources, compound actual POST and reload preserve canon`, async ({}, info) => {
  test.setTimeout(150000);
  const extension = path.resolve('.output/chrome-mv3'), context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND'] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), panel = await context.newPage();
    await panel.goto('chrome-extension://' + new URL(worker.url()).host + '/sidepanel.html'); await expect(panel.locator('.onboarding')).toBeVisible();
    const f = withPersistedEvidence(persistedLongWorld(locale, 'observatory', 400)), base = f.base; base.world.contextBudget = 6000;
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); for (const r of records) tx.objectStore('records').put({ pk: r.kind + ':' + r.id, ...r, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: 'rp335-seed' } });
    }, { records: base.records, locale });
    const message = (id: number, parent: number | null, role: string, content: string) => ({ message_id: id, parent_id: parent, role, status: 'FINISHED', has_pending_fragment: false, fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content }] });
    const messages = [message(40, null, 'USER', 'Begin'), message(41, 40, 'ASSISTANT', 'Workshop')]; let posts = 0, outgoing = '';
    await context.route('https://chat.deepseek.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v0/chat/history_messages')) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: base.binding.chatId, current_message_id: 41 }, chat_messages: messages } } } });
      if (url.endsWith('/api/v0/chat/completion')) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {"request_message_id":${40 + posts * 2},"response_message_id":${41 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes('/api/v0/')) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on('pageerror', e => errors.push(e.message)); await chat.goto(base.binding.chatUrl); await chat.bringToFront();
    await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 });
    const rpc = (data: any) => panel.evaluate(async ({ data, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, data); }, { data, url: base.binding.chatUrl });
    const started = await rpc({ type: 'DR_STORY_GAME', operation: 'start', manual: 'stop' });
    if (!started.ok) await info.attach('rp335-start-debug', { body: JSON.stringify({ started, records: await rows(panel) }), contentType: 'application/json' });
    expect(started, JSON.stringify(started)).toMatchObject({ ok: true });
    const saved = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame;
    expect(saved.facts).toEqual(f.facts); expect(saved.factRoleSeeds).toEqual(f.seeds); expect(saved.episodeSources).toEqual(f.episodeSources);
    const measurements: object[] = [];
    for (const reload of [false, true]) {
      if (reload) { await chat.reload(); await chat.bringToFront(); await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 }); }
      for (const q of f.questions.filter(q => ['two', 'three', 'reverse'].includes(q.id))) {
        await chat.locator('textarea').fill(q.draft);
        await chat.evaluate(draft => new Promise<void>(resolve => { const x = new XMLHttpRequest(); x.open('POST', '/api/v0/chat/completion'); x.onload = () => resolve(); x.send(JSON.stringify({ chat_session_id: 'synthetic-a', parent_message_id: 41, prompt: draft })); }), q.draft);
        const assistantKey = JSON.stringify(['message', String(41 + posts * 2)]);
        await expect.poll(async () => { const d = (await rows(panel)).find(r => r.kind === 'dispatch' && r.data.wire?.link?.assistantMessageKey === assistantKey)?.data; return [d?.delivery?.status, d?.wire?.phase, d?.wire?.sawFinish]; }, { timeout: 12000 }).toEqual(['accepted', 'closed', true]);
        expect(outgoing.endsWith(q.draft)).toBe(true);
        const block = outgoing.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
        expect(block).toBeTruthy(); const hints = decodeStoryMemory(JSON.parse(block!.split('\n')[1]!));
        for (const i of q.wanted) {
          const fact = f.important[i]!, h = hints.find(h => h.text === fact.text); expect(h).toBeDefined();
          expect(h!.sourceQuote ?? h!.text).toBe(fact.quote); expect(h!.kind).toBe(fact.kind); expect(h!.task).toEqual(fact.task); expect(h!.claim).toEqual(fact.claim); expect(h!.sourceRoles ?? {}).toEqual(f.seeds[i]!.binding.roles); expect(h!.episodeSource?.revisionId).toBe(f.sources[i]);
        }
        measurements.push({ query: q.id, reload, selected: hints.length, required: q.wanted.length });
      }
    }
    const after = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame;
    expect(after.facts).toEqual(saved.facts); expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds); expect(after.episodeSources).toEqual(saved.episodeSources); expect(posts).toBe(6); expect(errors).toEqual([]);
    await info.attach('rp335-persisted-posts', { body: JSON.stringify({ locale, sources: saved.facts.length, measurements }), contentType: 'application/json' });
  } finally { await context.close(); }
});
