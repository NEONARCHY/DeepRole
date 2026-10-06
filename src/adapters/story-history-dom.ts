import { isUserMessage, nativeMessageRows, REASONING } from "./deepseek-message-dom";
import { boundStory } from "../core/story-continuation";
import type { StoryContinuation } from "../core/types";

export function visibleStoryHistory(root: ParentNode = document): StoryContinuation {
  const turns = nativeMessageRows(root).filter(row => !row.matches("[data-deeprole-service-reply], [data-deeprole-memory-request]")).map(row => {
    const clone = row.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`${REASONING}, button, [data-deeprole-characters-result], [data-deeprole-choices-host], [data-deeprole-choices-loading], [data-deeprole-memory-card], [data-deeprole-service-preloader]`).forEach(node => node.remove());
    return { role: isUserMessage(row) ? "user" as const : "assistant" as const, text: clone.textContent ?? "" };
  });
  return boundStory(turns, "page", true);
}
