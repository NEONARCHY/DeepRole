import { useEffect, useState, type ClipboardEvent } from "react";
import { KeyRound, X } from "lucide-react";
import { desktop } from "../runtime/browser";

export interface ModelSettings { baseUrl: string; model: string; maxTokens: number; replyStyle: string; hasKey: boolean; contextTokens?: number }
const invalidKeyCharacters = /[\s\p{Cf}]/u;
export function ProviderDialog({ locale, value, onClose, onSave }: {
  locale: "ru" | "en";
  value: ModelSettings;
  onClose: () => void;
  onSave: (settings: ModelSettings) => void;
}) {
  const ru = locale === "ru";
  const [baseUrl, setBaseUrl] = useState(value.baseUrl);
  const [model, setModel] = useState(value.model);
  const [maxTokens, setMaxTokens] = useState(value.maxTokens);
  const [contextTokens, setContextTokens] = useState(value.contextTokens?.toString() ?? "");
  const [replyStyle, setReplyStyle] = useState(value.replyStyle);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"key" | "settings">();
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  function pasteKey(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const pasted = text.trim();
    if (!pasted || invalidKeyCharacters.test(pasted)) {
      setError("key");
      return;
    }
    setKey(pasted);
    setError(undefined);
  }

  async function save(clearKey = false) {
    if (!clearKey && (error === "key" || invalidKeyCharacters.test(key.trim()))) {
      setError("key");
      return;
    }
    setBusy(true); setError(undefined);
    try { onSave(await desktop.call<ModelSettings>("saveProvider", { baseUrl, model, maxTokens, replyStyle, contextTokens: contextTokens === "" ? null : Number(contextTokens), key, clearKey })); }
    catch { setError("settings"); }
    finally { setBusy(false); }
  }
  return <div className="desktop-backdrop">
    <section role="dialog" aria-modal="true" aria-labelledby="model-title" className="desktop-dialog">
      <header><KeyRound size={18} /><h2 id="model-title">{ru ? "Текстовая модель" : "Text model"}</h2><button type="button" className="desktop-icon" aria-label={ru ? "Закрыть" : "Close"} onClick={onClose}><X size={19} /></button></header>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>{ru ? "Адрес API" : "API base URL"}<input required type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} /></label>
        <label>{ru ? "ID модели" : "Model ID"}<input required value={model} onChange={event => setModel(event.target.value)} /></label>
        <label>{ru ? "Ключ API" : "API key"}<input type="password" autoComplete="off" value={key}
          placeholder={value.hasKey ? ru ? "Ключ сохранён" : "Key saved" : ""}
          aria-invalid={error === "key" || undefined} aria-describedby={error === "key" ? "model-key-error" : undefined}
          onPaste={pasteKey} onChange={event => { setKey(event.target.value); setError(undefined); }} /></label>
        {error === "key" && <p id="model-key-error" role="alert">{ru ? "Вставьте один ключ API. Скопируйте одну строку с ключом." : "Paste one API key. Copy a single line containing the key."}</p>}
        <label>{ru ? "Лимит токенов на ответ" : "Reply token limit"}<input type="number" min="256" max="32768" required value={maxTokens} onChange={event => setMaxTokens(event.target.valueAsNumber)} /></label>
        <label>{ru ? "Окно контекста вручную" : "Manual context window"}<input type="number" min="512" max="20000000" step="1" placeholder={ru ? "Автоматически" : "Automatic"} value={contextTokens} onChange={event => setContextTokens(event.target.value)} /></label>
        <div className="desktop-reply-style">
          <label htmlFor="reply-style">{ru ? "Длина и подача" : "Reply length and style"}</label>
          <textarea id="reply-style" aria-describedby="reply-style-hint" rows={3} maxLength={2000} value={replyStyle}
            placeholder={ru ? "Например, реплики моноширинным шрифтом, действия курсивом. Эмодзи по настроению сцены." : "For example, use monospace for speech, italics for actions, and emoji when they fit the scene."}
            onChange={event => setReplyStyle(event.target.value)} />
          <small id="reply-style-hint">{ru ? "Можно попросить модель писать курсивом, жирным или моноширинным шрифтом. Если поле пустое, длина и темп подстраиваются под сцену." : "You can ask for italics, bold, or monospace. Leave blank to adapt the length and pace to the scene."}</small>
        </div>
        <p>{ru ? "Подключение использует OpenAI Chat Completions. Ключ зашифрован средствами Windows." : "The connection uses OpenAI Chat Completions. Windows encrypts the saved key."}</p>
        {error === "settings" && <p role="alert">{ru ? "Не удалось сохранить подключение. Проверьте адрес и параметры модели." : "Unable to save the connection. Check the endpoint and model settings."}</p>}
        <footer>{value.hasKey && <button type="button" disabled={busy} onClick={() => void save(true)}>{ru ? "Удалить ключ" : "Remove key"}</button>}<button className="desktop-primary" disabled={busy} type="submit">{ru ? "Сохранить подключение" : "Save connection"}</button></footer>
      </form>
    </section>
  </div>;
}
