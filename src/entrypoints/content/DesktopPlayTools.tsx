import { Children, isValidElement, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { BookOpen, ChevronRight, Globe, Users } from "lucide-react";
import type { Locale } from "../../core/types";
import type { WidgetTile } from "./WidgetDeck";

type Section = "scene" | "cast" | "memory";

export function DesktopPlayTools({ children, locale, worldName, hasWorlds, needsReview, openWorlds, continuation, castSetup, reset }: {
  children: ReactNode;
  locale: Locale;
  worldName?: string;
  hasWorlds: boolean;
  needsReview: boolean;
  openWorlds: () => void;
  continuation: ReactNode;
  castSetup: ReactNode;
  reset: ReactNode;
}) {
  const [view, setView] = useState<Section>("scene");
  const navigation = useRef<HTMLElement>(null);
  const id = useId();
  const ru = locale === "ru";
  const tiles = Children.toArray(children).filter(isValidElement<ComponentProps<typeof WidgetTile>>);
  const find = (name: ComponentProps<typeof WidgetTile>["id"]) => tiles.find(tile => tile.props.id === name);
  const scene = find("scene");
  const choices = find("choices");
  const context = find("memory");
  const notices = find("notices");
  const meter = find("meter");
  const characters = find("characters");
  const hasMemory = Boolean(context || notices || meter || continuation);
  const active = (view === "cast" && !worldName) || (view === "memory" && !hasMemory) ? "scene" : view;
  useLayoutEffect(() => {
    const scroll = navigation.current?.closest(".desktop-play-tools-scroll");
    if (scroll) scroll.scrollTop = 0;
  }, [active]);

  const sections = [
    { key: "scene", label: ru ? "Сцена" : "Scene", Icon: Globe, visible: true },
    { key: "cast", label: ru ? "Герои" : "Cast", Icon: Users, visible: !!worldName },
    { key: "memory", label: ru ? "Память" : "Memory", Icon: BookOpen, visible: hasMemory },
  ] as const;

  return <>
    <nav ref={navigation} className="desktop-play-tools-tabs" aria-label={ru ? "Разделы игры" : "Game sections"}>
      {sections.filter(section => section.visible).map(({ key, label, Icon }) => <button key={key} type="button" data-section={key}
        aria-pressed={active === key} aria-controls={`${id}-${key}`} onClick={() => setView(key)}>
        <Icon size={17} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
        {key === "memory" && needsReview && <i className="desktop-play-tools-notice" role="img" aria-label={ru ? "Есть записи для проверки" : "Needs review"} />}
      </button>)}
    </nav>
    <div id={id + "-scene"} hidden={active !== "scene"} className="desktop-play-tools-section">
      <div className="desktop-scene-setup" data-world-linked={!!worldName} role="group" aria-label={ru ? "Настройки сцены" : "Scene settings"}>
        {!worldName && <div className="desktop-world-intro">
          <Globe size={22} strokeWidth={1.5} aria-hidden="true" />
          <h3>{ru ? "Подключите мир" : "Connect a world"}</h3>
          <p>{hasWorlds
            ? ru ? "Выберите мир для этой истории." : "Choose a world for this story."
            : ru ? "Создайте мир или загрузите его из файла." : "Create a world or import one from a file."}</p>
        </div>}
        {scene}
        <button className="desktop-play-tools-library" data-primary={!worldName && !hasWorlds} type="button" onClick={openWorlds}>
          <span>{worldName ? ru ? "Открыть библиотеку миров" : "Open world library" : ru ? "Открыть миры" : "Open worlds"}</span><ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        {choices && <div className="desktop-scene-options">{choices}</div>}
      </div>
      {reset}
    </div>
    {worldName && <div id={id + "-cast"} hidden={active !== "cast"} className="desktop-play-tools-section desktop-cast-section">
      {characters}
      {castSetup}
    </div>}
    {hasMemory && <div id={id + "-memory"} hidden={active !== "memory"} className="desktop-play-tools-section desktop-memory-section">
      {context}
      {notices && <div className="desktop-memory-notices">{notices}</div>}
      {meter}
      {continuation && <div className="desktop-memory-continuation">{continuation}</div>}
    </div>}
  </>;
}
