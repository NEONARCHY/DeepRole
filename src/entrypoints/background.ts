import { browser } from "wxt/browser";
import { REPOSITORY_PORT, serveJsonPort } from "../storage/repository-stream";
import { getImageSettings } from "../storage/image-settings";
import { approveSelfie } from "../storage/selfie-images";
import { CastCoordinator, type CastMessage } from "../adapters/cast-coordinator";
import { IsolatedFieldCoordinator, type FieldMessage } from "../adapters/isolated-field-coordinator";
import { handleImageMessage } from "../adapters/image/background-handler";
import type { DeepRoleMessage } from "../core/messages";
import { repository } from "../storage/repository";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../storage/story-dispatch-capture";
import { validStoryDispatchCaptureInput, validStoryDispatchSource } from "../core/story-dispatch-capture";
import { validStoryDispatchPacket } from "../core/story-dispatch";
import { validNativeStoryStreamPacket } from "../core/story-native-stream";
import { pendingDispatchReplies, recordDispatchReply } from "../storage/story-dispatch-reply";
import { validNativeStoryReplyResult } from "../core/story-native-reply";
import { validNativeStoryId } from "../core/story-transport";
import { readStoryCheckpoint, saveStoryCheckpoint } from "../storage/story-checkpoint";
import { validStoryCheckpointChoice, validStoryCheckpointScope } from "../core/story-checkpoint";
import { readStoryReview, previewStoryReview } from "../storage/story-review";
import { validStoryReviewInput, validStoryPreviewInput } from "../core/story-review";
import { validStoryGameInput } from "../core/story-game";
import { runStoryGame, storyGameStatus, markNonStoryMessage } from "../storage/story-game";
import { readAutomationReview, resolveAutomationReview } from "../storage/story-automation-review";
import { validAutomationReviewRead, validAutomationReviewDecision } from "../core/story-automation-review";
import { approveStoryFact, validStoryFactApproval } from "../storage/story-facts";
import { readCharacterDiscovery, approveCharacterDiscovery } from "../storage/story-character-discovery";
import { validCharacterDiscoveryRead, validCharacterDiscoveryApproval } from "../core/story-character-discovery";
import { validSupplementRead, validSupplementApproval } from "../core/profile-supplements";
import { readProfileSupplements, approveProfileSupplement } from "../storage/profile-supplements";
import { readStoryIdentities, approveStoryIdentity } from "../storage/story-identity-management";
import { readStoryMerge, approveStoryMerge, undoStoryMerge } from "../storage/story-character-merge";
import { validMergeRead, validMergeApproval, validMergeUndo } from "../core/story-character-merge";
import { validIdentityRead, validIdentityApproval } from "../core/story-identity-management";
import { applyMemoryProposals, discardMemoryProposals, undoLoreChange } from "../storage/memory-proposals";
import { validMemoryProposal, validMemoryEntry } from "../core/proposal-validation";
import { migrateLegacyProposals } from "../storage/legacy-proposals";
import { announceLibraryChange, LIBRARY_CHANGE_KEY } from "../storage/changes";
import { storageKeys, getSettings, getVaultConfig, getSessionKey } from "../storage/settings";
import { saveCharacter, applyCharacterTurn, addCharacterAction } from "../storage/characters";
import { savePortraitLayout } from "../storage/portrait-layout";
import { bindCharacterTurn, characterTurnKey, actionsFor, parseCharacterTurn, relationshipTurnEnabled } from "../core/characters";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { TabSessionStore } from "../storage/tab-session";
import { captureContinuation, completeContinuation } from "../storage/story-continuation";
import { acknowledgeOldChatNotice } from "../storage/old-chat-notice";
import { validOldChatNoticeEdit } from "../core/old-chat-notice";
import { activateWorldGame } from "../storage/world-game";
import { validWorldGameActivation } from "../core/world-game";
import { acknowledgeRecoveredReply, saveRecoveredReply } from "../storage/recovered-replies";

export default defineBackground(() => {
  const tabSessions = new TabSessionStore(browser.storage.session);
  const cast = new CastCoordinator();
  const fields = new IsolatedFieldCoordinator();
  void fields.reconcilePending().catch(() => undefined);
  void cast.reconcilePending().catch(() => undefined);
  void repository.isLocked().then(async locked => { if (!locked) await repository.migratePhotos(); await cast.auto(); }).catch(() => undefined);
  const browserApi = browser as typeof browser & {
    sidePanel?: {
      setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
      open?: (options: { tabId?: number; windowId?: number }) => Promise<void>;
    };
    sidebarAction?: { open?: () => Promise<void> };
  };

  // Session storage isn't exposed to content scripts by default in Chrome.
  // Relay lock/unlock as a text-free library signal, never expose the vault key.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && LIBRARY_CHANGE_KEY in changes) { void cast.auto().catch(() => undefined); void cast.reconcilePending().catch(() => undefined); void fields.reconcilePending().catch(() => undefined); }
    if (area === "session" && storageKeys.sessionKey in changes) { void announceLibraryChange(); void cast.cancelLocked().then(() => cast.reconcilePending()).catch(() => undefined); void fields.cancelLocked().then(() => fields.reconcilePending()).catch(() => undefined); }
  });

  const handleMessage = (message: DeepRoleMessage, sender: import("wxt/browser").Browser.runtime.MessageSender) => {
    if (message.type === "DR_FIELD" || message.type === "DR_FIELD_WORKER") return fields.handle(message as FieldMessage, sender);
    if (message.type === "DR_CAST" || message.type === "DR_CAST_WORKER") return cast.handle(message as CastMessage, sender);
    if (message.type.startsWith("DR_IMAGE_")) return handleImageMessage(message as import("../core/image-messages").ImageMessage, sender);
    if (message.type === "DR_PING") {
      if (sender.id !== browser.runtime.id) return;
      return Promise.resolve({ ok: true, build: import.meta.env.VITE_BUILD_TIME });
    }
    if (message.type === "DR_MIGRATE_LEGACY") {
      if (sender.id !== browser.runtime.id) return;
      return migrateLegacyProposals().then(() => ({ ok: true }), () => ({ ok: false }));
    }
    if (message.type === "DR_REVIEW_MEMORY") {
      if (sender.id !== browser.runtime.id || !sender.tab || !sender.url?.startsWith("https://chat.deepseek.com/")) return;
      return (async () => {
        try {
          if (message.operation === "apply") return { ok: true, change: await applyMemoryProposals(message.batchId, message.items, repository, message.profileChoice) };
          if (message.operation === "undo") await undoLoreChange(message.id);
          else await discardMemoryProposals(message.id);
          return { ok: true };
        } catch { return { ok: false, error: "memory-conflict" }; }
      })();
    }
    if (message.type === "DR_REPOSITORY") {
      if (sender.id !== browser.runtime.id || !sender.tab || !sender.url?.startsWith("https://chat.deepseek.com/")) return;
      return (async () => {
        try {
          if (message.operation === "isLocked") return { ok: true, data: await repository.isLocked() };
          if (await repository.isLocked()) throw new Error("vault-locked");
          if (message.operation === "activateWorldGame") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || !validWorldGameActivation(message.input)) throw Error("story-game-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (tab.url !== message.input.chatUrl || !isSameDeepSeekChat(message.input.chatUrl, tab.url, message.input.chatId) || message.input.mode !== "initialize" && !tab.active) throw Error("story-binding-conflict");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current(); const data = await activateWorldGame(message.input, repository, current); await current(); return { ok: true, data };
          }
          if (message.operation === "readProfileSupplements" || message.operation === "approveProfileSupplement") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || (message.operation === "readProfileSupplements" ? !validSupplementRead(message.input) : !validSupplementApproval(message.input))) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!); if (!tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, message.input.chatId) || message.operation === "approveProfileSupplement" && !tab.active) throw Error("story-binding-conflict");
              // The commit callback already holds the library lock. Use the raw
              // vault/session check, never a nested repository lock acquisition.
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const data = message.operation === "readProfileSupplements" ? await readProfileSupplements(message.input) : await approveProfileSupplement(message.input, repository, current);
            await current(); return { ok: true, data };
          }
          if (message.operation === "readStoryMerge" || message.operation === "approveStoryMerge" || message.operation === "undoStoryMerge") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || !(message.operation === "readStoryMerge" ? validMergeRead(message.input) : message.operation === "approveStoryMerge" ? validMergeApproval(message.input) : validMergeUndo(message.input))) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, message.input.chatId) || message.operation !== "readStoryMerge" && !tab.active) throw Error("story-binding-conflict");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const data = message.operation === "readStoryMerge" ? await readStoryMerge(message.input) : message.operation === "approveStoryMerge" ? await approveStoryMerge(message.input, repository, current) : await undoStoryMerge(message.input, repository, current);
            await current(); return { ok: true, data };
          }
          if (message.operation === "readStoryIdentities" || message.operation === "approveStoryIdentity") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || (message.operation === "readStoryIdentities" ? !validIdentityRead(message.input) : !validIdentityApproval(message.input))) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, message.input.chatId) || message.operation === "approveStoryIdentity" && !tab.active) throw Error("story-binding-conflict");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const data = message.operation === "readStoryIdentities" ? await readStoryIdentities(message.input) : await approveStoryIdentity(message.input, repository, current);
            await current(); return { ok: true, data };
          }
          if (message.operation === "readCharacterDiscovery" || message.operation === "approveCharacterDiscovery") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || (message.operation === "readCharacterDiscovery" ? !validCharacterDiscoveryRead(message.input) : !validCharacterDiscoveryApproval(message.input))) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, message.input.chatId) || message.operation === "approveCharacterDiscovery" && !tab.active) throw Error("story-binding-conflict");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const data = message.operation === "readCharacterDiscovery" ? await readCharacterDiscovery(message.input) : await approveCharacterDiscovery(message.input, repository, current);
            await current(); return { ok: true, data };
          }
          if (message.operation === "readAutomationReview" || message.operation === "resolveAutomationReview") {
            const input = message.input;
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || !(message.operation === "readAutomationReview" ? validAutomationReviewRead(input) : validAutomationReviewDecision(input))) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.active || !tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, input.chatId)) throw Error("story-binding-conflict");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const data = message.operation === "readAutomationReview" ? await readAutomationReview(message.input) : await resolveAutomationReview(message.input,repository,current);
            await current(); return { ok: true, data };
          }
          if (message.operation === "runStoryGame" || message.operation === "storyGameStatus" || message.operation === "markNonStoryMessage" || message.operation === "approveStoryFact") {
            const scope = message.operation === "runStoryGame" || message.operation === "approveStoryFact" ? message.input : message;
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id) || !validNativeStoryId(scope.chatId) || !scope.worldId || message.operation === "runStoryGame" && !validStoryGameInput(message.input)) throw Error("story-game-invalid");
            if (message.operation === "approveStoryFact" && !validStoryFactApproval(message.input)) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, scope.chatId)) throw Error("story-binding-conflict");
              if ((message.operation === "markNonStoryMessage" || message.operation === "approveStoryFact" || message.operation === "runStoryGame" && ["start", "restart", "reset", "restore", "resume", "undo"].includes(message.input.operation)) && !tab.active) throw Error("story-binding-conflict");
              // Also called while updateRecords holds the library lock. A nested
              // repository.isLocked() would deadlock every successful game write.
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current();
            const receipt = message.operation === "runStoryGame" ? (await tabSessions.get(sender.tab!.id!)).characterRequest : undefined;
            const data = message.operation === "storyGameStatus" ? await storyGameStatus(scope.chatId, scope.worldId) : message.operation === "markNonStoryMessage" ? await markNonStoryMessage(scope.chatId, scope.worldId, repository, current) : message.operation === "approveStoryFact" ? await approveStoryFact(message.input, repository, current) : await runStoryGame(message.input, await getSettings(), repository, current, receipt ? { ownerTabId: sender.tab!.id!, receipt, enabled: (await getImageSettings()).enabled } : undefined);
            await current();
            if (message.operation === "runStoryGame" && typeof data === "object" && data && "freshPhotos" in data) {
              const game = data as Awaited<ReturnType<typeof runStoryGame>>;
              const binding = (await repository.list<import("../core/types").ChatBinding>("binding")).find(b => b.chatId === scope.chatId && b.worldId === scope.worldId);
              for (const photo of game.freshPhotos ?? []) if (binding?.scenePhotos?.some(p => p.imageKey === photo.imageKey && p.generation?.status === "queued")) await approveSelfie({ worldId: scope.worldId, chatId: scope.chatId, chatUrl: message.chatUrl, messageKey: photo.messageKey }, photo);
              return { ok: true, data: { active: game.active, changed: game.changed, ...(game.preparedParentKey !== undefined ? { preparedParentKey: game.preparedParentKey } : {}), ...(game.update ? { update: game.update, revisionId: game.revisionId, repairAttempted: game.repairAttempted } : {}) } };
            }
            return { ok: true, data };
          }
          if (message.operation === "readStoryReview" || message.operation === "previewStoryReview") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id)) throw Error("story-binding-conflict");
            if (message.operation === "readStoryReview" ? !validStoryReviewInput(message.input) : !validStoryPreviewInput(message.input)) throw Error("story-review-invalid");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.active || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, message.input.chatId)) throw Error("story-binding-conflict");
            };
            await current();
            const data = message.operation === "readStoryReview" ? await readStoryReview(message.input) : await previewStoryReview(message.input);
            await current();
            if (await repository.isLocked()) throw Error("vault-locked");
            return { ok: true, data };
          }
          if (message.operation === "readStoryCheckpoint" || message.operation === "saveStoryCheckpoint") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id)) throw Error("story-binding-conflict");
            const scope = message.operation === "readStoryCheckpoint" ? message.scope : message.choice;
            if (message.operation === "readStoryCheckpoint" ? !validStoryCheckpointScope(scope) : !validStoryCheckpointChoice(scope)) throw Error("story-checkpoint-invalid");
            const owner = sender.tab!.id!;
            const current = async () => {
              const tab = await browser.tabs.get(owner);
              if (!tab.active || !tab.url || tab.url !== message.chatUrl || !isSameDeepSeekChat(message.chatUrl, tab.url, scope.chatId)) throw Error("story-binding-conflict");
            };
            await current();
            if (message.operation === "readStoryCheckpoint") return { ok: true, data: await readStoryCheckpoint(message.scope, owner) };
            return { ok: true, data: await saveStoryCheckpoint(message.choice, owner, repository, current) };
          }
          if (message.operation === "pendingDispatchReplies" || message.operation === "recordDispatchReply") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id)) throw Error("dispatch-scope-conflict");
            if (message.operation === "pendingDispatchReplies" ? !validNativeStoryId(message.chatId) : !validNativeStoryReplyResult(message.result)) throw Error("dispatch-input-invalid");
            const chatId = message.operation === "pendingDispatchReplies" ? message.chatId : (message.result as import("../core/story-native-reply").NativeStoryReplyResult).identity.chatId;
            const owner = sender.tab!.id!, tab = await browser.tabs.get(owner);
            if (!tab.url || !isSameDeepSeekChat(message.chatUrl, tab.url, chatId)) throw Error("dispatch-scope-conflict");
            if (message.operation === "pendingDispatchReplies") return { ok: true, data: await pendingDispatchReplies(chatId, owner) };
            if (validNativeStoryReplyResult(message.result)) await recordDispatchReply(message.result, owner);
            return { ok: true };
          }
          if (message.operation === "prepareDispatchCapture" || message.operation === "confirmDispatchCapture" || message.operation === "advanceDispatchCapture") {
            if (sender.frameId !== 0 || !Number.isSafeInteger(sender.tab!.id)) throw Error("dispatch-scope-conflict");
            const value = message.operation === "prepareDispatchCapture" ? message.input : message.operation === "confirmDispatchCapture" ? message.source : message.packet;
            if (!(message.operation === "prepareDispatchCapture" ? validStoryDispatchCaptureInput(value) : message.operation === "confirmDispatchCapture" ? validStoryDispatchSource(value) : validStoryDispatchPacket(value) || validNativeStoryStreamPacket(value))) throw Error("dispatch-input-invalid");
            const chatId = (value as { identity: { chatId: string } }).identity.chatId;
            const tabId = sender.tab!.id!, tab = await browser.tabs.get(tabId);
            if (!tab.url || !isSameDeepSeekChat(message.chatUrl, tab.url, chatId)) throw Error("dispatch-scope-conflict");
            if (message.operation === "prepareDispatchCapture") await prepareDispatchCapture(message.input, tabId);
            else if (message.operation === "confirmDispatchCapture" && validStoryDispatchSource(message.source)) await confirmDispatchCapture(message.source, tabId);
            else if (message.operation === "advanceDispatchCapture" && (validStoryDispatchPacket(message.packet) || validNativeStoryStreamPacket(message.packet))) await advanceDispatchCapture(message.packet, tabId);
            return { ok: true };
          }
          if (message.operation === "readPhoto") return { ok: true, data: await repository.readPhoto(message.id) };
          if (message.operation === "storePhoto") return { ok: true, data: await repository.storePhoto(message.image) };
          if (message.operation === "saveRecoveredReply" || message.operation === "acknowledgeRecoveredReply") {
            const tab = await browser.tabs.get(sender.tab!.id!);
            if (!tab.url || !isSameDeepSeekChat(message.edit.chatUrl, tab.url, message.edit.chatId)) throw new Error("reply-scope");
            // Disabling recovery stops new capture/transmission, not the receipt for text already sent.
            if (message.operation === "saveRecoveredReply" && (await getSettings()).replyRecoveryEnabled === false) throw new Error("reply-disabled");
            if (message.operation === "saveRecoveredReply") await saveRecoveredReply(message.edit);
            else await acknowledgeRecoveredReply(message.edit);
            return { ok: true };
          }
          if (message.operation === "acknowledgeOldChatNotice") {
            if (sender.frameId !== 0 || !validOldChatNoticeEdit(message.input)) throw Error("handoff-scope");
            const current = async () => {
              const tab = await browser.tabs.get(sender.tab!.id!);
              if (!tab.url || !isSameDeepSeekChat(message.input.chatUrl, tab.url, message.input.chatId)) throw Error("handoff-scope");
              if ((await getVaultConfig()).enabled && !await getSessionKey()) throw Error("vault-locked");
            };
            await current(); await acknowledgeOldChatNotice(message.input, repository, current); return { ok: true };
          }
          if (message.operation === "completeContinuation") {
            const tabId = sender.tab!.id!, tab = await browser.tabs.get(tabId);
            if (!tab.url || !(isSameDeepSeekChat(`https://chat.deepseek.com/a/chat/s/${message.targetChatId}`, tab.url, message.targetChatId) || new URL(tab.url).origin === "https://chat.deepseek.com" && new URL(tab.url).pathname === "/")) throw new Error("handoff-scope");
            const ok = await tabSessions.completeSnapshot(tabId, message.snapshot.id, message.token, () => completeContinuation(message.snapshot, message.targetChatId));
            return { ok: true, data: ok };
          }
          if (message.operation === "captureContinuation") {
            const tab = await browser.tabs.get(sender.tab!.id!);
            if (!tab.url || !isSameDeepSeekChat(message.input.chatUrl, tab.url, message.input.chatId)) throw new Error("handoff-scope");
            return { ok: true, data: await captureContinuation(message.input) };
          }
          if (message.operation === "saveCharacter" || message.operation === "applyCharacterTurn" || message.operation === "savePortraitLayout" || message.operation === "addCharacterAction") {
            const scope = message.operation === "applyCharacterTurn" || message.operation === "addCharacterAction" ? message.scope : message.edit;
            // A SPA can change chats without replacing the document that sent
            // the message. Validate against the current top-level tab URL,
            // rather than the document URL captured by the sender.
            const tabId = sender.tab?.id;
            if (tabId === undefined) throw new Error("character-scope");
            const currentTab = await browser.tabs.get(tabId);
            if (!currentTab.url || !isSameDeepSeekChat(scope.chatUrl, currentTab.url, scope.chatId)) throw new Error("character-scope");
            const settings = await getSettings();
            if (!settings.characterSheetsEnabled) throw new Error("character-disabled");
            if (message.operation === "addCharacterAction") return { ok: true, data: await addCharacterAction(message.scope, message.name, actionsFor(settings.characterActions)) };
            if (message.operation === "savePortraitLayout") {
              if ((settings.portraitLayoutResetAt ?? 0) !== message.edit.resetAt) throw new Error("character-conflict");
              await savePortraitLayout(message.edit);
            }
            else if (message.operation === "saveCharacter") return { ok: true, data: await saveCharacter(message.edit, repository, actionsFor(settings.characterActions)) };
            else {
              const turn = parseCharacterTurn(`<deeprole_characters>${JSON.stringify(message.turn)}</deeprole_characters>`);
              if (!turn) throw new Error("character-invalid");
              const receipt = (await tabSessions.get(tabId)).characterRequest;
              const bound = turn.request ? bindCharacterTurn(turn, receipt, message.scope) : turn;
              if (!bound) throw new Error("character-conflict");
              const characterWorld = await repository.get<import("../core/types").WorldProfile>("world", message.scope.worldId);
              await applyCharacterTurn(message.scope, bound, actionsFor(characterWorld?.characterActions ?? settings.characterActions), repository, !!turn.request, relationshipTurnEnabled(turn, receipt, message.scope, settings.relationshipsEnabled !== false), !!turn.request && receipt?.accepted === true && receipt.generatedSelfiesEnabled === true && (await getImageSettings()).enabled);
              if (turn.request && receipt?.generatedSelfiesEnabled) {
                const binding = (await repository.list<import("../core/types").ChatBinding>("binding")).find(b => b.chatId === message.scope.chatId);
                for (const photo of binding?.scenePhotos ?? []) if (photo.generation?.status === "queued" && photo.worldId === message.scope.worldId && photo.turnKey === characterTurnKey(bound)) {
                  await approveSelfie({ ...message.scope, messageKey: photo.messageKey }, photo);
                }
              }
            }
            return { ok: true };
          }
          if (message.operation === "snapshot") {
            await repository.migratePhotos();
            await migrateLegacyProposals().catch(() => undefined);
            return { ok: true, data: await repository.rawRecords() };
          }
          if (message.operation === "list") return { ok: true, data: await repository.list(message.kind) };
          if (message.operation === "get") return { ok: true, data: await repository.get(message.kind, message.id) };
          if (message.operation === "putChecked") { await repository.putIfUnchanged(message.kind, message.value, message.expected); return { ok: true }; }
          if (message.operation === "put" && ["entry", "binding", "snapshot", "proposal"].includes(message.kind)) {
            if (message.kind === "proposal" && !validMemoryProposal(message.value) || message.kind === "entry" && !validMemoryEntry(message.value)) throw new Error("invalid-record");
            await repository.put(message.kind, message.value);
            return { ok: true };
          }
          return { ok: false, error: "unsupported-operation" };
        } catch (error) {
          // Keep actionable, fixed story codes; never send arbitrary storage text.
          const code = error instanceof Error ? error.message : "";
          const storyCodes = ["vault-locked", "story-game-paused", "story-manual-conflict", "story-profile-conflict", "story-manual-baseline-conflict", "story-effects-untracked", "story-native-line-unavailable", "story-source-incomplete", "story-review-stale", "story-binding-conflict", "story-start-stale"];
          return { ok: false, error: code.startsWith("character-") || storyCodes.includes(code) ? code : "storage-unavailable" };
        }
      })();
    }
    if (sender.tab?.id && ["DR_GET_DRAFT_SCENE", "DR_SAVE_DRAFT_SCENE"].includes(message.type)) {
      const key = `deeprole_draft_scene_${sender.tab.id}`;
      if (message.type === "DR_SAVE_DRAFT_SCENE") return browser.storage.session?.set({ [key]: message.scene });
      return browser.storage.session?.get(key).then((value) => value[key] ?? null);
    }
    if (sender.tab?.id && ["DR_GET_TAB_STATE", "DR_SAVE_TAB_STATE"].includes(message.type)) {
      return message.type === "DR_SAVE_TAB_STATE"
        ? tabSessions.patch(sender.tab.id, message.state, message.expected)
        : tabSessions.get(sender.tab.id);
    }
    if (message.type === "DR_DATA_CHANGED") {
      void cast.auto().catch(() => undefined);
      // An embedded extension frame can report the same tab as the content script.
      // Include that tab too, otherwise edits inside the menu leave chat context stale.
      return browser.tabs.query({ url: "https://chat.deepseek.com/*" }).then((tabs) => Promise.all(tabs.filter((tab) => tab.id).map((tab) => browser.tabs.sendMessage(tab.id!, message).catch(() => undefined))));
    }
    if (message.type !== "DR_OPEN_PANEL") return;
    if (browserApi.sidePanel?.open) {
      const options = sender.tab?.id ? { tabId: sender.tab.id } : sender.tab?.windowId ? { windowId: sender.tab.windowId } : undefined;
      if (options) return browserApi.sidePanel.open(options);
    }
    if (browserApi.sidebarAction?.open) return browserApi.sidebarAction.open();
  };
  browser.runtime.onMessage.addListener(handleMessage);
  browser.runtime.onConnect.addListener(port => {
    if (port.name !== REPOSITORY_PORT) return;
    const sender = port.sender;
    if (sender?.id !== browser.runtime.id || !sender.tab || !sender.url?.startsWith("https://chat.deepseek.com/")) { port.disconnect(); return; }
    serveJsonPort(port, request => {
      if (!request || typeof request !== "object" || (request as { type?: unknown }).type !== "DR_REPOSITORY") throw new Error("unsupported-operation");
      return handleMessage(request as DeepRoleMessage, sender);
    });
  });
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: "deeprole-save-selection",
        title: browser.i18n.getMessage("contextMenuSave") || "Save selection to DeepRole",
        contexts: ["selection"],
        documentUrlPatterns: ["https://chat.deepseek.com/*"],
      });
    });
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void fields.removed(tabId);
    void tabSessions.remove(tabId);
    void cast.removed(tabId).catch(() => undefined);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "deeprole-save-selection" || !info.selectionText || !tab?.id) return;
    void browser.tabs.sendMessage(tab.id, {
      type: "DR_SAVE_SELECTION",
      text: info.selectionText,
    } satisfies DeepRoleMessage);
  });

  if (browser.sidePanel?.setPanelBehavior) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    browser.action.onClicked.addListener(() => {
      if (browserApi.sidebarAction?.open) void browserApi.sidebarAction.open();
    });
  }
});
