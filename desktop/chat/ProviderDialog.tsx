import { useRef, useState, type ClipboardEvent } from "react";
import { KeyRound, X } from "lucide-react";
import { desktop } from "../runtime/browser";
import { useNativeDialog } from "./motion";

export interface ModelSettings { baseUrl: string; model: string; maxTokens: number; replyMode: "auto" | "manual"; replyStyle: string; hasKey: boolean; contextTokens?: number }
interface CatalogModel { id: string; contextTokens?: number }
const tokenCounts = { ru: new Intl.NumberFormat("ru-RU"), en: new Intl.NumberFormat("en-US") };
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
  const [replyMode, setReplyMode] = useState(value.replyMode);
  const [contextTokens, setContextTokens] = useState(value.contextTokens?.toString() ?? "");
  const [replyStyle, setReplyStyle] = useState(value.replyStyle);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"key" | "settings">();
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "empty" | "unavailable">("idle");
  const catalogRequest = useRef(0);
  const selectedModel = models.some(item => item.id === model) ? model : "";
  const address = useRef<HTMLInputElement>(null);
  const { modal, dismiss } = useNativeDialog(address);
  const close = () => { if (!busy) dismiss(onClose); };
  function resetModels() {
    catalogRequest.current++;
    setModels([]);
    setCatalogState("idle");
  }

  async function loadModels() {
    const request = ++catalogRequest.current;
    setCatalogState("loading");
    try {
      const catalog = await desktop.call<CatalogModel[]>("listTextModels", { baseUrl, key });
      if (catalogRequest.current !== request) return;
      setModels(catalog);
      setCatalogState(catalog.length ? "idle" : "empty");
    } catch {
      if (catalogRequest.current === request) setCatalogState("unavailable");
    }
  }

  function pasteKey(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const pasted = text.trim();
    if (!pasted || invalidKeyCharacters.test(pasted)) {
      setError("key");
      return;
    }
    resetModels();
    setKey(pasted);
    setError(undefined);
  }

  async function save(clearKey = false) {
    if (!clearKey && (error === "key" || invalidKeyCharacters.test(key.trim()))) {
      setError("key");
      return;
    }
    setBusy(true); setError(undefined);
    try {
      const saved = await desktop.call<ModelSettings>("saveProvider", { baseUrl, model, maxTokens, replyMode, replyStyle, contextTokens: contextTokens === "" ? null : Number(contextTokens), key, clearKey });
      dismiss(() => onSave(saved));
    }
    catch { setError("settings"); }
    finally { setBusy(false); }
  }
  return <dialog ref={modal} aria-labelledby="model-title" className="desktop-dialog" data-window-motion onCancel={event => { event.preventDefault(); close(); }}>
      <header><KeyRound size={18} /><h2 id="model-title">{ru ? "Текстовая модель" : "Text model"}</h2><button type="button" className="desktop-icon" disabled={busy} aria-label={ru ? "Закрыть" : "Close"} onClick={close}><X size={19} /></button></header>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>{ru ? "Адрес API" : "API base URL"}<input ref={address} required type="url" value={baseUrl} onChange={event => { resetModels(); setBaseUrl(event.target.value); }} /></label>
        <label>{ru ? "Ключ API" : "API key"}<input type="password" autoComplete="off" value={key}
          placeholder={value.hasKey ? ru ? "Ключ сохранён" : "Key saved" : ""}
          aria-invalid={error === "key" || undefined} aria-describedby={error === "key" ? "model-key-error" : undefined}
          onPaste={pasteKey} onChange={event => { resetModels(); setKey(event.target.value); setError(undefined); }} /></label>
        {error === "key" && <p id="model-key-error" role="alert">{ru ? "Вставьте один ключ API. Скопируйте одну строку с ключом." : "Paste one API key. Copy a single line containing the key."}</p>}
        <div className="desktop-model-picker">
          {models.length > 0 && <label>{ru ? "Модель" : "Model"}
            <select value={selectedModel} onChange={event => setModel(event.target.value)}>
              <option value="">{ru ? "Ввести ID вручную" : "Enter ID manually"}</option>
              {models.map(item => <option key={item.id} value={item.id}>
                {item.id} · {item.contextTokens === undefined
                  ? (ru ? "лимит неизвестен" : "limit unknown")
                  : tokenCounts[locale].format(item.contextTokens) + (ru ? " ток." : " tokens")}
              </option>)}
            </select>
          </label>}
          {!selectedModel && <label>{ru ? "ID модели" : "Model ID"}<input required value={model} onChange={event => setModel(event.target.value)} /></label>}
          {!models.length && <button type="button" disabled={busy || catalogState === "loading" || !baseUrl.trim() || error === "key"} onClick={() => void loadModels()}>
            {catalogState === "loading" ? ru ? "Загружаем модели…" : "Loading models…" : ru ? "Загрузить список моделей" : "Load model list"}
          </button>}
          {catalogState === "empty" && <small role="status">{ru ? "Провайдер не вернул ни одной модели. Можно ввести ID вручную." : "The provider returned no models. You can enter the ID manually."}</small>}
          {catalogState === "unavailable" && <small role="status">{ru ? "Список недоступен. Проверьте адрес и ключ API или введите ID вручную." : "The list is unavailable. Check the API address and key or enter the ID manually."}</small>}
        </div>
        <label>{ru ? "Лимит ответа" : "Reply limit"}<select value={replyMode} onChange={event => setReplyMode(event.target.value === "manual" ? "manual" : "auto")}>
          <option value="auto">{ru ? "Авто" : "Auto"}</option>
          <option value="manual">{ru ? "Вручную" : "Manual"}</option>
        </select></label>
        {replyMode === "auto" ? <small>{ru ? "DeepRole повышает лимит для выбранной модели, если ответ обрезан по длине." : "DeepRole raises the limit for the selected model when a reply hits its length limit."}</small>
          : <label>{ru ? "Лимит токенов на ответ" : "Reply token limit"}<input type="number" min="256" max="32768" required value={maxTokens} onChange={event => setMaxTokens(event.target.valueAsNumber)} /></label>}
        <label>{ru ? "Окно контекста вручную" : "Manual context window"}<input type="number" min="512" max="20000000" step="1" placeholder={ru ? "Автоматически" : "Automatic"} value={contextTokens} aria-describedby="model-context-hint" onChange={event => setContextTokens(event.target.value)} /></label>
        <small id="model-context-hint">{ru ? "Общий лимит в токенах на историю чата, память игры, инструкции и новый ответ." : "Shared token limit for chat history, game memory, instructions, and the new reply."}</small>
        <div className="desktop-reply-style">
          <label htmlFor="reply-style">{ru ? "Длина и подача" : "Reply length and style"}</label>
          <textarea id="reply-style" aria-describedby="reply-style-hint" rows={3} maxLength={2000} value={replyStyle}
            placeholder={ru ? "Реплики моноширинным шрифтом. Действия курсивом. Эмодзи по настроению сцены." : "Dialogue in monospace. Actions in italics. Use emoji when they fit the scene."}
            onChange={event => setReplyStyle(event.target.value)} />
          <small id="reply-style-hint">{ru ? "Чат показывает курсив, жирный, моноширинный текст и цитаты Markdown. Отдельные правила для реплик и действий применяются и к обычному тексту." : "Chat renders Markdown italics, bold, monospace, and quotes. Separate style rules for dialogue and actions also apply to plain text."}</small>
        </div>
        <p>{ru ? "Подключение использует OpenAI Chat Completions. Ключ зашифрован средствами Windows." : "The connection uses OpenAI Chat Completions. Windows encrypts the saved key."}</p>
        {error === "settings" && <p role="alert">{ru ? "Не удалось сохранить подключение. Проверьте адрес и параметры модели." : "Unable to save the connection. Check the endpoint and model settings."}</p>}
        <footer>{value.hasKey && <button type="button" disabled={busy} onClick={() => void save(true)}>{ru ? "Удалить ключ" : "Remove key"}</button>}<button className="desktop-primary" disabled={busy} type="submit">{ru ? "Сохранить подключение" : "Save connection"}</button></footer>
      </form>
  </dialog>;
}
