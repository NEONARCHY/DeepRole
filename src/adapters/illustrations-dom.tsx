import { createRoot, type Root } from "react-dom/client";
import { IllustrationEditor, ImageHeaders, type IllustrationEditorProps } from "../entrypoints/shared/IllustrationEditor";
import type { Illustration, ImageSettings } from "../core/image-generation";
import type { Locale, SceneEntity } from "../core/types";
import type { ImageTarget } from "../core/image-messages";
import { imageText } from "../core/image-i18n";
import { nativeMessageIdentity, nativeMessageRows, isUserMessage, REASONING } from "./deepseek-message-dom";
import { characterTurnKey, parseCharacterTurn } from "../core/characters";
import { openPortraitViewer } from "./portrait-viewer";
import tokens from "../entrypoints/shared/design-tokens.css?raw";
import design from "../entrypoints/shared/design-system.css?raw";
import effects from "../entrypoints/shared/design-effects.css?raw";
import selects from "../entrypoints/shared/select.css?raw";
import imageLayout from "../entrypoints/shared/image-generation.css?raw";
import imageChat from "../entrypoints/shared/image-chat.css?raw";
// Raw CSS matches the other isolated presenters and avoids the entrypoint loader's CSS transform.
const theme = [tokens, design.replace(/^@import [^\r\n]*;\r?$/gm, ""), effects, selects, imageLayout, imageChat.replace(/^@import [^\r\n]*;\r?$/gm, "")].join("\n");
const sheets = new WeakMap<Document, CSSStyleSheet>();
function styleShadow(shadow: ShadowRoot) {
  const doc = shadow.ownerDocument, Sheet = doc.defaultView?.CSSStyleSheet;
  if (Sheet && "adoptedStyleSheets" in shadow) {
    try { let sheet = sheets.get(doc); if (!sheet) { sheet = new Sheet(); sheet.replaceSync(theme); sheets.set(doc, sheet); } shadow.adoptedStyleSheets = [sheet]; return; } catch { /* Older browsers use a regular style element. */ }
  }
  const style = doc.createElement("style"); style.textContent = theme; shadow.append(style);
}
interface SceneIllustrationContext {
  enabled: boolean; generating: boolean; worldId: string | null; chatId: string | null; chatUrl: string;
  records: Illustration[]; entities: SceneEntity[]; settings: ImageSettings; locale: Locale;
  actions: Pick<IllustrationEditorProps, "onGenerate" | "onSaveProfile" | "onDelta" | "onDownload"> & { onRemove(target: ImageTarget, id: string): Promise<void> };
}
export class IllustrationsPresenter {
  private readonly roots = new Map<HTMLElement, Root>();
  private editor: { host: HTMLElement; root: Root; origin: HTMLElement; scope: string } | null = null;
  constructor(private readonly doc: Document = document) {}
  close() { const editor = this.editor; if (!editor) return; this.editor = null; editor.root.unmount(); editor.host.remove(); if (editor.origin.isConnected) editor.origin.focus({ preventScroll: true }); }
  clear() { this.close(); for (const [host, root] of this.roots) { root.unmount(); host.remove(); } this.roots.clear(); }
  sync(context: SceneIllustrationContext) {
    if (!context.enabled || !context.chatId || !context.worldId) { this.clear(); return; }
    const scope = JSON.stringify([context.worldId, context.chatId, context.chatUrl]);
    if (this.editor && this.editor.scope !== scope) this.close();
    const wanted = new Set<HTMLElement>();
    for (const row of nativeMessageRows(this.doc)) {
      if (isUserMessage(row) || row.hasAttribute("data-deeprole-service-reply") || row.querySelector("[data-deeprole-service]")) continue;
      const copy = row.cloneNode(true) as HTMLElement; copy.querySelectorAll(`${REASONING},[data-deeprole-illustrations],[data-deeprole-scene-photos],[data-deeprole-choices-host]`).forEach(n => n.remove());
      const raw = copy.textContent ?? "", turn = parseCharacterTurn(raw), identity = nativeMessageIdentity(row) ?? (turn ? "turn:" + characterTurnKey(turn) : null);
      if (!identity || !raw.trim() || raw.includes("[DeepRole Service]") || raw.includes("<deeprole_data>")) continue;
      const target: ImageTarget = { worldId: context.worldId, chatId: context.chatId, chatUrl: context.chatUrl, messageKey: identity };
      const records = context.records.filter(value => value.worldId === target.worldId && value.chatId === target.chatId && value.messageKey === identity);
      let host = row.querySelector<HTMLElement>(":scope > [data-deeprole-illustrations]");
      if (!host) { host = this.doc.createElement("div"); host.dataset.deeproleIllustrations = "true"; const shadow = host.attachShadow({ mode: "open" }); styleShadow(shadow); const mount = this.doc.createElement("div"); mount.className = "dr-root"; shadow.append(mount); row.append(host); this.roots.set(host, createRoot(mount)); }
      wanted.add(host);
      const signature = JSON.stringify([target, records.map(r => [r.id, r.updatedAt]), context.settings, context.entities.map(e => [e.id, e.updatedAt]), context.locale, context.generating]);
      if (host.dataset.signature === signature) continue; host.dataset.signature = signature;
      const sceneText = raw.replace(/<deeprole_(?:characters|choices)>[\s\S]*?(?:<\/deeprole_(?:characters|choices)>|$)/gu, "").slice(0, 12_000);
      const open = (origin: HTMLElement) => {
        this.close(); const modalHost = this.doc.createElement("div"), shadow = modalHost.attachShadow({ mode: "open" }), mount = this.doc.createElement("div"); styleShadow(shadow); mount.className = "dr-root"; shadow.append(mount); this.doc.body.append(modalHost);
        const root = createRoot(mount); this.editor = { host: modalHost, root, origin, scope };
        root.render(<IllustrationEditor locale={context.locale} target={target} entities={context.entities.filter(e => e.worldId === target.worldId && e.kind === "character")} settings={context.settings} sceneText={sceneText} onClose={() => this.close()} {...context.actions} />);
      };
      this.roots.get(host)!.render(<><button type="button" className="button secondary" disabled={context.generating} onClick={event => open(event.currentTarget)}>{imageText(context.locale, "generate")}</button><div className="dr-image-gallery">{records.map(record => <figure key={record.id}><button className="dr-image-open" type="button" aria-label={imageText(context.locale, "view")} onClick={() => openPortraitViewer(this.doc, record.image, imageText(context.locale, "title"), context.locale)}><img src={record.image} alt={record.prompt.slice(0, 200)} loading="lazy" /></button><figcaption>{record.modelId}</figcaption><ImageHeaders headers={record.headers} locale={context.locale} /><div className="dr-image-actions"><button type="button" className="button secondary" disabled={context.generating} onClick={event => open(event.currentTarget)}>{imageText(context.locale, "regenerate")}</button><button type="button" className="button secondary danger" onClick={event => { const button = event.currentTarget; button.disabled = true; void context.actions.onRemove(target, record.id).catch(() => { button.disabled = false; const notice = this.doc.createElement("p"); notice.setAttribute("role", "alert"); notice.textContent = imageText(context.locale, "failed"); button.parentElement?.append(notice); }); }}>{imageText(context.locale, "deleteImage")}</button></div></figure>)}</div></>);
    }
    for (const [host, root] of this.roots) if (!wanted.has(host)) { root.unmount(); host.remove(); this.roots.delete(host); }
  }
}
