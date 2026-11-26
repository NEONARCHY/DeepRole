import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IS_DESKTOP } from "../../core/chat-host";
import { afterWindowMotion } from "../shared/window-motion";

/** Native top layer: viewport-centred even when the widget deck has moved.
 * Keep children mounted while closed so hiding a form preserves its draft. */
export function PageMemoryDialog({open,title,closeLabel,onClose,help,children,footer,assistantOpen=false,dialogId}:{open:boolean;title:string;closeLabel:string;onClose:()=>void;help?:ReactNode;children:ReactNode;footer?:ReactNode;assistantOpen?:boolean;dialogId:string}) {
  const dialog=useRef<HTMLDialogElement>(null), heading=useRef<HTMLHeadingElement>(null), outsideDown=useRef(false), id=useId();
  useLayoutEffect(()=>{
    const node=dialog.current;
    if(!node||!open)return;
    let active=node.ownerDocument.activeElement;
    while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;
    const previous=active instanceof HTMLElement?active:null;
    node.inert=false;node.showModal();heading.current?.focus({preventScroll:true});
    return ()=>{node.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open]);
  const close=()=>{
    const node=dialog.current;
    if(!node?.open||node.querySelector('.dr-assistant[aria-busy="true"]'))return;
    if(!IS_DESKTOP){onClose();return;}
    node.close();node.inert=true;
    afterWindowMotion(node,onClose);
  };
  return <dialog ref={dialog} id={dialogId} className="dr-memory-dialog" data-window-motion={IS_DESKTOP || undefined} aria-labelledby={id} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{if(event.key==="Escape")event.stopPropagation();}}
    onPointerDown={event=>{
      const r=event.currentTarget.getBoundingClientRect();
      outsideDown.current=event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);
    }} onPointerUp={event=>{
      const r=event.currentTarget.getBoundingClientRect(),outside=event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;
      if(outsideDown.current&&outside&&event.target===event.currentTarget&&!assistantOpen)close();
      outsideDown.current=false;
    }}>
    <header><h2 id={id} ref={heading} tabIndex={-1}>{title}</h2><div className="dr-memory-help-actions">{help}<button type="button" className="dr-memory-dialog-close" aria-label={closeLabel} onClick={close}><X size={18} aria-hidden="true"/></button></div></header>
    <div className={`dr-memory-dialog-body ${assistantOpen?"":"dr-connected-memory"}`}>{children}</div>
    {footer && <footer className="dr-memory-dialog-footer">{footer}</footer>}
  </dialog>;
}
