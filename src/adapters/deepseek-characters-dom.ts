import { latestSceneChoiceTarget } from "./deepseek-choices-dom";
import { parseCharacterTurn, characterText, emotionLabel, portraitSource, silhouetteSource, type CharacterCopyKey } from "../core/characters";
import type { CharacterScene, Locale, SceneEntity } from "../core/types";

export function latestCharacterResponse(root: ParentNode = document) {
  const target = latestSceneChoiceTarget(root);
  if (!target) return null;
  if (target.row.matches("[data-deeprole-service-reply='true']")) return null;
  const clone = target.row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning'], [data-deeprole-characters-summary]").forEach(e => e.remove());
  const text = clone.textContent ?? "";
  if (text.includes("<deeprole_character_mode>")) return null;
  return { ...target, turn: parseCharacterTurn(text) };
}

/** Fold just the transport block, never hide or alter the story or reasoning. */
export function foldCharacterPayload(row: HTMLElement, locale: Locale, status: CharacterCopyKey): void {
  const existing = row.querySelector<HTMLElement>("[data-deeprole-characters-summary]");
  if (existing) { const label = characterText(locale, status); if (existing.textContent !== label) existing.textContent = label; return; }
  const text = row.textContent ?? "";
  const start = text.indexOf("<deeprole_characters>"); const endIndex = text.indexOf("</deeprole_characters>", start);
  if (start < 0 || endIndex < 0) return;
  const end = endIndex + "</deeprole_characters>".length;
  const doc = row.ownerDocument; const range = doc.createRange(); const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let offset = 0; let started = false; let ended = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < offset + length) { range.setStart(node, start - offset); started = true; }
    if (started && end <= offset + length) { range.setEnd(node, end - offset); ended = true; break; }
    offset += length;
  }
  if (!started || !ended) return;
  const details = doc.createElement("details"); details.dataset.deeproleCharactersResult = "true";
  const summary = doc.createElement("summary"); summary.dataset.deeproleCharactersSummary = "true"; summary.textContent = characterText(locale, status);
  const raw = doc.createElement("pre"); raw.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px"; raw.append(range.extractContents());
  details.append(summary, raw); range.insertNode(details);
}

export function syncChoicePortraits(enabled: boolean, entities: SceneEntity[], scene: CharacterScene | undefined, locale: Locale, onOpen: (id: string) => void, root: ParentNode = document) {
  for (const host of root.querySelectorAll<HTMLElement>("[data-deeprole-choices-host]")) {
    const shadow = host.shadowRoot; const section = shadow?.querySelector("section");
    if (!shadow || !section) continue;
    const hero = entities.find(e => e.characterSheet?.protagonist);
    const other = scene?.partnerId === null ? undefined : entities.find(e => e.id !== hero?.id && scene?.presentIds.includes(e.id) && (!scene.partnerId || scene.partnerId === e.id));
    const people = enabled ? [hero, other].filter((e): e is SceneEntity => !!e) : [];
    const signature = JSON.stringify([locale, people.map(e => [e.id, e.updatedAt]), scene?.revision]);
    if (host.dataset.deeprolePortraits === signature && !!section.querySelector(".dr-cast-portrait") === !!people.length) continue;
    host.dataset.deeprolePortraits = signature;
    section.querySelectorAll(".dr-cast-portrait").forEach(e => e.remove());
    if (!people.length) { section.classList.remove("dr-cast-layout"); continue; }
    let content = section.querySelector<HTMLElement>(".dr-cast-content");
    if (!content) { content = document.createElement("div"); content.className = "dr-cast-content"; content.append(...section.childNodes); section.append(content); }
    section.classList.add("dr-cast-layout");
    if (!shadow.querySelector("[data-character-style]")) {
      const style = document.createElement("style"); style.dataset.characterStyle = "true";
      style.textContent = `section.dr-cast-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--dr-space-4);max-width:1000px}.dr-cast-content{grid-column:1/-1;grid-row:2;min-width:0}.dr-cast-portrait{grid-row:1;align-self:start;display:grid;justify-items:center;gap:var(--dr-space-1);width:clamp(144px,34cqi,220px);max-width:100%;min-height:44px;border:0;background:transparent;color:var(--dr-text);padding:0;text-align:center;cursor:pointer;font:inherit}.dr-cast-portrait.left{grid-column:1}.dr-cast-portrait.right{grid-column:2;justify-self:end}.dr-cast-portrait img{display:block;width:100%;height:auto;aspect-ratio:3/4;object-fit:contain;border-radius:var(--dr-radius);background:var(--dr-surface)}.dr-cast-portrait span{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:650}.dr-cast-portrait small{font-size:12px;margin:0;color:var(--dr-muted)}.dr-cast-portrait:focus-visible{outline:2px solid var(--dr-primary);outline-offset:4px;border-radius:var(--dr-radius)}.dr-cast-portrait:hover img{box-shadow:0 0 0 1px var(--dr-primary)}@container(min-width:860px){section.dr-cast-layout{grid-template-columns:192px minmax(0,1fr) 192px;gap:var(--dr-space-6)}.dr-cast-content{grid-column:2;grid-row:1}.dr-cast-portrait.right{grid-column:3}.dr-cast-portrait{width:192px}.dr-cast-content .grid{grid-template-columns:1fr}}`;
      shadow.append(style);
    }
    for (const entity of people) {
      const state = scene?.states[entity.id]; const button = document.createElement("button"); button.type = "button"; button.className = `dr-cast-portrait ${entity.id === hero?.id ? "left" : "right"}`;
      button.setAttribute("aria-label", `${characterText(locale, "edit")}: ${entity.name}`);
      const img = document.createElement("img"); img.src = portraitSource(entity, state) ?? silhouetteSource(entity.characterSheet?.gender); img.alt = "";
      const name = document.createElement("span"); name.textContent = entity.name;
      const mood = document.createElement("small"); mood.textContent = state ? emotionLabel(locale, state.emotion) : "";
      button.append(img, name, mood); button.addEventListener("click", () => onOpen(entity.id)); section.append(button);
    }
  }
}
