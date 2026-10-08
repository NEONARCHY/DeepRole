import { afterEach,expect,it,vi } from "vitest";
import { deleteOwnedChat } from "../src/adapters/cast-worker";
afterEach(()=>{document.body.innerHTML="";history.replaceState({},"","/");vi.restoreAllMocks();});
function setup() {
 history.replaceState({},"","/chat/s/owned");
 vi.spyOn(HTMLElement.prototype,"getClientRects").mockReturnValue([{width:1,height:1}] as any);
 document.body.innerHTML='<nav><div><a href="https://chat.deepseek.com/chat/s/owned">Owned</a><button aria-label="More">...</button></div><div><a href="https://chat.deepseek.com/chat/s/personal">Personal</a><button aria-label="More">...</button></div></nav>';
 return document.querySelector<HTMLButtonElement>("button")!;
}
it("deletes only the scoped chat through its newly opened menu and confirmation",async()=>{
 const more=setup(),personal=document.querySelector<HTMLAnchorElement>('a[href$="/personal"]')!;
 more.onclick=()=>{const menu=document.createElement("div");menu.setAttribute("role","menu");menu.innerHTML='<button role="menuitem">Delete</button>';document.body.append(menu);menu.querySelector<HTMLButtonElement>("button")!.onclick=()=>{menu.remove();const d=document.createElement("div");d.setAttribute("role","dialog");d.innerHTML='Delete chat?<button>Delete</button>';document.body.append(d);d.querySelector<HTMLButtonElement>("button")!.onclick=()=>{more.parentElement!.remove();d.remove();history.replaceState({},"","/");};};};
 expect(await deleteOwnedChat("owned",document,async()=>{})).toBe(true);expect(personal.isConnected).toBe(true);
});
it("ignores global deletion controls and an already open unrelated menu",async()=>{
 const more=setup(),globalDelete=vi.fn();const menu=document.createElement("div");menu.setAttribute("role","menu");menu.innerHTML='<button role="menuitem">Delete</button>';menu.querySelector<HTMLButtonElement>("button")!.onclick=globalDelete;document.body.append(menu);
 more.onclick=()=>{};expect(await deleteOwnedChat("owned",document,async()=>{})).toBe(false);expect(globalDelete).not.toHaveBeenCalled();expect(document.querySelector('a[href$="/personal"]')).not.toBeNull();
});
it("rejects a different current chat and never clicks another row",async()=>{const more=setup(),click=vi.fn();more.onclick=click;expect(await deleteOwnedChat("personal",document,async()=>{})).toBe(false);expect(click).not.toHaveBeenCalled();});
