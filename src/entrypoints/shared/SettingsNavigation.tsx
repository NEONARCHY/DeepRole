import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, BarChart3, ChevronRight, KeyRound, Languages, PanelsTopLeft, Users, Image, Archive, ShieldCheck, BrainCircuit, Wrench } from "lucide-react";
import type { Locale } from "../../core/types";
import { navigationText, type SettingsSection } from "../../core/navigation-i18n";
import "./settings-navigation.css";

type Route = Exclude<SettingsSection, "home">;
const icons = { app: Languages, appearance: PanelsTopLeft, characters: Users, images: Image, data: Archive, safety: ShieldCheck, memory: BrainCircuit, diagnostics: Wrench };

export function SettingsNavigation({ locale, section, onSelect, worldName, desktopPanel, focusOnMount }: {
  locale: Locale; section: SettingsSection; onSelect: (section: SettingsSection) => void; worldName?: string;
  desktopPanel?: boolean; focusOnMount?: boolean;
}) {
  const t = (key: Parameters<typeof navigationText>[1]) => navigationText(locale, key);
  const heading = useRef<HTMLHeadingElement>(null);
  const routes = useRef<Partial<Record<Route, HTMLButtonElement | null>>>({});
  const advanced = useRef<HTMLDetailsElement>(null);
  const previous = useRef(section);
  useLayoutEffect(() => { if (focusOnMount) heading.current?.focus(); }, [focusOnMount]);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = section;
    if (from === section) return;
    if (section === "home" && from !== "home") {
      if ((from === "memory" || from === "diagnostics") && advanced.current) advanced.current.open = true;
      routes.current[from]?.focus();
    } else {
      heading.current?.focus();
    }
  }, [section]);

  function row(id: Route) {
    const Icon = icons[id];
    const hint = id === "appearance" && desktopPanel ? "desktopAppearanceHint" : `${id}Hint` as const;
    return <button ref={node => { routes.current[id] = node; }} data-dr-guide={`settings-${id}`} type="button" className="dr-settings-route"
      aria-label={t(id)} aria-describedby={`dr-route-hint-${id}`} onClick={() => onSelect(id)}>
      <Icon size={20} aria-hidden="true"/>
      <span><strong>{t(id)}</strong><small id={`dr-route-hint-${id}`}>{t(hint)}</small></span>
      <ChevronRight size={16} aria-hidden="true"/>
    </button>;
  }
  function desktopAction(id: "textModel" | "usage", type: "MODEL_SETTINGS" | "USAGE") {
    const Icon = id === "textModel" ? KeyRound : BarChart3;
    return <button type="button" className="dr-settings-route" aria-label={t(id)} aria-haspopup="dialog" aria-describedby={`dr-route-hint-${id}`}
      onClick={() => window.parent.postMessage({ source: "deeprole-menu", type }, window.location.origin)}>
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      <span><strong>{t(id)}</strong><small id={`dr-route-hint-${id}`}>{t(`${id}Hint`)}</small></span>
      <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>;
  }
  return <section className="dr-settings-directory" data-desktop-settings={desktopPanel || undefined} data-dr-guide="settings-directory" aria-label={t("settings")}>
    {section === "home" ? <>
      <h1 ref={heading} tabIndex={-1}>{t("settings")}</h1>{!desktopPanel && <p>{t("intro")}</p>}
      <nav aria-label={t("settings")}>
        {desktopPanel && <section className="dr-settings-group"><h2>{t("connection")}</h2>{desktopAction("textModel", "MODEL_SETTINGS")}{desktopAction("usage", "USAGE")}</section>}
        <section className="dr-settings-group"><h2>{t("everyday")}</h2>{row("appearance")}{row("app")}</section>
        <section className="dr-settings-group"><h2>{t("optional")}</h2>{row("characters")}{row("images")}</section>
        <section className="dr-settings-group"><h2>{t("dataGroup")}</h2>{row("safety")}{row("data")}</section>
        <details ref={advanced} className="dr-settings-advanced"><summary data-dr-guide="settings-advanced-toggle">{t("advanced")}</summary>{row("memory")}{row("diagnostics")}</details>
      </nav>
    </> : <>
      <button data-dr-guide="settings-home" className="dr-settings-back" type="button" onClick={() => onSelect("home")}><ArrowLeft size={16} aria-hidden="true"/>{t("back")}</button>
      <h1 ref={heading} tabIndex={-1}>{t(section)}</h1>
      {(section === "app" || section === "appearance" || section === "safety") && <p>{t("globalScope")}</p>}
      {(section === "memory" || section === "characters") && <p>{worldName ? t(section === "memory" ? "worldScope" : "characterScope").replace("{name}", worldName) : t("defaultScope")}</p>}
      {section === "memory" && <p>{t("memoryNotice")}</p>}
      {section === "data" && <p>{t("dataNotice")}</p>}
      {section === "diagnostics" && <p>{t("diagnosticsNotice")}</p>}
      {section !== "diagnostics" && section !== "data" && <p className="dr-settings-save-hint">{t("saveHint")}</p>}
    </>}
  </section>;
}
