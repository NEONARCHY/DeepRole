import { latestSceneChoiceTarget } from "./deepseek-choices-dom";
import { parseCharacterTurn, characterText, type CharacterCopyKey } from "../core/characters";
import type { Locale } from "../core/types";

const REASONING = ".ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning']";

export function latestCharacterResponse(root: ParentNode = document) {
  const target = latestSceneChoiceTarget(root);
  if (!target) return null;
  if (target.row.matches("[data-deeprole-service-reply='true']")) return null;
  const clone = target.row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${REASONING}, [data-deeprole-characters-summary], [data-deeprole-scene-photos]`).forEach(e => e.remove());
  const text = clone.textContent ?? "";
  if (text.includes("<deeprole_character_mode>")) return null;
  return { ...target, text, turn: parseCharacterTurn(text) };
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

export { syncPortraitStage as syncChoicePortraits } from "./portrait-stage";
