import { createElement, Fragment, memo, type ReactNode } from "react";
import { parse, postprocess, preprocess } from "micromark";
import { IncomingText } from "./message-effects";

const tags: Readonly<Record<string, "em" | "strong" | "code" | undefined>> = {
  emphasis: "em",
  strong: "strong",
  codeText: "code",
  codeFenced: "code",
};
const markers = new Set(["emphasisSequence", "strongSequence", "codeTextSequence", "codeTextPadding", "codeFencedFence", "escapeMarker"]);
const transport = /<deeprole_[^>]*>[\s\S]*?<\/deeprole_[^>]*>|<deeprole_[^>]*>[\s\S]*$/gu;

function inlineMarkup(text: string, animate: boolean): ReactNode {
  const plain = (value: string, start: number) => animate ? <IncomingText key={start} text={value} /> : value;
  if (!/[*_\x60~\\]/u.test(text)) return plain(text, 0);

  const children: ReactNode[] = [];
  const frames = [{ children, start: 0 }];
  let offset = 0;
  const flush = (end: number) => {
    if (end <= offset) return;
    frames.at(-1)!.children.push(plain(text.slice(offset, end), offset));
    offset = end;
  };
  for (const [event, token] of postprocess(parse().document().write(preprocess()(text, undefined, true)))) {
    const tag = tags[token.type];
    if (tag) {
      if (event === "enter") {
        flush(token.start.offset);
        frames.push({ children: [], start: token.start.offset });
      } else {
        flush(token.end.offset);
        const frame = frames.pop()!;
        frames.at(-1)!.children.push(createElement(tag, {
          key: frame.start,
          className: token.type === "codeFenced" ? "desktop-dialogue-block" : undefined,
        }, frame.children));
      }
    } else if (event === "enter" && markers.has(token.type)) {
      flush(token.start.offset);
      // The chat adapters still read the exact text for quotes and scene memory.
      frames.at(-1)!.children.push(<span hidden key={offset}>{text.slice(offset, token.end.offset)}</span>);
      offset = token.end.offset;
    }
  }
  flush(text.length);
  return children;
}

export const DialogueText = memo(function DialogueText({ text, animate = false, protectTransport = false }: {
  text: string; animate?: boolean; protectTransport?: boolean;
}) {
  if (!protectTransport) return inlineMarkup(text, animate);
  if (!text.includes("<deeprole_")) return <Fragment key={0}>{inlineMarkup(text, animate)}</Fragment>;

  const parts: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(transport)) {
    const at = match.index;
    if (at > start) parts.push(<Fragment key={start}>{inlineMarkup(text.slice(start, at), animate)}</Fragment>);
    parts.push(<span key={at} hidden>{match[0]}</span>);
    start = at + match[0].length;
  }
  if (start < text.length) parts.push(<Fragment key={start}>{inlineMarkup(text.slice(start), animate)}</Fragment>);
  return parts;
});
