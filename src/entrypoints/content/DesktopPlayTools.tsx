import { Children, isValidElement, useId, useState, type ComponentProps, type ReactNode } from "react";
import { BookOpen, ChevronRight, Globe } from "lucide-react";
import type { Locale } from "../../core/types";
import type { WidgetTile } from "./WidgetDeck";

export function DesktopPlayTools({ children, locale, needsReview, openLibrary, continuation, preparation }: {
  children: ReactNode;
  locale: Locale;
  needsReview: boolean;
  openLibrary: () => void;
  continuation: ReactNode;
  preparation: ReactNode;
}) {
  const [view, setView] = useState<"scene" | "memory">("scene");
  const id = useId();
  const ru = locale === "ru";
  const tiles = Children.toArray(children).filter(isValidElement<ComponentProps<typeof WidgetTile>>);
  const find = (name: ComponentProps<typeof WidgetTile>["id"]) => tiles.find(tile => tile.props.id === name);
  const scene = find("scene");
  const memory = [find("memory"), find("notices"), find("meter")].filter(Boolean);
  const hasMemory = memory.length > 0 || Boolean(continuation);
  const showMemory = view === "memory" && hasMemory;

  return <>
    {hasMemory && <nav className="desktop-play-tools-tabs" aria-label={ru ? "Разделы игры" : "Game sections"}>
      <button type="button" aria-pressed={!showMemory} aria-controls={id + "-scene"} onClick={() => setView("scene")}><Globe size={16} aria-hidden="true" />{ru ? "Сцена" : "Scene"}</button>
      <button type="button" data-section="memory" aria-pressed={showMemory} aria-controls={id + "-memory"} onClick={() => setView("memory")}><BookOpen size={16} aria-hidden="true" />{ru ? "Память" : "Memory"}
        {needsReview && <i className="desktop-play-tools-notice" role="img" aria-label={ru ? "Есть записи для проверки" : "Needs review"} />}
      </button>
    </nav>}
    <div id={id + "-scene"} hidden={showMemory} className="desktop-play-tools-section">
      {scene ?? <button className="desktop-play-tools-library" type="button" onClick={openLibrary}><Globe size={17} aria-hidden="true" /><span>{ru ? "Выбрать мир в библиотеке" : "Choose a world from the library"}</span><ChevronRight size={16} aria-hidden="true" /></button>}
      {find("choices")}
      {preparation}
      {find("characters")}
    </div>
    {hasMemory && <div id={id + "-memory"} hidden={!showMemory} className="desktop-play-tools-section">
      {memory}
      {continuation}
    </div>}
  </>;
}
