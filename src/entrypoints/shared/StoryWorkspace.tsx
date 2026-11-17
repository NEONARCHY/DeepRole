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
import type { WorldRestartPreview } from "../../core/world-restart-preview";
const sections = ["overview", "memory", "tasks", "people", "episodes", "timeline"] as const;
type Section = typeof sections[number];
const sectionIcons = { overview: LayoutDashboard, memory: BrainCircuit, tasks: ListChecks, people: Users, episodes: FileText, timeline: History };
export function StoryWorkspace({ locale, worldId, worldName, chatId, connected, active, generating, onPlay, onWorlds, sharedGame, archives, automation, onAutomation,onFullReset,restartPreview, overviewRequest = 0 }: { locale: Locale; worldId: string | null; worldName?: string; chatId: string | null; connected: boolean; active: boolean; generating: boolean; onPlay: () => void; onWorlds: () => void; sharedGame?: WorldGame; archives?: number; automation?: StoryAutomationPolicy; onAutomation?: (mode: StoryAutomationMode) => Promise<void>;onFullReset?:()=>void;restartPreview?:WorldRestartPreview; overviewRequest?: number }) {
 const [visited, setVisited] = useState(active); useEffect(() => { if (active) setVisited(true); }, [active]);
 const [section, setSection] = useState<Section>("overview");
 const [opened, setOpened] = useState<Partial<Record<Section, boolean>>>({ overview: true });
 const [batchStatus, setBatchStatus] = useState<MemoryBatchStatus>();
 const heading = useRef<HTMLHeadingElement>(null), id = useId();
 const select = (next: Section) => { setSection(next); setOpened(old => ({ ...old, [next]: true })); };
 const initialSection = useRef(true);
 useEffect(() => { if (initialSection.current) { initialSection.current = false; return; } heading.current?.focus(); }, [section]);
 const seenOverviewRequest = useRef(0);
 useEffect(() => {
   if (!active || seenOverviewRequest.current === overviewRequest) return;
   seenOverviewRequest.current = overviewRequest;
   if (section === "overview") heading.current?.focus();
   else setSection("overview");
 }, [active, overviewRequest, section]);
 const inactiveChat = !!sharedGame && sharedGame.activeChatId !== chatId;
 const pendingCount = inactiveChat ? 0 : sharedGame?.pendingReviewIds?.length ?? 0;
 const hasInbox = !!sharedGame && !inactiveChat && (pendingCount > 0 || !!automation && sharedGame.managed);
 const queueLeads = section === "overview" && hasInbox;
  const t = (key: Parameters<typeof storyUxText>[1]) => storyUxText(locale, key);
  const gameAction = async (reset = false, undo = false, expectedBase?: string) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !chatId || !worldId) throw Error("story-binding-conflict");
    const result = await browser.tabs.sendMessage(tab.id, reset ? { type: "DR_STORY_GAME", operation: undo ? "restore" : "reset", manual: "stop", scope: { chatId, worldId }, ...(expectedBase ? { expectedBase } : {}) } : { type: "DR_RESUME_WORLD_GAME", chatId, worldId });
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
 return <div className="view-stack dr-story-workspace"><div className="view-title"><div><h1>{t("title")}</h1>{worldName && connected && <p className="dr-story-world-name"><BookOpen size={16} aria-hidden="true"/>{worldName}</p>}</div></div>
  {!connected || !chatId ? <section className="settings-card dr-story-empty"><h2>{t("chatTitle")}</h2><p>{t("chatHint")}</p><button className="button" type="button" onClick={onPlay}>{t("backToPlay")}<ChevronRight size={16}/></button></section>
  : !worldId ? <section className="settings-card dr-story-empty"><h2>{t("connectTitle")}</h2><p>{t("connectHint")}</p><div className="button-row"><button className="button" type="button" onClick={onPlay}>{t("chooseWorld")}</button><button className="button secondary" type="button" onClick={onWorlds}>{t("browseWorlds")}</button></div></section>
  : visited && <>
   {generating && <p className="dr-workspace-notice" role="status">{t("busyHint")}</p>}
   {inactiveChat && <div className="dr-workspace-notice is-warning"><strong>{t("oldChat")}</strong><p>{t("oldChatHint")}</p></div>}
   <nav className="dr-workspace-nav" aria-label={t("workspaceNavigation")}>{sections.map(key => { const Icon = sectionIcons[key]; return <button data-dr-guide={`story-${key}`} key={key} type="button" aria-current={section === key ? "page" : undefined} aria-controls={id + "-content"} onClick={() => select(key)}><Icon size={17} aria-hidden="true"/><span>{t(key)}</span>{key === "overview" && pendingCount > 0 && <span className="dr-story-inbox-count">{pendingCount}</span>}</button>; })}</nav>
   <section id={id + "-content"} className="dr-workspace-content" aria-labelledby={queueLeads ? undefined : id + "-heading"} aria-label={queueLeads ? t("overview") : undefined}>
    {!queueLeads && <header className="dr-workspace-heading"><h2 ref={heading} id={id + "-heading"} tabIndex={-1}>{t(section)}</h2>{section !== "overview" && <p className="setting-copy">{t(`${section}Hint`)}</p>}</header>}
    <div hidden={section !== "overview"} className="dr-workspace-stack">
     {hasInbox && <StoryAutomationInbox locale={locale} tabs={browser.tabs} scope={{ worldId, chatId }} revision={sharedGame.revision} blocked={generating} headingRef={queueLeads ? heading : undefined}/>}
     {onAutomation && <StoryAutomationPanel compact locale={locale} policy={automation} recording={!!sharedGame?.managed} blocked={generating || inactiveChat} onChange={changeAutomation}/>}
    </div>
    {opened.episodes && sharedGame?.managed && <div hidden={section !== "episodes"}><StoryEpisodePanel locale={locale} game={sharedGame}/></div>}
    {opened.tasks && sharedGame?.managed && <div data-dr-guide="story-tasks-content" hidden={section !== "tasks"}><StoryTaskPanel locale={locale} facts={sharedGame.facts}/></div>}
    <div hidden={(section === "episodes" || section === "tasks") && !!sharedGame?.managed}><ActiveStoryReviewCard locale={locale} tabs={browser.tabs} guided workspaceSection={section} operationBlocked={generating} readOnly={inactiveChat} scope={{ worldId, chatId }}/></div>
    <div hidden={section !== "overview"} className="dr-workspace-stack">
     <details className="settings-card dr-story-advanced"><summary>{t("extraCheck")}{(batchStatus?.reason === "failed" || batchStatus?.reason === "running") && <span className="dr-workspace-status" data-warning={batchStatus.reason === "failed"}>{locale === "ru" ? batchStatus.reason === "failed" ? "Нужно внимание" : "Идёт проверка" : batchStatus.reason === "failed" ? "Needs attention" : "Review running"}</span>}</summary><p className="setting-copy">{t("extraCheckHint")}</p><StoryMemoryBatchPanel locale={locale} scope={{worldId,chatId}} recording={!!sharedGame?.managed} revision={sharedGame?.revision} blocked={generating || inactiveChat} onStatusChange={setBatchStatus}/></details>
     {sharedGame && <details className="settings-card dr-story-advanced" open={inactiveChat || undefined}><summary>{t("maintenance")}</summary><p className="setting-copy">{t("maintenanceHint")}</p><WorldGamePanel worldId={worldId} worldName={worldName} locale={locale} game={sharedGame} chatId={chatId} archives={archives} blocked={generating} onResume={() => gameAction()} restartPreview={restartPreview} onReset={base => gameAction(true,false,base)} onUndoReset={() => gameAction(true,true)} onFullReset={onFullReset}/></details>}
     <details className="settings-card dr-story-advanced"><summary>{t("advanced")}</summary><p className="setting-copy">{t("advancedHint")}</p><ActiveStoryCheckpoint locale={locale} tabs={browser.tabs}/></details>
    </div>
   </section>
  </>}
 </div>;
}
