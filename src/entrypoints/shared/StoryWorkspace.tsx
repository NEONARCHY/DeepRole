import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChevronRight, ListChecks, Users, History, LayoutDashboard, FileText, BrainCircuit } from "lucide-react";
import { browser } from "wxt/browser";
import type { Locale } from "../../core/types";
import { storyUxText } from "../../core/story-ux-i18n";
import { ActiveStoryReviewCard } from "./StoryReview";
import { ActiveStoryCheckpoint } from "./StoryCheckpoint";
import "./story-workspace.css";
import { WorldGamePanel } from "./WorldGamePanel";
import { StoryAutomationInbox } from "./StoryAutomationInbox";
import { StoryAutomationPanel } from "./StoryAutomationPanel";
import { StoryMemoryBatchPanel } from "./StoryMemoryBatchPanel";
import { StoryTaskPanel } from "./StoryTaskPanel";
import { StoryEpisodePanel } from "./StoryEpisodePanel";
import type { StoryAutomationMode, StoryAutomationPolicy } from "../../core/story-automation";
import type { WorldGame } from "../../core/world-game";
import type { MemoryBatchStatus } from "../../core/story-memory-batch";
const sections = ["overview", "memory", "tasks", "people", "episodes", "timeline"] as const;
type Section = typeof sections[number];
const sectionIcons = { overview: LayoutDashboard, memory: BrainCircuit, tasks: ListChecks, people: Users, episodes: FileText, timeline: History };
export function StoryWorkspace({ locale, worldId, worldName, chatId, connected, active, generating, onPlay, onWorlds, sharedGame, archives, automation, onAutomation,onFullReset }: { locale: Locale; worldId: string | null; worldName?: string; chatId: string | null; connected: boolean; active: boolean; generating: boolean; onPlay: () => void; onWorlds: () => void; sharedGame?: WorldGame; archives?: number; automation?: StoryAutomationPolicy; onAutomation?: (mode: StoryAutomationMode) => Promise<void>;onFullReset?:()=>void }) {
 const [visited, setVisited] = useState(active); useEffect(() => { if (active) setVisited(true); }, [active]);
 const [section, setSection] = useState<Section>("overview");
 const [opened, setOpened] = useState<Partial<Record<Section, boolean>>>({ overview: true });
 const [batchStatus, setBatchStatus] = useState<MemoryBatchStatus>();
 const heading = useRef<HTMLHeadingElement>(null), id = useId();
 const select = (next: Section) => { setSection(next); setOpened(old => ({ ...old, [next]: true })); };
 const initialSection = useRef(true);
 useEffect(() => { if (initialSection.current) { initialSection.current = false; return; } heading.current?.focus(); }, [section]);
 const inactiveChat = !!sharedGame && sharedGame.activeChatId !== chatId;
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
  : visited && <>
   {generating && <p className="dr-workspace-notice" role="status">{t("busyHint")}</p>}
   {inactiveChat && <div className="dr-workspace-notice is-warning"><strong>{t("oldChat")}</strong><p>{t("oldChatHint")}</p></div>}
   <nav className="dr-workspace-nav" aria-label={t("workspaceNavigation")}>{sections.map(key => { const Icon = sectionIcons[key]; return <button key={key} type="button" aria-current={section === key ? "page" : undefined} aria-controls={id + "-content"} onClick={() => select(key)}><Icon size={17} aria-hidden="true"/><span>{t(key)}</span>{key === "overview" && !!sharedGame?.pendingReviewIds?.length && <span className="dr-story-inbox-count">{sharedGame.pendingReviewIds.length}</span>}</button>; })}</nav>
   <section id={id + "-content"} className="dr-workspace-content" aria-labelledby={id + "-heading"}>
    <header className="dr-workspace-heading"><h2 ref={heading} id={id + "-heading"} tabIndex={-1}>{t(section)}</h2><p className="setting-copy">{t(section === "timeline" ? "timelineHint" : `${section}Hint`)}</p></header>
    <div hidden={section !== "overview"} className="dr-workspace-stack">
     {onAutomation && <StoryAutomationPanel locale={locale} policy={automation} recording={!!sharedGame?.managed} blocked={generating || inactiveChat} onChange={changeAutomation}/>}
     {automation && sharedGame && (sharedGame.managed || !!sharedGame.pendingReviewIds?.length) && !inactiveChat && <StoryAutomationInbox locale={locale} tabs={browser.tabs} scope={{ worldId, chatId }} revision={sharedGame.revision} blocked={generating}/>}
      <details className="settings-card dr-story-advanced"><summary>{t("extraCheck")}{(batchStatus?.reason === "failed" || batchStatus?.reason === "running") && <span className="dr-workspace-status" data-warning={batchStatus.reason === "failed"}>{locale === "ru" ? batchStatus.reason === "failed" ? "Нужно внимание" : "Идёт проверка" : batchStatus.reason === "failed" ? "Needs attention" : "Review running"}</span>}</summary><p className="setting-copy">{t("extraCheckHint")}</p><StoryMemoryBatchPanel locale={locale} scope={{worldId,chatId}} recording={!!sharedGame?.managed} revision={sharedGame?.revision} blocked={generating || inactiveChat} onStatusChange={setBatchStatus}/></details>
    </div>
    {opened.episodes && <div hidden={section !== "episodes"}>{sharedGame ? <StoryEpisodePanel locale={locale} game={sharedGame}/> : <p>{t("initial")}</p>}</div>}
    {opened.tasks && <div hidden={section !== "tasks"}>{sharedGame ? <StoryTaskPanel locale={locale} facts={sharedGame.facts}/> : <p>{t("initial")}</p>}</div>}
    <div hidden={section === "episodes" || section === "tasks"}><ActiveStoryReviewCard locale={locale} tabs={browser.tabs} guided workspaceSection={section === "episodes" || section === "tasks" ? "overview" : section} operationBlocked={generating} readOnly={inactiveChat} scope={{ worldId, chatId }}/></div>
    <div hidden={section !== "overview"} className="dr-workspace-stack">
     {sharedGame && <details className="settings-card dr-story-advanced" open={inactiveChat || undefined}><summary>{t("maintenance")}</summary><p className="setting-copy">{t("maintenanceHint")}</p><WorldGamePanel worldId={worldId} worldName={worldName} locale={locale} game={sharedGame} chatId={chatId} archives={archives} blocked={generating} onResume={() => gameAction()} onReset={() => gameAction(true)} onUndoReset={() => gameAction(true,true)} onFullReset={onFullReset}/></details>}
     <details className="settings-card dr-story-advanced"><summary>{t("advanced")}</summary><p className="setting-copy">{t("advancedHint")}</p><ActiveStoryCheckpoint locale={locale} tabs={browser.tabs}/></details>
    </div>
   </section>
  </>}
 </div>;
}
