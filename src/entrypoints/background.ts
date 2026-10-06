import { browser } from "wxt/browser";
import type { DeepRoleMessage } from "../core/messages";
import { repository } from "../storage/repository";
import { applyMemoryProposals, discardMemoryProposals, undoLoreChange } from "../storage/memory-proposals";
import { validMemoryProposal, validMemoryEntry } from "../core/proposal-validation";
import { migrateLegacyProposals } from "../storage/legacy-proposals";
import { announceLibraryChange } from "../storage/changes";
import { storageKeys, getSettings } from "../storage/settings";
import { saveCharacter, applyCharacterTurn, addCharacterEmotion } from "../storage/characters";
import { savePortraitLayout } from "../storage/portrait-layout";
import { bindCharacterTurn, emotionsFor, parseCharacterTurn, relationshipTurnEnabled } from "../core/characters";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { TabSessionStore } from "../storage/tab-session";
import { captureContinuation, completeContinuation } from "../storage/story-continuation";
import { saveRecoveredReply } from "../storage/recovered-replies";

export default defineBackground(() => {
  const tabSessions = new TabSessionStore(browser.storage.session);
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
    if (area === "session" && storageKeys.sessionKey in changes) void announceLibraryChange();
  });

  browser.runtime.onMessage.addListener((message: DeepRoleMessage, sender) => {
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
          if (message.operation === "saveRecoveredReply") {
            const tab = await browser.tabs.get(sender.tab!.id!);
            if (!tab.url || !isSameDeepSeekChat(message.edit.chatUrl, tab.url, message.edit.chatId)) throw new Error("reply-scope");
            if ((await getSettings()).replyRecoveryEnabled === false) throw new Error("reply-disabled");
            await saveRecoveredReply(message.edit);
            return { ok: true };
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
          if (message.operation === "saveCharacter" || message.operation === "applyCharacterTurn" || message.operation === "savePortraitLayout" || message.operation === "addCharacterEmotion") {
            const scope = message.operation === "applyCharacterTurn" || message.operation === "addCharacterEmotion" ? message.scope : message.edit;
            // A SPA can change chats without replacing the document that sent
            // the message. Validate against the current top-level tab URL,
            // rather than the document URL captured by the sender.
            const tabId = sender.tab?.id;
            if (tabId === undefined) throw new Error("character-scope");
            const currentTab = await browser.tabs.get(tabId);
            if (!currentTab.url || !isSameDeepSeekChat(scope.chatUrl, currentTab.url, scope.chatId)) throw new Error("character-scope");
            const settings = await getSettings();
            if (!settings.characterSheetsEnabled) throw new Error("character-disabled");
            if (message.operation === "addCharacterEmotion") return { ok: true, data: await addCharacterEmotion(message.scope, message.name, emotionsFor(settings.characterEmotions)) };
            if (message.operation === "savePortraitLayout") {
              if ((settings.portraitLayoutResetAt ?? 0) !== message.edit.resetAt) throw new Error("character-conflict");
              await savePortraitLayout(message.edit);
            }
            else if (message.operation === "saveCharacter") return { ok: true, data: await saveCharacter(message.edit) };
            else {
              const turn = parseCharacterTurn(`<deeprole_characters>${JSON.stringify(message.turn)}</deeprole_characters>`);
              if (!turn) throw new Error("character-invalid");
              const receipt = (await tabSessions.get(tabId)).characterRequest;
              const bound = turn.request ? bindCharacterTurn(turn, receipt, message.scope) : turn;
              if (!bound) throw new Error("character-conflict");
              const characterWorld = await repository.get<import("../core/types").WorldProfile>("world", message.scope.worldId);
              await applyCharacterTurn(message.scope, bound, emotionsFor(characterWorld?.characterEmotions ?? settings.characterEmotions), repository, !!turn.request, relationshipTurnEnabled(turn, receipt, message.scope, settings.relationshipsEnabled !== false));
            }
            return { ok: true };
          }
          if (message.operation === "snapshot") {
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
        } catch (error) { return { ok: false, error: error instanceof Error && error.message.startsWith("character-") ? error.message : "storage-unavailable" }; }
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
    void tabSessions.remove(tabId);
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
