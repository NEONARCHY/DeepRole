import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { storyWorld } from '../fixtures/story-worlds';
import { oldChatNoticeText } from '../../src/core/old-chat-notice';

for (const mode of ['clean', 'rejected-navigation', 'stale-parent'] as const) for (const transport of ['fetch', 'xhr'] as const) for (const locale of ['ru', 'en'] as const) test(`new world chat delivers memory ${mode}/${transport}/${locale}: first POST, next POST and reload`, async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'Installed Edge MV3 with synthetic native API');
  test.setTimeout(120000);
  const extension = path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? '.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const diagnostics: string[] = [];
  context.on('console', m => { if (['error', 'warning'].includes(m.type())) diagnostics.push(`${m.type()}: ${m.text()}`); });
  context.on('page', p => p.on('pageerror', e => diagnostics.push(e.stack ?? e.message)));
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect(panel.locator('.onboarding')).toBeVisible();
    const f = storyWorld(locale, 2); f.world.contextBudget = 6000; f.world.bracketedOoc = true;
    const nextChat = 'synthetic-new-world-chat';
    const nextUrl = `https://chat.deepseek.com/a/chat/s/${nextChat}`;
    const message = (id: number, parent: number | null, role: string, content: string) => ({ message_id: id, parent_id: parent, role, status: 'FINISHED', has_pending_fragment: false, fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content }] });
    const history = new Map<string, ReturnType<typeof message>[]>([[f.binding.chatId, [message(1, null, 'USER', 'Begin.'), message(2, 1, 'ASSISTANT', 'In the workshop.')]], [nextChat, []]]);
    const posts: { prompt: string; chat_session_id: string; parent_message_id: number | null }[] = [];
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); for (const row of records) tx.objectStore('records').put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, automaticMetadataRepair: false, showChatContextMeter: false }, deeprole_library_change: { token: 'new-chat-memory-seed' } });
    }, { records: f.records, locale });
    await context.route('https://chat.deepseek.com/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v0/chat/history_messages') {
        const chatId = url.searchParams.get('chat_session_id')!, messages = history.get(chatId) ?? [];
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: chatId, current_message_id: messages.at(-1)?.message_id ?? null }, chat_messages: messages } } } });
      }
      if (url.pathname === '/api/v0/chat/completion') {
        const body = route.request().postDataJSON(); posts.push(body);
        const messages = history.get(body.chat_session_id)!;
        const id = (messages.at(-1)?.message_id ?? 0) + 1;
        messages.push(message(id, body.parent_message_id, 'USER', body.prompt), message(id + 1, id, 'ASSISTANT', 'The key is in the blue box.'));
        return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {"request_message_id":${id},"response_message_id":${id + 1}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      const chatId = url.pathname.match(/\/chat\/(?:s\/)?([^/]+)/)?.[1];
      const last = history.get(chatId ?? '')?.at(-1);
      const escaped = (last?.fragments[0]?.content ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><div id="conversation">${last ? `<div data-virtual-list-item-key="${last.message_id}"><article data-role="assistant"><div class="ds-markdown">${escaped}</div></article></div>` : ''}</div><textarea aria-label="Message"></textarea></main></body></html>` });
    });
    const chat = await context.newPage(); await chat.goto(f.binding.chatUrl); await chat.bringToFront();
    await expect(chat.locator('html')).toHaveAttribute('data-deeprole-context', /deeprole_character_mode/);
    const rpc = (data: any) => panel.evaluate(async ({ data, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, data); }, { data, url: chat.url() });
    const records = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records'), read = tx.objectStore('records').getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }));
    expect(await rpc({ type: 'DR_STORY_GAME', operation: 'start', manual: 'stop' })).toMatchObject({ ok: true });
    const sourceWorld = (await records()).find(r => r.kind === 'world').data;
    expect(sourceWorld.sharedGame.managed).toBe(true);
    // SPA New chat, then the same world through the real widget. No handoff or recap.
    await chat.evaluate(() => { window.history.pushState({}, '', '/'); document.querySelector('#conversation')!.replaceChildren(); });
    await expect(chat.locator('select').filter({ has: chat.locator('option[value="synthetic-world"]') })).toHaveValue('');
    await chat.locator('select').filter({ has: chat.locator('option[value="synthetic-world"]') }).selectOption(f.world.id);
    const draft = locale === 'ru' ? '[Где ключ от часов?]' : '[Where is the clock key?]';
    await chat.locator('textarea').fill(draft);
    await expect(chat.locator('html')).toHaveAttribute('data-deeprole-context', new RegExp(f.entry.content));
    if (mode === 'rejected-navigation') await panel.bringToFront();
    const send = async (parent: number | null) => {
      await chat.evaluate(async ({ nextChat, draft, parent, transport }) => {
        if (location.pathname === '/') window.history.pushState({}, '', `/a/chat/s/${nextChat}`);
        const body = JSON.stringify({ chat_session_id: nextChat, parent_message_id: parent, prompt: draft });
        if (transport === 'fetch') await (await fetch('/api/v0/chat/completion', { method: 'POST', body })).text();
        else await new Promise<void>(resolve => { const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/v0/chat/completion'); xhr.onloadend = () => resolve(); xhr.send(body); });
      }, { nextChat, draft, parent, transport });
      // A real native completion also renders its selected assistant anchor.
      // Without it, starting the game correctly rejects an unreadable UI branch.
      const latest = history.get(nextChat)!.at(-1)!;
      await chat.evaluate(({ id, text }) => {
        const row = document.createElement('div'); row.dataset.virtualListItemKey = String(id);
        const article = document.createElement('article'); article.dataset.role = 'assistant';
        const body = document.createElement('div'); body.className = 'ds-markdown'; body.textContent = text;
        article.append(body); row.append(article); document.querySelector('#conversation')!.replaceChildren(row);
      }, { id: latest.message_id, text: latest.fragments[0]!.content });
    };
    await send(null);
    expect(posts).toHaveLength(1);
    await expect(chat).toHaveURL(nextUrl);
    if (mode === 'rejected-navigation') {
      // Preserve the active-tab guard: the first attachment really must fail.
      expect(posts[0]!.prompt).toBe(draft);
      expect(diagnostics.some(line => line.includes('[DeepRole memory preparation]') && line.includes('RP333') && line.includes('"stage":"navigation"') && line.includes('"detail":"activation-tab-inactive"'))).toBe(true);
      expect((await records()).find(r => r.kind === 'world').data.sharedGame.activeChatId).toBe(f.binding.chatId);
      await chat.bringToFront(); await chat.locator('textarea').fill(draft + ' ');
      const notice = chat.getByRole('region', { name: oldChatNoticeText(locale).title, exact: true });
      await expect(notice).toBeVisible();
      await notice.getByRole('button', { name: oldChatNoticeText(locale).stay, exact: true }).click();
      await expect(notice).toHaveCount(0);
    } else {
      expect(posts[0]!.prompt).toContain(f.entry.content);
      expect(posts[0]!.prompt).toContain('<deeprole_read_only>');
      expect(posts[0]!.prompt).not.toContain('<deeprole_chat_notice');
    }
    if (mode === 'stale-parent') {
      // A legitimate canonical edit can finish while this tab misses/delays its
      // library notification. The first local parent check must reject the old
      // base; preparation may refresh once before the ONE native model send.
      await panel.evaluate(({ id }) => new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error);
        open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records'), read = store.get(`entity:${id}`);
          read.onsuccess = () => { const row = read.result; row.data = { ...row.data, updatedAt: row.data.updatedAt + 1, characterSheet: { ...row.data.characterSheet, appearance: 'LATE_PROFILE_CANON_331' } }; store.put(row); };
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      }), { id: f.entities[0]!.id });
    }
    await send(2);
    expect(posts).toHaveLength(2); expect(posts[1]!.prompt).toContain(f.entry.content);
    expect(posts[1]!.prompt).toContain('<deeprole_read_only>');
    expect(posts[1]!.prompt).not.toContain('<deeprole_chat_notice');
    expect(posts[1]!.chat_session_id).toBe(nextChat); expect(posts[1]!.parent_message_id).toBe(2);
    if (mode === 'stale-parent') expect(posts[1]!.prompt).toContain('LATE_PROFILE_CANON_331');
    await chat.reload(); await expect(chat.locator('html')).toHaveAttribute('data-deeprole-context', /deeprole_/);
    await send(4);
    expect(posts).toHaveLength(3); expect(posts[2]!.prompt).toContain(f.entry.content);
    expect(posts[2]!.prompt).toContain('<deeprole_read_only>');
    expect(posts[2]!.prompt).not.toContain('<deeprole_chat_notice');
    expect(posts[2]!.chat_session_id).toBe(nextChat); expect(posts[2]!.parent_message_id).toBe(4);
    const saved = await records();
    expect(saved.find(r => r.kind === 'world').data.sharedGame.activeChatId).toBe(nextChat);
    if (mode !== 'rejected-navigation') expect(saved.find(r => r.kind === 'binding' && r.data.chatId === nextChat).data.oldChatNotice).toBeUndefined();
    if (mode === 'stale-parent') expect(saved.find(r => r.kind === 'entity' && r.id === f.entities[0]!.id).data.characterSheet.appearance).toBe('LATE_PROFILE_CANON_331');
    await info.attach('memory-recovered', { body: await chat.screenshot(), contentType: 'image/png' });
  } finally {
    await info.attach('runtime-diagnostics', { body: diagnostics.join('\n'), contentType: 'text/plain' });
    await context.close();
  }
});
