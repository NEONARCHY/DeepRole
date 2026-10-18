import { afterEach, expect, it } from 'vitest';
import { explicitOutOfCharacter } from '../src/core/story-message-mode';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { characterRevision, DEFAULT_ACTIONS, EMPTY_STATUS } from '../src/core/characters';
import { DeepRoleDatabase } from '../src/storage/database';
import { DeepRoleRepository } from '../src/storage/repository';
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from '../src/storage/story-dispatch-capture';
import { applyCharacterTurn } from '../src/storage/characters';
import { storyWorld } from './fixtures/story-worlds';
import type { StoryDispatchCapture } from '../src/core/story-dispatch-capture';
import type { ChatBinding } from '../src/core/types';

const dbs: DeepRoleDatabase[] = [];
it('consumes the manual one-shot only after exact source proof, once', async () => {
  const f = storyWorld('en'), db = new DeepRoleDatabase('ooc-manual-' + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  await repo.put('binding', { ...f.binding, nextStoryMessageMode: 'out-of-character' });
  const id = crypto.randomUUID(), identity = { chatId: f.binding.chatId, nativeParentKey: JSON.stringify(['message','41']) };
  await prepareDispatchCapture({ id, identity, transport: 'xhr', worldId: f.world.id, bindingId: f.binding.id, sceneRevision: f.binding.characterScenes![f.world.id]!.revision, originalDraft: 'Explain.', proposedContext: 'REFERENCE' },7,repo);
  expect((await repo.get<ChatBinding>('binding',f.binding.id))!.nextStoryMessageMode).toBe('out-of-character');
  expect((await repo.get<StoryDispatchCapture>('dispatch',id))!.consumeNonStoryMode).toBe(true);
  const source = { requestId: id, identity, transport: 'xhr' as const, outgoingText: 'WRONG' };
  await expect(confirmDispatchCapture(source,7,repo)).rejects.toThrow();
  expect((await repo.get<ChatBinding>('binding',f.binding.id))!.nextStoryMessageMode).toBe('out-of-character');
  source.outgoingText = 'REFERENCE\n\n[User message]\nExplain.'; await confirmDispatchCapture(source,7,repo);
  expect((await repo.get<ChatBinding>('binding',f.binding.id))!.nextStoryMessageMode).toBeUndefined();
  const binding = (await repo.get<ChatBinding>('binding',f.binding.id))!; await repo.put('binding',{...binding,nextStoryMessageMode:'out-of-character'});
  await confirmDispatchCapture(source,7,repo);
  expect((await repo.get<ChatBinding>('binding',f.binding.id))!.nextStoryMessageMode).toBe('out-of-character');
});
it.each(['Запись из книги:\n\nНе продолжай сцену.', '```\n\nНе продолжай сцену.\n\n```', 'OOC: Explain.\nВ игре: я открываю дверь.'])('keeps embedded or mixed directives outside automatic mode: %s', draft => {
  expect(explicitOutOfCharacter(draft)).toBe(false);
});
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
it.each(['OOC: Explain the promise.', '  Вне игры: что с обещанием?', '[OOC] Explain.', '(OOC: Explain.)', 'Не продолжай сцену. Напомни условия.', 'Это проверка. Не продолжай сцену и не придумывай новые сведения.', 'Do not continue the scene. Explain.', 'Не развивай сцену, объясни условия.'])('recognises explicit whole-message OOC: %s', draft => {
  expect(explicitOutOfCharacter(draft)).toBe(true);
});
it.each(['Что Нора обещала?', 'Я открываю дверь.', 'Мира сказала: «Не продолжай сцену».', '«Это проверка. Не продолжай сцену».', '```\nНе продолжай сцену.\n```', '> Не продолжай сцену.', 'OOC-герой пришёл.', 'Я читаю запись:\nВне игры: это текст записки.', '[OOC: поясни]\n*Открываю дверь*', 'OOC: Explain.\nIC: I open the door.'])('does not guess OOC from story or quoted data: %s', draft => {
  expect(explicitOutOfCharacter(draft)).toBe(false);
});
it.each(['ru', 'en'] as const)('read-only %s retains memory without writing protocols or choices', locale => {
  const f = storyWorld(locale); f.world.storyAutomation = { mode: 'automatic', revision: 'policy' };
  const result = compileGameContext({ draft: locale === 'ru' ? 'Что мы знаем о ключе от часов?' : 'Where is the clock key?', recentMessages: [], entries: [f.entry], books: [], entities: f.entities, worlds: [f.world], scene: { worldId: f.world.id, bookId: null, focusIds: [] }, activeBookId: null, settings: { contextBudget: 2000, relevanceThreshold: 6 }, character: [f.world.id, f.binding.chatId, f.entities, f.binding.characterScenes![f.world.id], DEFAULT_ACTIONS, [], '', 'test-request', true, false, true], story: { world: f.world, chat: f.binding.chatId, branch: 'test-branch', sheetsEnabled: true, facts: [{ kind: 'promise', text: 'Repair only after consent AND a permit.', quote: 'Repair only after consent AND a permit.' }] }, choices: true, readOnly: true });
  expect(result.text).toContain('Repair only after consent AND a permit.');
  expect(result.text).toContain('Read-only character reference');
  expect(result.text).toContain('<deeprole_read_only>');
  expect(result.text).not.toContain('<deeprole_story_update_mode>');
  expect(result.text).not.toContain('Memory accompaniment mode is automatic');
  expect(result.text).not.toContain('<deeprole_choice_mode');
  expect(addedContextTokens(result.text)).toBeLessThanOrEqual(2000);
});
it.each([true, false].flatMap(withRequest=>[false,true].map(brackets=>({withRequest,brackets}))))('durable OOC capture rejects legacy metadata: $withRequest/$brackets', async ({withRequest,brackets}) => {
  const f = storyWorld('en'), db = new DeepRoleDatabase('ooc-' + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  if(brackets)await repo.put('world',{...f.world,bracketedOoc:true});
  const id = crypto.randomUUID(), identity = { chatId: f.binding.chatId, nativeParentKey: JSON.stringify(['message','41']) }, route = { requestId: id, identity, transport: 'xhr' as const };
  const input = { id, identity, transport: 'xhr' as const, worldId: f.world.id, bindingId: f.binding.id, sceneRevision: f.binding.characterScenes![f.world.id]!.revision, originalDraft: brackets?'[Explain the promise.]':'OOC: Explain the promise.', proposedContext: 'READ ONLY' };
  await prepareDispatchCapture(input, 7, repo);
  const saved = (await repo.get<StoryDispatchCapture>('dispatch', id))!;
  expect(saved.purpose).toBe('out-of-character'); expect(saved.roleRoster).toBeUndefined(); expect(saved.accompaniment).toBeUndefined();
  await confirmDispatchCapture({ ...route, outgoingText: 'READ ONLY\n\n[User message]\n' + input.originalDraft }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: 'started' }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: 'settled', delivery: { status: 'accepted', httpStatus: 200 } }, 7, repo);
  const link = { requestId: id, chatId: f.binding.chatId, nativeParentKey: identity.nativeParentKey, userMessageKey: JSON.stringify(['message','42']), assistantMessageKey: JSON.stringify(['message','43']) };
  await advanceDispatchCapture({ ...route, phase: 'closed', link, sawFinish: true, issue: null }, 7, repo);
  const before = await repo.rawRecords(), base = characterRevision(f.entities, f.binding.characterScenes![f.world.id]);
  await expect(applyCharacterTurn({ worldId: f.world.id, chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, base, replyIdentity: JSON.stringify(['virtual','43']) }, { world: f.world.id, chat: f.binding.chatId, base, ...(withRequest ? { request: id } : {}), present: [], updates: [{ id: f.entities[0]!.id, state: { ...EMPTY_STATUS, condition: 'MUST NOT APPLY' } }] }, undefined, repo)).rejects.toThrow('character-read-only');
  expect(await repo.rawRecords()).toEqual(before);
});
