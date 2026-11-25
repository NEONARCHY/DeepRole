import { useEffect, useRef, useState, type RefObject } from "react";

const recentFragments = 16;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function IncomingText({ text }: { text: string }) {
  const [display, setDisplay] = useState({ text: "", settled: "", fragments: [] as string[] });
  if (text !== display.text) {
    if (text.startsWith(display.text)) {
      const fragments = [...display.fragments];
      const previous = fragments.at(-1);
      let next = text.slice(display.text.length);
      if (previous) {
        const joined = segmenter.segment(previous + next).containing(previous.length - 1);
        if (joined && joined.index + joined.segment.length > previous.length) {
          fragments.pop();
          if (joined.index) fragments.push(previous.slice(0, joined.index));
          next = previous.slice(joined.index) + next;
        }
      }
      fragments.push(next);
      const settled = display.settled + fragments.slice(0, -recentFragments).join("");
      setDisplay({ text, settled, fragments: fragments.slice(-recentFragments) });
    } else {
      setDisplay({ text, settled: text, fragments: [] });
    }
  }
  let offset = display.settled.length;
  return <>{display.settled}{display.fragments.map(fragment => {
    const start = offset;
    offset += fragment.length;
    return <span key={start} className="desktop-text-reveal">{fragment}</span>;
  })}</>;
}

type EditorSnapshot = {
  text: string;
  end: number;
  width: number;
  height: number;
  scrollTop: number;
  scrollLeft: number;
};
type Particle = { x: number; y: number; dx: number; dy: number; size: number; at: number };

function snapshot(editor: HTMLTextAreaElement): EditorSnapshot {
  return {
    text: editor.value, end: editor.selectionEnd, width: editor.clientWidth, height: editor.clientHeight,
    scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft,
  };
}

/** Mirrors the whole line so a caret inside a wrapped word keeps its native position. */
function measureText(mirror: HTMLElement, view: EditorSnapshot) {
  mirror.style.width = `${view.width}px`;
  const node = document.createTextNode(view.text + "\u200b");
  mirror.replaceChildren(node);
  const range = document.createRange();
  const origin = mirror.getBoundingClientRect();
  return (start: number, end = start) => {
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    return { x: rect.left - origin.left - view.scrollLeft, y: rect.top - origin.top - view.scrollTop, height: rect.height };
  };
}

const dissolveTime = 260;

function erasedPixels(context: CanvasRenderingContext2D, mirror: HTMLElement, editor: HTMLTextAreaElement, from: EditorSnapshot, start: number) {
  const rectAt = measureText(mirror, from);
  let low = start, high = from.end;
  // A selection can extend well above a scrolled editor. Only sample its visible glyphs.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const rect = rectAt(middle, middle + 1);
    if (rect.y + rect.height < 0) low = middle + 1;
    else high = middle;
  }
  const style = getComputedStyle(editor);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.fillStyle = style.color;
  const descent = context.measureText("M").fontBoundingBoxDescent;
  context.clearRect(0, 0, from.width, from.height);
  for (const { index, segment } of segmenter.segment(from.text.slice(low, from.end))) {
    const rect = rectAt(low + index, low + index + segment.length);
    if (rect.y >= from.height) break;
    if (segment.trim()) context.fillText(segment, rect.x, rect.y + rect.height - descent);
  }
  const rgba = context.getImageData(0, 0, from.width, from.height).data;
  context.clearRect(0, 0, from.width, from.height);
  const at = performance.now();
  const particles: Particle[] = [];
  for (let y = 0; y < from.height; y += 2) {
    for (let x = 0; x < from.width; x += 2) {
      if (rgba[(y * from.width + x) * 4 + 3]! < 90) continue;
      const noise = Math.random();
      const delay = ((from.width - x) / from.width) * 65;
      particles.push({ x, y, dx: 5 + noise * 19, dy: -5 + noise * 9, size: .55 + noise, at: at + delay });
    }
  }
  return particles;
}

function bindComposerEffects(editor: HTMLTextAreaElement, mirror: HTMLElement, caret: HTMLElement, canvas: HTMLCanvasElement) {
  const motion = matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)");
  const enabled = () => !motion.matches && !document.hidden && document.documentElement.dataset.motion !== "off";
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let deletion: EditorSnapshot | undefined;
  let composing = false;
  let positionFrame = 0;
  let paintFrame = 0;
  let particles: Particle[] = [];
  const concealCaret = () => { caret.hidden = true; delete editor.dataset.glowingCaret; };
  function positionCaret() {
    positionFrame = 0;
    if (!enabled() || composing || document.activeElement !== editor || editor.selectionStart !== editor.selectionEnd) {
      concealCaret();
      return;
    }
    const view = snapshot(editor);
    const rect = measureText(mirror, view)(view.end);
    if (!rect.height || rect.x < 0 || rect.x >= view.width || rect.y < 0 || rect.y + rect.height > view.height + 1) {
      concealCaret();
      return;
    }
    caret.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    caret.style.height = `${rect.height}px`;
    caret.hidden = false;
    editor.dataset.glowingCaret = "";
  }
  const scheduleCaret = () => {
    if (!positionFrame) positionFrame = requestAnimationFrame(positionCaret);
  };
  function paint(now: number) {
    paintFrame = 0;
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles = enabled() ? particles.filter(particle => now < particle.at + dissolveTime) : [];
    canvas.toggleAttribute("data-active", particles.length > 0);
    for (const particle of particles) {
      const progress = Math.max(0, (now - particle.at) / dissolveTime);
      const drift = 1 - (1 - progress) ** 2;
      context.globalAlpha = (1 - progress) ** 1.5;
      context.fillRect(particle.x + particle.dx * drift, particle.y + particle.dy * drift, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    if (particles.length) paintFrame = requestAnimationFrame(paint);
  }
  function beforeInput(event: InputEvent) {
    deletion = enabled() && !composing && !event.isComposing
      && /^delete(?:Content|Word|SoftLine|HardLine)Backward$/u.test(event.inputType) ? snapshot(editor) : undefined;
  }
  function input(event: Event) {
    const from = deletion;
    deletion = undefined;
    scheduleCaret();
    if (!context || !from || !enabled() || !(event instanceof InputEvent) || !event.inputType.endsWith("Backward")) return;
    const removed = from.text.length - editor.value.length;
    if (removed <= 0 || removed > from.end || !from.width || !from.height) return;
    if (canvas.width !== from.width || canvas.height !== from.height) {
      canvas.width = from.width;
      canvas.height = from.height;
      canvas.style.width = `${from.width}px`;
      canvas.style.height = `${from.height}px`;
      particles = [];
    }
    particles = particles.concat(erasedPixels(context, mirror, editor, from, from.end - removed)).slice(-2400);
    if (!paintFrame && particles.length) paint(performance.now());
  }
  const abort = new AbortController();
  const options = { signal: abort.signal };
  editor.addEventListener("beforeinput", beforeInput, options);
  editor.addEventListener("input", input, options);
  editor.addEventListener("focus", scheduleCaret, options);
  editor.addEventListener("blur", concealCaret, options);
  editor.addEventListener("scroll", scheduleCaret, options);
  editor.addEventListener("compositionstart", () => { composing = true; concealCaret(); }, options);
  editor.addEventListener("compositionend", () => { composing = false; scheduleCaret(); }, options);
  document.addEventListener("selectionchange", scheduleCaret, options);
  document.addEventListener("visibilitychange", scheduleCaret, options);
  document.fonts.addEventListener("loadingdone", scheduleCaret, options);
  motion.addEventListener("change", scheduleCaret, options);
  const resize = new ResizeObserver(scheduleCaret);
  resize.observe(editor);
  const setting = new MutationObserver(scheduleCaret);
  setting.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    abort.abort();
    resize.disconnect();
    setting.disconnect();
    cancelAnimationFrame(positionFrame);
    cancelAnimationFrame(paintFrame);
    concealCaret();
  };
}

export function useComposerEffects(editorRef: RefObject<HTMLTextAreaElement | null>, enabled: boolean) {
  const mirror = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (enabled && editorRef.current && mirror.current && caret.current && canvas.current) {
      return bindComposerEffects(editorRef.current, mirror.current, caret.current, canvas.current);
    }
  }, [editorRef, enabled]);
  return enabled ? <>
    <div ref={mirror} className="desktop-editor-mirror" data-deeprole-ui aria-hidden="true" />
    <canvas ref={canvas} className="desktop-editor-dissolve" aria-hidden="true" />
    <span ref={caret} className="desktop-editor-caret" aria-hidden="true" hidden />
  </> : null;
}
