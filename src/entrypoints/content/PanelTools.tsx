import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { adaptiveText } from "../../core/adaptive-layout";
import type { Locale } from "../../core/types";
import { PanelWidthControl } from "../shared/PanelWidthControl";

export const panelToolsText = {
  ru: {
    title: "Вид панелей", compactTitle: "Панели чата", choose: "Открыть панель", close: "Закрыть", mode: "Перемещать панели вместе",
    modeHint: "Потяните одну панель, и остальные сдвинутся вместе с ней.",
    portraits: "Показывать портреты", portraitsHint: "Портреты участников сцены появляются рядом с вариантами ответа.",
    reset: "Сбросить расположение панелей", resetHint: "Вернёт панели под название чата, отменит ручное сворачивание и выключит совместное перемещение.",
    moveHint: "Потяните за ручку с точками, чтобы сдвинуть все панели. С клавиатуры используйте стрелки. Shift увеличивает шаг.",
    meter: "Объём чата", memory: "Память", characters: "Персонажи", scene: "Мир и сцена", choices: "Варианты", notices: "Проверка",
  },
  en: {
    title: "Panel settings", compactTitle: "Chat panels", choose: "Open a panel", close: "Close", mode: "Move panels together",
    modeHint: "Drag one panel to move the others with it.",
    portraits: "Show portraits", portraitsHint: "Scene participants appear beside the reply options.",
    reset: "Reset panel layout", resetHint: "Returns the panels below the chat title, restores panels you minimized and turns off group movement.",
    moveHint: "Drag the dotted handle to move all panels. On a keyboard, use the arrow keys. Hold Shift for larger steps.",
    meter: "Chat size", memory: "Memory", characters: "Characters", scene: "World and scene", choices: "Options", notices: "Review",
  },
};

function Switch({ label, hint, checked, change }: { label: string; hint: string; checked: boolean; change: () => void }) {
  const id = useId();
  return <label className="dr-panel-setting">
    <span><strong id={id}>{label}</strong><small id={id + "-hint"}>{hint}</small></span>
    <input type="checkbox" aria-labelledby={id} aria-describedby={id + "-hint"} checked={checked} onChange={change}/>
  </label>;
}

export function PanelTools(props: {
  locale: Locale; together: boolean; changeTogether: () => void;
  portraits?: boolean; changePortraits?: () => void; adaptive: boolean; changeAdaptive?: () => void;
  width?: number; previewWidth: (width: number | null) => void; saveWidth?: (width: number) => Promise<void>;
  reset: () => void; close: () => void; saveError: boolean; shortcuts?: ReactNode; fromHandle: boolean;
}) {
  const t = panelToolsText[props.locale], adaptive = adaptiveText(props.locale);
  const title = useId(), dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className="dr-panel-tools-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); props.close(); }}>
    <header><h2 id={title}>{props.shortcuts ? t.compactTitle : t.title}</h2><button type="button" onClick={props.close}>{t.close}</button></header>
    <div className="dr-panel-tools-body">
      {props.fromHandle && <p>{t.moveHint}</p>}
      {props.shortcuts && <section className="dr-panel-chooser"><h3>{t.choose}</h3><div>{props.shortcuts}</div></section>}
      {props.changeAdaptive && <Switch label={adaptive.title} hint={adaptive.hint} checked={props.adaptive} change={props.changeAdaptive}/>}
      {props.changePortraits && <Switch label={t.portraits} hint={t.portraitsHint} checked={!!props.portraits} change={props.changePortraits}/>}
      <Switch label={t.mode} hint={t.modeHint} checked={props.together} change={props.changeTogether}/>
      {props.saveWidth && <PanelWidthControl inlineHint locale={props.locale} value={props.width} onSave={props.saveWidth} onPreview={props.previewWidth}/>}
      <div className="dr-panel-layout-reset"><button type="button" aria-describedby={title + "-reset"} onClick={props.reset}><RotateCcw size={16} aria-hidden="true"/>{t.reset}</button><small id={title + "-reset"}>{t.resetHint}</small></div>
      {!props.fromHandle && <p>{t.moveHint}</p>}
      {props.saveError && <p role="alert">{props.locale === "ru" ? "Не удалось сохранить расположение." : "Couldn’t save the layout."}</p>}
    </div>
  </dialog>;
}
