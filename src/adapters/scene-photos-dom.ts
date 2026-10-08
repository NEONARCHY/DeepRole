import type { ChatBinding, Locale, SceneEntity, ScenePhoto } from "../core/types";
import { SELFIE_DELAY, resolveScenePhoto } from "../core/selfies";
import { nativeMessageIdentity, nativeMessageRows, isUserMessage } from "./deepseek-message-dom";
import { isReplacedReply } from "../core/reply-recovery";
import { characterTurnKey, parseCharacterTurn } from "../core/characters";
import { openPortraitViewer, photoCopy } from "./portrait-viewer";
import type { Illustration } from "../core/image-generation";
import { imageText, imageErrorKey } from "../core/image-i18n";
interface PhotoOptions { illustrations?: Illustration[]; generationEnabled?: boolean; onRetry?: (photo: ScenePhoto) => Promise<void>; onRemove?: (photo: ScenePhoto) => Promise<void>; onDownload?: (ticketId: string) => Promise<void> }
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
  sync(binding: ChatBinding | undefined, worldId: string | null | undefined, entities: SceneEntity[], locale: Locale, enabled: boolean, options: PhotoOptions = {}): void {
    clearTimeout(this.timer); this.timer = undefined;
    const records = enabled && binding && worldId ? (binding.scenePhotos ?? []).filter(p => p.worldId === worldId) : [];
    if (!records.length) { this.clear(); return; }
    const resolveImage = (photo: ScenePhoto, person?: SceneEntity) => photo.generation ? options.illustrations?.find(image => image.id === photo.generation?.illustrationId && image.entityId === photo.entityId && image.worldId === photo.worldId && image.chatId === binding?.chatId && image.messageKey === photo.messageKey)?.image : resolveScenePhoto(photo, person);
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
        const person = entities.find(e => e.id === photo.entityId); const image = resolveImage(photo, person);
        const delay = Math.max(0, photo.createdAt + SELFIE_DELAY - Date.now()); if (delay) wait = Math.min(wait, delay);
        return [photo.entityId, photo.imageKey, person?.name, !!image, options.illustrations?.find(i => i.id === photo.generation?.illustrationId)?.updatedAt, delay > 0, photo.generation, options.generationEnabled, locale];
      }));
      if (!host) { host = this.doc.createElement("div"); host.dataset.deeproleScenePhotos = "true"; host.attachShadow({ mode: "open" }); row.append(host); }
      wanted.add(host);
      if (host.dataset.signature === signature) continue;
      host.dataset.signature = signature; const shadow = host.shadowRoot!; const css = this.doc.createElement("style"); css.textContent = designTokens + style;
      shadow.replaceChildren(css);
      for (const photo of photos) {
        const person = entities.find(e => e.id === photo.entityId); const image = resolveImage(photo, person); const t = photoCopy(locale);
        const figure = this.doc.createElement("figure"); const label = [person?.name, t.selfie].filter(Boolean).join(" · ");
        if (Date.now() < photo.createdAt + SELFIE_DELAY || !image) {
          const pending = this.doc.createElement("p"); pending.setAttribute("role", "status"); pending.textContent = image ? t.waiting : photo.generation ? photo.generation.status === "ready" ? t.missing : photo.generation.status === "failed" ? imageText(locale, imageErrorKey({ code: photo.generation.error })) : options.generationEnabled === false ? imageText(locale, "disabled") : locale === "ru" ? "Создаём селфи…" : "Creating selfie…" : t.missing; figure.append(pending);
          if (photo.generation?.status === "failed" && options.generationEnabled) {
            const action = this.doc.createElement("button"); action.type = "button"; action.style.cssText = "font:inherit;padding:10px 12px;cursor:pointer;color:var(--dr-text)";
            const ticketId = photo.generation.ticketId;
            action.textContent = imageText(locale, ticketId ? "downloadResult" : "regenerate");
            action.onclick = () => { action.disabled = true; void (ticketId ? options.onDownload?.(ticketId) : options.onRetry?.(photo))?.catch(() => undefined).finally(() => { if (action.isConnected) action.disabled = false; }); };
            figure.append(action);
          }
        } else {
          const open = this.doc.createElement("button"); open.type = "button"; open.setAttribute("aria-label", t.open + ": " + label);
          const img = this.doc.createElement("img"); img.src = image; img.alt = label; img.loading = "lazy";
          open.append(img); open.onclick = () => openPortraitViewer(this.doc, image, label, locale); figure.append(open);
        }
        const caption = this.doc.createElement("figcaption"); caption.textContent = label; figure.append(caption);
        if (image && photo.generation && options.onRetry && options.illustrations?.find(i => i.id === photo.generation?.illustrationId)?.request) {
          const retry = this.doc.createElement("button"); retry.type = "button"; retry.textContent = imageText(locale, "retrySame"); retry.title = imageText(locale, "retryHint"); retry.style.cssText = "font:inherit;width:auto;padding:8px 12px;cursor:pointer;color:var(--dr-text)";
          retry.onclick = () => { retry.disabled = true; void options.onRetry!(photo).catch(() => undefined).finally(() => { if (retry.isConnected) retry.disabled = false; }); }; figure.append(retry);
        }
        if (image && photo.generation && options.onRemove) {
          const remove = this.doc.createElement("button"); remove.type = "button"; remove.textContent = imageText(locale, "deleteImage"); remove.style.cssText = "font:inherit;width:auto;padding:6px 12px;cursor:pointer;color:var(--dr-muted)";
          remove.onclick = () => { remove.disabled = true; void options.onRemove!(photo).catch(() => undefined).finally(() => { if (remove.isConnected) remove.disabled = false; }); };
          figure.append(remove);
        }
        shadow.append(figure);
      }
    }
    this.doc.querySelectorAll("[data-deeprole-scene-photos]").forEach(host => { if (!wanted.has(host)) host.remove(); });
    if (Number.isFinite(wait)) this.timer = setTimeout(() => this.sync(binding, worldId, entities, locale, enabled, options), wait + 20);
  }
}
