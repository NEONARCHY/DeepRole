import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Modal } from "../src/entrypoints/shared/Modal";
import { usePortraitUploadChoice } from "../src/entrypoints/shared/PortraitUploadChoice";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("traps modal focus in a shadow root and Escape closes the actual dialog", () => {
  vi.spyOn(HTMLElement.prototype,"getClientRects").mockReturnValue({length:1} as DOMRectList);
  const host=document.createElement("div");document.body.append(host);const shadow=host.attachShadow({mode:"open"});
  const opener=document.createElement("button"),container=document.createElement("div");shadow.append(opener,container);opener.focus();
  const close=vi.fn(),view=render(<Modal plainClose title="Upload" closeLabel="Close upload" onClose={close}><button type="button">One</button><button type="button">Two</button></Modal>,{container});
  const buttons=[...container.querySelectorAll("button")];
  expect(shadow.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!,{key:"Tab",shiftKey:true});expect(shadow.activeElement).toBe(buttons.at(-1));
  fireEvent.keyDown(buttons.at(-1)!,{key:"Tab"});expect(shadow.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!,{key:"Escape"});expect(close).toHaveBeenCalledOnce();
  view.unmount();expect(shadow.activeElement).toBe(opener);host.remove();
});
it("asks again on each upload and resolves cancellation without a processing choice",async()=>{
  const choices=vi.fn();function Harness(){const upload=usePortraitUploadChoice("en");return <div>{upload.dialog}<button onClick={()=>void upload.choose([new File(["x"],"image.png",{type:"image/png"})]).then(choices)}>Upload</button></div>;}
  render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Upload"}));
  fireEvent.click(await screen.findByRole("button",{name:/^Keep originals/}));await waitFor(()=>expect(choices).toHaveBeenLastCalledWith("original"));
  fireEvent.click(screen.getByRole("button",{name:"Upload"}));
  const modal=await screen.findByRole("dialog",{name:"Compress images?"});fireEvent.keyDown(modal,{key:"Escape"});
  await waitFor(()=>expect(choices).toHaveBeenLastCalledWith(undefined));expect(choices).toHaveBeenCalledTimes(2);
});
