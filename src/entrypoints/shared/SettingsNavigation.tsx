import { useEffect, useRef } from "react";
import { ArrowLeft, ChevronRight, Monitor, Eye, Users, Image, Archive, ShieldCheck, BrainCircuit, Wrench } from "lucide-react";
import type { Locale } from "../../core/types";
import { navigationText, type SettingsSection } from "../../core/navigation-i18n";
import "./settings-navigation.css";
const icons = { app: Monitor, appearance: Eye, characters: Users, images: Image, data: Archive, safety: ShieldCheck, memory: BrainCircuit, diagnostics: Wrench };

export function SettingsNavigation({ locale, section, onSelect, worldName }: {
  locale: Locale; section: SettingsSection; onSelect: (section: SettingsSection) => void; worldName?: string;
}) {
  const t = (key: Parameters<typeof navigationText>[1]) => navigationText(locale, key);
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    heading.current?.focus();
  }, [section]);
  const row = (id: Exclude<SettingsSection, "home">) => { const Icon = icons[id]; return <button key={id} type="button" className="dr-settings-route" aria-label={t(id)} onClick={() => onSelect(id)}>
    <Icon size={19} aria-hidden="true"/><span><strong>{t(id)}</strong><small>{t(`${id}Hint`)}</small></span><ChevronRight size={18} aria-hidden="true"/>
  </button>; };
  return <section className="dr-settings-directory" aria-label={t("settings")}>
    {section === "home" ? <>
      <h2 ref={heading} tabIndex={-1}>{t("back")}</h2><p>{t("intro")}</p>
      <nav aria-label={t("settings")}>
        <section className="dr-settings-group"><h3>{t("everyday")}</h3>{row("app")}{row("appearance")}</section>
        <section className="dr-settings-group"><h3>{t("optional")}</h3>{row("characters")}{row("images")}</section>
        <section className="dr-settings-group"><h3>{t("dataGroup")}</h3>{row("safety")}{row("data")}</section>
        <details className="dr-settings-advanced"><summary>{t("advanced")}</summary><p>{t("advancedHint")}</p>{row("memory")}<details><summary>{t("support")}</summary><p>{t("supportHint")}</p>{row("diagnostics")}</details></details>
      </nav>
    </> : <>
      <button className="button secondary small" type="button" onClick={() => onSelect("home")}><ArrowLeft size={16} aria-hidden="true"/>{t("back")}</button>
      <h2 ref={heading} tabIndex={-1}>{t(section)}</h2><p>{t(`${section}Hint`)}</p>
      {(section === "app" || section === "appearance" || section === "safety") && <p className="dr-settings-scope">{t("globalScope")}</p>}
      {(section === "memory" || section === "characters") && <p className="dr-settings-scope">{worldName ? t(section === "memory" ? "worldScope" : "characterScope").replace("{name}", worldName) : t("defaultScope")}</p>}
      {section === "memory" && <p className="dr-settings-scope">{t("memoryNotice")}</p>}
      {section === "data" && <p className="dr-settings-scope">{t("dataNotice")}</p>}
      {section === "diagnostics" ? <p className="dr-settings-scope">{t("diagnosticsNotice")}</p> : <p className="dr-settings-save-hint">{t("saveHint")}</p>}
    </>}
  </section>;
}
