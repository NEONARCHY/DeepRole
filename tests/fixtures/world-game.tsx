import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorldGamePanel } from "../../src/entrypoints/shared/WorldGamePanel";
import type { WorldGame } from "../../src/core/world-game";
import "../../src/entrypoints/sidepanel/styles.css";
import "../../src/entrypoints/shared/story-workspace.css";
const locale = new URL(location.href).searchParams.get("locale") === "en" ? "en" : "ru";
document.documentElement.lang = locale;
const fixture = { fail: false, resets: 0, undos: 0 }; (window as any).worldGameFixture = fixture;
const initial: WorldGame = { version: 1, id: "game", revision: "rev", activationId: "activation", activeChatId: "new-chat", activeBindingId: "binding:new", managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts: [], updatedAt: 1 };
function App() { const [game, setGame] = useState(initial), [archives, setArchives] = useState(0);
 return <div className="app-shell"><h1>{locale === "ru" ? "История" : "Story"}</h1><WorldGamePanel locale={locale} game={game} chatId="old-chat" archives={archives} onResume={async () => { if (fixture.fail) throw Error("failed"); setGame({ ...game, activeChatId: "old-chat" }); }} onReset={async () => { if (fixture.fail) throw Error("failed"); fixture.resets++; setArchives(n => n + 1); setGame({ ...game, restartPending: true }); }} onUndoReset={async () => { fixture.undos++; setArchives(n => n - 1); setGame({ ...game, restartPending: undefined }); }}/></div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
