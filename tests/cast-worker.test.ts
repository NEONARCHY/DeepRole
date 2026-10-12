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
it("does not open any delete controls when background authorization is denied", async () => {
 const more = setup(), click = vi.fn(); more.onclick = click;
 expect(await deleteOwnedChat("owned", document, async () => {}, async () => false)).toBe(false); expect(click).not.toHaveBeenCalled();
});
it("rechecks the current chat after asynchronous cleanup authorization", async () => {
 const more = setup(), click = vi.fn(); more.onclick = click;
 expect(await deleteOwnedChat("owned", document, async () => {}, async () => { history.replaceState({}, "", "/chat/s/personal"); return true; })).toBe(false); expect(click).not.toHaveBeenCalled();
});
it("never confirms deletion after permission is revoked during the native menu flow", async () => {
 const more = setup(), confirm = vi.fn(); let authorizations = 0;
 more.onclick = () => { const menu = document.createElement("div"); menu.setAttribute("role", "menu"); menu.innerHTML = '<button role="menuitem">Delete</button>'; document.body.append(menu); menu.querySelector<HTMLButtonElement>("button")!.onclick = () => { const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.innerHTML = 'Delete chat?<button>Delete</button>'; dialog.querySelector<HTMLButtonElement>("button")!.onclick = confirm; document.body.append(dialog); }; };
 expect(await deleteOwnedChat("owned", document, async () => {}, async () => ++authorizations < 3)).toBe(false); expect(authorizations).toBe(3); expect(confirm).not.toHaveBeenCalled();
});
it("recognizes the observed native div menu option without touching other chats", async () => {
 const more = setup(), personal = document.querySelector<HTMLAnchorElement>('a[href$="/personal"]')!;
 more.onclick = () => {
  const menu = document.createElement("div"); menu.className = "ds-dropdown-menu"; menu.setAttribute("role", "menu");
  menu.innerHTML = '<div class="ds-dropdown-menu-option ds-dropdown-menu-option--error"><div class="ds-dropdown-menu-option__label">Удалить</div></div>';
  document.body.append(menu);
  menu.querySelector<HTMLElement>(".ds-dropdown-menu-option")!.onclick = () => {
   menu.remove(); const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.innerHTML = 'Удалить чат?<div role="button">Удалить</div>'; document.body.append(dialog);
   dialog.querySelector<HTMLElement>('[role="button"]')!.onclick = () => { more.parentElement!.remove(); dialog.remove(); history.replaceState({}, "", "/"); };
  };
 };
 expect(await deleteOwnedChat("owned", document, async () => {})).toBe(true);
 expect(personal.isConnected).toBe(true);
});
