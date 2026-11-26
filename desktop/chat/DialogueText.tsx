import { createElement, Fragment, memo, type ReactNode } from "react";
import { parse, postprocess, preprocess } from "micromark";
import { IncomingText } from "./message-effects";

type FormatTag = "em" | "strong" | "code" | "blockquote";
type ReplyFormatting = { dialogue?: FormatTag; narration?: FormatTag };
type Token = ReturnType<typeof postprocess>[number][1];

const tags: Readonly<Record<string, FormatTag | undefined>> = {
  blockQuote: "blockquote",
  emphasis: "em",
  strong: "strong",
  codeText: "code",
  codeFenced: "code",
};
const markers = new Set(["blockQuotePrefix", "emphasisSequence", "strongSequence", "codeTextSequence", "codeTextPadding", "codeFencedFence", "escapeMarker"]);
const transport = /<deeprole_[^>]*>[\s\S]*?<\/deeprole_[^>]*>|<deeprole_[^>]*>[\s\S]*$/gu;
const styleSubject = /^\s*(?:(?:оформляй|пиши|выделяй|форматируй|render|format)\s+)?(?:(?:все|all)\s+)?(реплики|диалоги|прямая речь|dialogue|speech|действия|описания|повествование|actions|narration)(?![\p{L}\p{N}])/iu;
const styleValue = /^\s*(?:[:—-]\s*)?(?:(?:оформляй|пиши|выделяй|форматируй|render|use|in|as|with)\s+)*(моношир\p{L}*|monospace(?:d)?|курсив\p{L}*|italics?|жирн\p{L}*|bold|цитат\p{L}*|blockquotes?)(?![\p{L}\p{N}])/iu;

export function replyFormatting(style: string): ReplyFormatting | undefined {
  const formatting: ReplyFormatting = {};
  for (const clause of style.split(/[,.!?;\r\n]+/u)) {
    const match = styleSubject.exec(clause);
    const value = match && styleValue.exec(clause.slice(match[0].length))?.[1];
    if (!match || !value) continue;
    const subject = match[1]!;
    const role = /^(?:действия|описания|повествование|actions|narration)$/iu.test(subject) ? "narration" : "dialogue";
    if (/^(?:моношир|monospace)/iu.test(value)) formatting[role] = "code";
    else if (/^(?:курсив|italic)/iu.test(value)) formatting[role] = "em";
    else if (/^(?:жирн|bold)/iu.test(value)) formatting[role] = "strong";
    else formatting[role] = "blockquote";
  }
  if (formatting.dialogue || formatting.narration) return formatting;
}

function inlineMarkup(text: string, animate: boolean, story: boolean, formatting?: ReplyFormatting): ReactNode {
  const plain = (value: string, start: number) => animate ? <IncomingText key={start} text={value} /> : value;
  if (!story && !formatting && !/[*_\x60~\\>]/u.test(text)) return plain(text, 0);

  const children: ReactNode[] = [];
  const frames: { children: ReactNode[]; token?: Token; tag?: FormatTag; fallback?: boolean; hasMarkup?: boolean }[] = [{ children }];
  let offset = 0;
  const flush = (end: number) => {
    if (end <= offset) return;
    const value = text.slice(offset, end);
    // Paragraph spacing is visual. Keep the original separators for scene memory.
    frames.at(-1)!.children.push(story && frames.length === 1 && !value.trim()
      ? <span hidden key={offset}>{value}</span>
      : plain(value, offset));
    offset = end;
  };
  for (const [event, token] of postprocess(parse().document().write(preprocess()(text, undefined, true)))) {
    if (event === "enter") {
      let tag = tags[token.type];
      const fallback = token.type === "paragraph" && frames.length === 1;
      if (fallback && formatting) {
        const paragraph = text.slice(token.start.offset, token.end.offset);
        tag = /^\s*(?:[—–]\s*\S|[«“"]\S)/u.test(paragraph) ? formatting.dialogue : formatting.narration;
      }
      if (tag || (story && fallback)) {
        flush(token.start.offset);
        frames.push({ children: [], token, tag, fallback });
      } else if (markers.has(token.type)) {
        flush(token.start.offset);
        // The chat adapters still read the exact text for quotes and scene memory.
        frames.at(-1)!.children.push(<span hidden key={offset}>{text.slice(offset, token.end.offset)}</span>);
        offset = token.end.offset;
      }
    } else if (frames.at(-1)?.token === token) {
      flush(token.end.offset);
      const frame = frames.pop()!;
      const parent = frames.at(-1)!;
      const key = token.start.offset;
      if (!frame.fallback) parent.hasMarkup = true;
      const format = frame.fallback && frame.hasMarkup ? undefined : frame.tag;
      const content = format
        ? createElement(format, { className: token.type === "codeFenced" ? "desktop-dialogue-block" : undefined }, frame.children)
        : frame.children;
      parent.children.push(story && frame.fallback && format !== "blockquote"
        ? <p key={key}>{content}</p>
        : <Fragment key={key}>{content}</Fragment>);
    }
  }
  flush(text.length);
  return children;
}

export const DialogueText = memo(function DialogueText({ text, animate = false, story = false, formatting }: {
  text: string; animate?: boolean; story?: boolean; formatting?: ReplyFormatting;
}) {
  if (!story || !text.includes("<deeprole_")) return <Fragment key={0}>{inlineMarkup(text, animate, story, formatting)}</Fragment>;

  const parts: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(transport)) {
    const at = match.index;
    if (at > start) parts.push(<Fragment key={start}>{inlineMarkup(text.slice(start, at), animate, story, formatting)}</Fragment>);
    parts.push(<span key={at} hidden>{match[0]}</span>);
    start = at + match[0].length;
  }
  if (start < text.length) parts.push(<Fragment key={start}>{inlineMarkup(text.slice(start), animate, story, formatting)}</Fragment>);
  return parts;
});
