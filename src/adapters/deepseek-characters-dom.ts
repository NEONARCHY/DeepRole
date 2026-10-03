import { latestSceneChoiceTarget } from "./deepseek-choices-dom";
import { parseCharacterTurn, characterText, emotionLabel, syncPortraitImage, characterHighlights, characterInterlocutor, type CharacterCopyKey } from "../core/characters";
import type { CharacterScene, Locale, SceneEntity } from "../core/types";

const REASONING = ".ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning']";
const portraitStats = new WeakMap<HTMLButtonElement, string>();
let portraitStatsId = 0;

export function latestCharacterResponse(root: ParentNode = document) {
  const target = latestSceneChoiceTarget(root);
  if (!target) return null;
  if (target.row.matches("[data-deeprole-service-reply='true']")) return null;
  const clone = target.row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${REASONING}, [data-deeprole-characters-summary]`).forEach(e => e.remove());
  const text = clone.textContent ?? "";
  if (text.includes("<deeprole_character_mode>")) return null;
  return { ...target, turn: parseCharacterTurn(text) };
}

/** Fold just the transport block, never hide or alter the story or reasoning. */
export function foldCharacterPayload(row: HTMLElement, locale: Locale, status: CharacterCopyKey): void {
  if (row.closest(REASONING)) return;
  const existing = [...row.querySelectorAll<HTMLElement>("[data-deeprole-characters-summary]")].find(node => !node.closest(REASONING));
  if (existing) { const label = characterText(locale, status); if (existing.textContent !== label) existing.textContent = label; return; }
  const doc = row.ownerDocument;
  const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest(REASONING) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  const text = nodes.map(node => node.textContent ?? "").join("");
  const start = text.indexOf("<deeprole_characters>"); const endIndex = text.indexOf("</deeprole_characters>", start);
  if (start < 0 || endIndex < 0) return;
  const end = endIndex + "</deeprole_characters>".length;
  const range = doc.createRange();
  let offset = 0; let started = false; let ended = false;
  for (const node of nodes) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < offset + length) { range.setStart(node, start - offset); started = true; }
    if (started && end <= offset + length) { range.setEnd(node, end - offset); ended = true; break; }
    offset += length;
  }
  // An unusual layout may interleave reasoning with final Markdown. Never move
  // that reasoning just to hide a transport block; leaving the block visible is safer.
  if (!started || !ended || range.cloneContents().querySelector(REASONING)) return;
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
    const other = characterInterlocutor(entities, scene);
    const people = enabled ? [hero, other].filter((e): e is SceneEntity => !!e) : [];
    const existing = new Map([...section.querySelectorAll<HTMLButtonElement>(".dr-cast-portrait")].map(button => [button.dataset.characterId, button]));
    for (const [id, button] of existing) if (!people.some(entity => entity.id === id)) button.remove();
    if (!people.length) { if (section.classList.contains("dr-cast-layout")) section.classList.remove("dr-cast-layout"); continue; }
    let content = section.querySelector<HTMLElement>(".dr-cast-content");
    if (!content) { content = document.createElement("div"); content.className = "dr-cast-content"; content.append(...section.childNodes); section.append(content); }
    if (!section.classList.contains("dr-cast-layout")) section.classList.add("dr-cast-layout");
    if (!shadow.querySelector("[data-character-style]")) {
      const style = document.createElement("style"); style.dataset.characterStyle = "true";
      style.textContent = `section.dr-cast-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--dr-space-4);max-width:1000px}.dr-cast-content{grid-column:1/-1;grid-row:2;min-width:0}.dr-cast-portrait{grid-row:1;align-self:start;display:grid;justify-items:center;gap:var(--dr-space-1);width:clamp(144px,34cqi,220px);max-width:100%;min-height:44px;border:0;background:transparent;color:var(--dr-text);padding:0;text-align:center;cursor:pointer;font:inherit}.dr-cast-portrait.left{grid-column:1}.dr-cast-portrait.right{grid-column:2;justify-self:end}.dr-cast-portrait img{display:block;width:100%;height:auto;aspect-ratio:3/4;object-fit:contain;border-radius:var(--dr-radius);background:var(--dr-surface)}.dr-cast-portrait span{display:block;overflow-wrap:anywhere;font-size:14px;font-weight:650}.dr-cast-portrait small{font-size:12px;margin:0;color:var(--dr-muted)}.dr-cast-portrait:focus-visible{outline:2px solid var(--dr-primary);outline-offset:4px;border-radius:var(--dr-radius)}.dr-cast-portrait:hover img{box-shadow:0 0 0 1px var(--dr-primary)}@container(min-width:860px){section.dr-cast-layout{grid-template-columns:192px minmax(0,1fr) 192px;gap:var(--dr-space-6)}.dr-cast-content{grid-column:2;grid-row:1}.dr-cast-portrait.right{grid-column:3}.dr-cast-portrait{width:192px}.dr-cast-content .grid{grid-template-columns:1fr}}`;
      shadow.append(style);
    }
    if (!shadow.querySelector("[data-character-stats-style]")) {
      const statsStyle = document.createElement("style"); statsStyle.dataset.characterStatsStyle = "true";
      statsStyle.textContent = `.dr-cast-portrait .dr-cast-highlights{display:grid;gap:var(--dr-space-1);width:100%;min-width:0}.dr-cast-highlights[hidden]{display:none}.dr-cast-portrait .dr-cast-highlights>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;padding:var(--dr-space-1) var(--dr-space-2);border-radius:6px;box-sizing:border-box;background:var(--dr-surface);font-size:12px;line-height:1.4;font-weight:400}`;
      shadow.append(statsStyle);
    }
    for (const entity of people) {
      const state = scene?.states[entity.id];
      let button = existing.get(entity.id);
      if (!button) {
        button = document.createElement("button"); button.type = "button"; button.dataset.characterId = entity.id;
        const img = document.createElement("img"); img.alt = "";
        button.append(img, document.createElement("span"), document.createElement("small")); section.append(button);
      }
      const className = `dr-cast-portrait ${entity.id === hero?.id ? "left" : "right"}`;
      if (button.className !== className) button.className = className;
      const accessibleName = `${characterText(locale, "edit")}: ${entity.name}`;
      if (button.getAttribute("aria-label") !== accessibleName) button.setAttribute("aria-label", accessibleName);
      syncPortraitImage(button.querySelector("img")!, entity.characterSheet, state?.emotion);
      const name = button.querySelector("span")!; if (name.textContent !== entity.name) name.textContent = entity.name;
      const mood = button.querySelector("small")!; const label = state ? emotionLabel(locale, state.emotion) : "";
      if (mood.textContent !== label) mood.textContent = label;
      const stats = characterHighlights(state); const statsKey = JSON.stringify(stats);
      if (portraitStats.get(button) !== statsKey) {
        let highlights = button.querySelector<HTMLElement>(".dr-cast-highlights");
        if (!highlights) { highlights = document.createElement("span"); highlights.className = "dr-cast-highlights"; highlights.id = `dr-cast-stats-${++portraitStatsId}`; button.append(highlights); }
        highlights.replaceChildren(...stats.map(stat => { const item = document.createElement("span"); item.textContent = `${stat.label}: ${stat.value}`; item.title = item.textContent; return item; }));
        highlights.hidden = !stats.length;
        if (stats.length) button.setAttribute("aria-describedby", highlights.id); else button.removeAttribute("aria-describedby");
        portraitStats.set(button, statsKey);
      }
      button.onclick = () => onOpen(entity.id);
    }
  }
}
