import { useRef, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import type { DeepRoleMessage } from "../../core/messages";
import { currentChatUrl } from "../../core/old-chat-notice";
import type { Locale } from "../../core/types";

export function GameChatLink({ chatId, locale, children }: { chatId: string; locale: Locale; children: ReactNode }) {
  const busy = useRef(false);
  const [error, setError] = useState(false);
  return <div className="dr-game-chat-link">
    <a className="button primary" href={currentChatUrl(chatId)} target="_blank" rel="noopener noreferrer" onClick={async event => {
      if (!event.isTrusted) { event.preventDefault(); return; }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (busy.current) return;
      busy.current = true;
      setError(false);
      try {
        const result = await browser.runtime.sendMessage({ type: "DR_OPEN_GAME_CHAT", chatId } satisfies DeepRoleMessage);
        setError(!result?.ok);
      } catch { setError(true); }
      finally { busy.current = false; }
    }}>{children}</a>
    {error && <p role="alert">{locale === "ru" ? "Не удалось открыть чат. Попробуй ещё раз." : "Could not open the chat. Try again."}</p>}
  </div>;
}
