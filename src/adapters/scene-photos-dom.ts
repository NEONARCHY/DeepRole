import type { ChatBinding, Locale, SceneEntity } from "../core/types";
import { SELFIE_DELAY, resolveScenePhoto } from "../core/selfies";
import { nativeMessageIdentity, nativeMessageRows, isUserMessage } from "./deepseek-message-dom";
import { isReplacedReply } from "../core/reply-recovery";
import { characterTurnKey, parseCharacterTurn } from "../core/characters";
import { openPortraitViewer, photoCopy } from "./portrait-viewer";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";

const style = `
:host{display:block;max-width:360px;margin:16px 0;font:13px/1.5 system-ui;color:var(--dr-text)}
figure{margin:0;background:var(--dr-panel);border:1px solid var(--dr-border-strong);border-radius:12px;overflow:hidden}
button{display:block;position:relative;width:100%;border:0;padding:0;background:var(--dr-bg);cursor:zoom-in}
button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:-3px}
img{display:block;max-height:420px;width:100%;object-fit:contain}
figcaption,p{margin:0;padding:10px 12px;color:var(--dr-muted)}p{min-height:70px;display:grid;place-items:center}
`;
export class ScenePhotosPresenter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private doc: Document = document) {}
  clear() { clearTimeout(this.timer); this.timer = undefined; this.doc.querySelectorAll("[data-deeprole-scene-photos]").forEach(node => node.remove()); }
  sync(binding: ChatBinding | undefined, worldId: string | null | undefined, entities: SceneEntity[], locale: Locale, enabled: boolean): void {
    clearTimeout(this.timer); this.timer = undefined;
    const records = enabled && binding && worldId ? (binding.scenePhotos ?? []).filter(p => p.worldId === worldId) : [];
    if (!records.length) { this.clear(); return; }
    const byMessage = new Map<string, typeof records>(); for (const photo of records) byMessage.set(photo.messageKey, [...(byMessage.get(photo.messageKey) ?? []), photo]);
    const hasFallback = records.some(photo => photo.messageKey.startsWith("turn:"));
    const wanted = new Set<Element>(); let wait = Infinity;
    for (const row of nativeMessageRows(this.doc).filter(row => !isUserMessage(row) && !row.hasAttribute("data-deeprole-service-reply"))) {
      const identity = nativeMessageIdentity(row); if (identity && !byMessage.has(identity) && !hasFallback) continue;
      const raw = row.cloneNode(true) as HTMLElement;
      raw.querySelectorAll("[data-deeprole-scene-photos], .ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning']").forEach(n => n.remove());
      if (isReplacedReply(raw.textContent ?? "")) continue;
      const turn = parseCharacterTurn(raw.textContent ?? ""); const turnKey = turn ? characterTurnKey(turn) : undefined;
      const key = nativeMessageIdentity(row) ?? (turnKey ? "turn:" + turnKey : undefined);
      const photos = (byMessage.get(key ?? "") ?? []).filter(p => !turnKey || p.turnKey === turnKey);
      if (!photos.length) continue;
      let host = row.querySelector<HTMLElement>(":scope > [data-deeprole-scene-photos]");
      const signature = JSON.stringify(photos.map(photo => {
        const person = entities.find(e => e.id === photo.entityId); const image = resolveScenePhoto(photo, person);
        const delay = Math.max(0, photo.createdAt + SELFIE_DELAY - Date.now()); if (delay) wait = Math.min(wait, delay);
        return [photo.entityId, photo.imageKey, person?.name, !!image, delay > 0, locale];
      }));
      if (!host) { host = this.doc.createElement("div"); host.dataset.deeproleScenePhotos = "true"; host.attachShadow({ mode: "open" }); row.append(host); }
      wanted.add(host);
      if (host.dataset.signature === signature) continue;
      host.dataset.signature = signature; const shadow = host.shadowRoot!; const css = this.doc.createElement("style"); css.textContent = designTokens + style;
      shadow.replaceChildren(css);
      for (const photo of photos) {
        const person = entities.find(e => e.id === photo.entityId); const image = resolveScenePhoto(photo, person); const t = photoCopy(locale);
        const figure = this.doc.createElement("figure"); const label = [person?.name, t.selfie].filter(Boolean).join(" · ");
        if (Date.now() < photo.createdAt + SELFIE_DELAY || !image) {
          const pending = this.doc.createElement("p"); pending.setAttribute("role", "status"); pending.textContent = image ? t.waiting : t.missing; figure.append(pending);
        } else {
          const open = this.doc.createElement("button"); open.type = "button"; open.setAttribute("aria-label", t.open + ": " + label);
          const img = this.doc.createElement("img"); img.src = image; img.alt = label; img.loading = "lazy";
          open.append(img); open.onclick = () => openPortraitViewer(this.doc, image, label, locale); figure.append(open);
        }
        const caption = this.doc.createElement("figcaption"); caption.textContent = label; figure.append(caption); shadow.append(figure);
      }
    }
    this.doc.querySelectorAll("[data-deeprole-scene-photos]").forEach(host => { if (!wanted.has(host)) host.remove(); });
    if (Number.isFinite(wait)) this.timer = setTimeout(() => this.sync(binding, worldId, entities, locale, enabled), wait + 20);
  }
}
