import { useEffect, useState } from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import { browser } from "wxt/browser";
import type { Locale } from "../../core/types";
import { storyUxText } from "../../core/story-ux-i18n";
import { ActiveStoryReviewCard } from "./StoryReview";
import { ActiveStoryCheckpoint } from "./StoryCheckpoint";
import { StoryDiagnostics } from "./StoryDiagnostics";
import { checkActiveStoryDiagnostics } from "../../adapters/story-diagnostics-client";
import "./story-workspace.css";
import { WorldGamePanel } from "./WorldGamePanel";
import { StoryAutomationInbox } from "./StoryAutomationInbox";
import { StoryAutomationPanel } from "./StoryAutomationPanel";
import { StoryMemoryBatchPanel } from "./StoryMemoryBatchPanel";
import { StoryTaskPanel } from "./StoryTaskPanel";
import { StoryEpisodePanel } from "./StoryEpisodePanel";
import type { StoryAutomationMode, StoryAutomationPolicy } from "../../core/story-automation";
import type { WorldGame } from "../../core/world-game";
export function StoryWorkspace({ locale, worldId, worldName, chatId, connected, active, generating, onPlay, onWorlds, sharedGame, archives, automation, onAutomation }: { locale: Locale; worldId: string | null; worldName?: string; chatId: string | null; connected: boolean; active: boolean; generating: boolean; onPlay: () => void; onWorlds: () => void; sharedGame?: WorldGame; archives?: number; automation?: StoryAutomationPolicy; onAutomation?: (mode: StoryAutomationMode) => Promise<void> }) {
 const [visited, setVisited] = useState(active); useEffect(() => { if (active) setVisited(true); }, [active]);
  const t = (key: Parameters<typeof storyUxText>[1]) => storyUxText(locale, key);
  const gameAction = async (reset = false, undo = false) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !chatId || !worldId) throw Error("story-binding-conflict");
    const result = await browser.tabs.sendMessage(tab.id, reset ? { type: "DR_STORY_GAME", operation: undo ? "restore" : "reset", manual: "stop", scope: { chatId, worldId } } : { type: "DR_RESUME_WORLD_GAME", chatId, worldId });
    if (!result?.ok) throw Error(result?.error ?? "story-game-inactive");
  };
 const changeAutomation = async (mode: StoryAutomationMode) => {
   if (!onAutomation || !worldId || !chatId) throw Error("story-binding-conflict");
   if (mode !== "off" && !sharedGame?.managed) {
     const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
     if (!tab?.id) throw Error("story-binding-conflict");
     const reply = await browser.tabs.sendMessage(tab.id, { type: "DR_STORY_GAME", operation: "start", manual: "stop", scope: { worldId, chatId } });
     if (!reply?.ok) throw Error(reply?.error ?? "story-binding-conflict");
   }
   await onAutomation(mode);
 };
 return <div className="view-stack dr-story-workspace"><div className="view-title"><div><h1>{t("title")}</h1><p className="view-subtitle">{t("intro")}</p>{worldName && connected && <p className="dr-story-world-name"><BookOpen size={16}/>{worldName}</p>}</div></div>
  {!connected || !chatId ? <section className="settings-card dr-story-empty"><h2>{t("chatTitle")}</h2><p>{t("chatHint")}</p><button className="button" type="button" onClick={onPlay}>{t("backToPlay")}<ChevronRight size={16}/></button></section>
  : !worldId ? <section className="settings-card dr-story-empty"><h2>{t("connectTitle")}</h2><p>{t("connectHint")}</p><div className="button-row"><button className="button" type="button" onClick={onPlay}>{t("chooseWorld")}</button><button className="button secondary" type="button" onClick={onWorlds}>{t("browseWorlds")}</button></div></section>
  : visited && <>{onAutomation && <StoryAutomationPanel locale={locale} policy={automation} recording={!!sharedGame?.managed} blocked={generating || !!sharedGame && sharedGame.activeChatId !== chatId} onChange={changeAutomation} />}<StoryMemoryBatchPanel locale={locale} scope={{worldId,chatId}} recording={!!sharedGame?.managed} revision={sharedGame?.revision} blocked={generating || !!sharedGame && sharedGame.activeChatId !== chatId}/>{automation && sharedGame && (sharedGame.managed || !!sharedGame.pendingReviewIds?.length) && sharedGame.activeChatId === chatId && <StoryAutomationInbox locale={locale} tabs={browser.tabs} scope={{ worldId,chatId }} revision={sharedGame.revision} blocked={generating}/>} {sharedGame && <StoryEpisodePanel locale={locale} game={sharedGame}/>} {sharedGame && <StoryTaskPanel locale={locale} facts={sharedGame.facts}/>} {sharedGame && <WorldGamePanel worldId={worldId} worldName={worldName} locale={locale} game={sharedGame} chatId={chatId} archives={archives} blocked={generating} onResume={() => gameAction()} onReset={() => gameAction(true)} onUndoReset={() => gameAction(true,true)}/>}<ActiveStoryReviewCard locale={locale} tabs={browser.tabs} guided operationBlocked={generating} scope={{ worldId, chatId }}/>
   <details className="settings-card dr-story-advanced"><summary>{t("advanced")}</summary><p className="setting-copy">{t("advancedHint")}</p><ActiveStoryCheckpoint locale={locale} tabs={browser.tabs}/><StoryDiagnostics locale={locale} onCheck={() => checkActiveStoryDiagnostics(browser.tabs)}/></details></>}
 </div>;
}
