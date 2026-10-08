import { createRoot, type Root } from "react-dom/client";
import { IllustrationReply, type IllustrationReplyProps } from "../entrypoints/shared/IllustrationReply";
import type { ImageAttempt } from "../core/image-plan";
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
export function illustrationSceneText(row: HTMLElement): string {
  const copy = row.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`${REASONING},[data-deeprole-illustrations],[data-deeprole-scene-photos],[data-deeprole-choices-host]`).forEach(n => n.remove());
  return (copy.textContent ?? "").replace(/<deeprole_(?:characters|choices)>[\s\S]*?(?:<\/deeprole_(?:characters|choices)>|$)/gu, "").slice(0, 12000);
}
interface SceneIllustrationContext {
  enabled: boolean; generating: boolean; worldId: string | null; chatId: string | null; chatUrl: string;
  records: Illustration[]; entities: SceneEntity[]; settings: ImageSettings; locale: Locale;
  attempts: ImageAttempt[];
  actions: Pick<IllustrationReplyProps, "onCreate" | "onRepeat" | "onDownload" | "onRemove">;
}
export class IllustrationsPresenter {
  private readonly roots = new Map<HTMLElement, Root>();
  constructor(private readonly doc: Document = document) {}
  clear() { for (const [host, root] of this.roots) { root.unmount(); host.remove(); } this.roots.clear(); }
  sync(context: SceneIllustrationContext) {
    if (!context.enabled || !context.chatId || !context.worldId) { this.clear(); return; }
    const wanted = new Set<HTMLElement>();
    for (const row of nativeMessageRows(this.doc)) {
      if (isUserMessage(row) || row.hasAttribute("data-deeprole-service-reply") || row.querySelector("[data-deeprole-service]")) continue;
      const copy = row.cloneNode(true) as HTMLElement; copy.querySelectorAll(`${REASONING},[data-deeprole-illustrations],[data-deeprole-scene-photos],[data-deeprole-choices-host]`).forEach(n => n.remove());
      const raw = copy.textContent ?? "", turn = parseCharacterTurn(raw), identity = nativeMessageIdentity(row) ?? (turn ? "turn:" + characterTurnKey(turn) : null);
      if (!identity || !raw.trim() || raw.includes("[DeepRole Service]") || raw.includes("<deeprole_data>")) continue;
      const target: ImageTarget = { worldId: context.worldId, chatId: context.chatId, chatUrl: context.chatUrl, messageKey: identity };
      const records = context.records.filter(value => !value.id.startsWith("selfie:") && value.worldId === target.worldId && value.chatId === target.chatId && value.messageKey === identity);
      let host = row.querySelector<HTMLElement>(":scope > [data-deeprole-illustrations]");
      if (!host) { host = this.doc.createElement("div"); host.dataset.deeproleIllustrations = "true"; const shadow = host.attachShadow({ mode: "open" }); styleShadow(shadow); const mount = this.doc.createElement("div"); mount.className = "dr-root"; shadow.append(mount); row.append(host); this.roots.set(host, createRoot(mount)); }
      wanted.add(host);
      const attempts = context.attempts.filter(a => a.worldId === target.worldId && a.chatId === target.chatId && a.messageKey === identity);
      const signature = JSON.stringify([target, attempts.map(a => [a.id, a.updatedAt]), records.map(r => [r.id, r.updatedAt]), context.settings, context.entities.map(e => [e.id, e.updatedAt]), context.locale, context.generating]);
      if (host.dataset.signature === signature) continue; host.dataset.signature = signature;
      const sceneText = raw.replace(/<deeprole_(?:characters|choices)>[\s\S]*?(?:<\/deeprole_(?:characters|choices)>|$)/gu, "").slice(0, 12_000);
      this.roots.get(host)!.render(<IllustrationReply key={JSON.stringify(target)} target={target} sceneText={sceneText} records={records} attempts={attempts} locale={context.locale} generating={context.generating} onView={record => openPortraitViewer(this.doc, record.image, imageText(context.locale, "title"), context.locale)} {...context.actions} />);
    }
    for (const [host, root] of this.roots) if (!wanted.has(host)) { root.unmount(); host.remove(); this.roots.delete(host); }
  }
}
