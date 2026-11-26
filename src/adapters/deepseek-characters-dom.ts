import { latestSceneChoiceTarget } from "./deepseek-choices-dom";
import { parseCharacterTurn, characterText, type CharacterCopyKey } from "../core/characters";
import type { Locale } from "../core/types";
import { readTransportSource, rememberTransportResult, syncTransportVisibility, transportResult } from "./deepseek-transport-visibility";

const REASONING = ".ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning']";

export function latestCharacterResponse(root: ParentNode = document, portraitActionsPaused = false) {
  const target = latestSceneChoiceTarget(root);
  if (!target) return null;
  if (target.row.matches("[data-deeprole-service-reply='true']")) return null;
  const clone = target.row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${REASONING}, [data-deeprole-characters-result], [data-deeprole-scene-photos]`).forEach(e => e.remove());
  const text = clone.textContent ?? "";
  if (text.includes("<deeprole_character_mode>")) return null;
  return { ...target, text, turn: parseCharacterTurn(text, portraitActionsPaused) };
}

/** Fold just the transport block, never hide or alter the story or reasoning. */
export function foldCharacterPayload(row: HTMLElement, locale: Locale, status: CharacterCopyKey): void {
  if (row.closest(REASONING)) return;
  const source = [...row.querySelectorAll<HTMLElement>(".ds-markdown")]
    .find(node => !node.closest(REASONING) && readTransportSource(node).text.includes("<deeprole_characters>")) ?? row;
  const { text, blocks, hidden } = syncTransportVisibility(source);
  const block = blocks.find(item => item.kind === "characters" && item.complete);
  const candidate = [...hidden].find(([, item]) => item.kind === "characters" || item.view);
  if (!block || !candidate) return;
  const [anchor] = candidate;
  const existing = transportResult(source);
  const label = characterText(locale, status);
  const payload = text.slice(block.start, block.end);
  if (existing?.isConnected && existing.previousElementSibling === anchor) {
    const summary = existing.querySelector("summary")!;
    const raw = existing.querySelector("pre")!;
    if (summary.textContent !== label) summary.textContent = label;
    if (raw.textContent !== payload) { raw.textContent = payload; existing.open = false; }
    return;
  }
  existing?.remove();
  const doc = row.ownerDocument;
  const details = doc.createElement("details"); details.dataset.deeproleCharactersResult = "true";
  const summary = doc.createElement("summary"); summary.dataset.deeproleCharactersSummary = "true"; summary.textContent = label;
  const raw = doc.createElement("pre"); raw.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px"; raw.textContent = payload;
  details.append(summary, raw);
  anchor.after(details);
  rememberTransportResult(source, details, payload);
}

export { syncPortraitStage as syncChoicePortraits } from "./portrait-stage";
