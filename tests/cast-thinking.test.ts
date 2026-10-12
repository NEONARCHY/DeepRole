import { afterEach, expect, it, vi } from "vitest";
import { enableCastThinking, restoreCastThinking } from "../src/adapters/cast-thinking";
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
function fixture(label = "DeepThink (R1)", state: string | null = "false") {
 document.body.innerHTML = '<aside><button aria-pressed="false">DeepThink (R1)</button></aside><form><textarea></textarea><button type="button"></button></form>';
 const button = document.querySelector<HTMLButtonElement>('form button')!; button.textContent = label;
 if (state !== null) button.setAttribute('aria-pressed',state);
 const click = vi.fn(() => button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')); button.onclick=click;
 return {button,click,composer:document.querySelector('textarea')!};
}
it("enables only the composer toggle and restores the known original state", async () => {
 const f=fixture(); const r=await enableCastThinking(f.composer);expect(r.status).toBe('enabled');expect(r.changed).toBe(true);expect(f.click).toHaveBeenCalledTimes(1);
 expect(document.querySelector('aside button')!.getAttribute('aria-pressed')).toBe('false');r.restore();expect(f.button.getAttribute('aria-pressed')).toBe('false');
});
it("does not turn off already enabled reasoning",async()=>{const f=fixture('Глубокое мышление','true');const r=await enableCastThinking(f.composer);expect(r.status).toBe('enabled');expect(r.changed).toBe(false);r.restore();expect(f.click).not.toHaveBeenCalled();});
it("never guesses an unlabelled native state or toggles unavailable/disabled controls",async()=>{
 const f=fixture('DeepThink',null);expect((await enableCastThinking(f.composer)).status).toBe('unverified');expect(f.click).not.toHaveBeenCalled();
 f.button.setAttribute('aria-pressed','false');f.button.disabled=true;expect((await enableCastThinking(f.composer)).status).toBe('unverified');expect(f.click).not.toHaveBeenCalled();
 f.button.remove();expect((await enableCastThinking(f.composer)).status).toBe('unavailable');
});
it("can restore a persisted worker toggle after reload without clicking an unrelated button",()=>{const f=fixture('DeepThink','true');restoreCastThinking(f.composer);expect(f.click).toHaveBeenCalledTimes(1);expect(document.querySelector('aside button')!.getAttribute('aria-pressed')).toBe('false');});
it("does not repeatedly toggle an ambiguous composer",async()=>{const f=fixture();f.button.parentElement!.append(f.button.cloneNode(true));expect((await enableCastThinking(f.composer)).status).toBe('unverified');expect(f.click).not.toHaveBeenCalled();});
