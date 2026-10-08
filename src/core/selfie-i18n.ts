import type { Locale } from "./types";
const strings = {
  neutral: ["Нейтральный", "Neutral"], suggestive: ["Пикантный", "Suggestive"], referenceContext: ["Когда использовать этот образ · необязательно", "When to use this look · optional"],
  twoReferences: ["Два образа одного персонажа. DeepSeek выбирает по сцене; без подходящего фото используется нейтральное или описание внешности.", "Two looks of the same character. DeepSeek selects by the scene; without a matching photo it uses the neutral look or text appearance."],
  reference: ["Постоянный референс", "Permanent reference"],
  referenceHint: ["Закрепите лицо персонажа один раз. Для следующих фото оно автоматически попадёт в модель для референсов, например Qwen Image Edit.", "Pin the character’s face once. Future photos automatically use it with your reference model, such as Qwen Image Edit."],
  noReference: ["Без референса — внешность из анкеты, описание кадра из текущей сцены.", "Without a reference: appearance from the profile, framing from the current scene."],
  private: ["DeepSeek получает только текст. Референс отправляется вашему сервису изображений при генерации.", "DeepSeek receives text only. The reference goes to your image service during generation."],
  pick: ["Выбрать из библиотеки", "Choose from library"], upload: ["Загрузить референс", "Upload reference"],
  unpin: ["Открепить референс", "Unpin reference"], pinned: ["Закреплено", "Pinned"], more: ["Показать ещё", "Show more"],
  missing: ["Изображение референса удалено. Выберите другое — автоматическая замена внешности не выполняется.", "The reference image was removed. Choose another; appearance is never silently replaced."],
  uploadError: ["Не удалось загрузить. Выберите PNG, JPG или WebP до 10 МБ; проверьте место в библиотеке.", "Upload failed. Choose PNG, JPG or WebP up to 10 MB; check library space."],
  ask: ["Попросить селфи", "Ask for a selfie"], asking: ["Отправляем просьбу…", "Sending request…"],
  requestHint: ["Просьба отправится в чат. Персонаж может отказать; фото появится после его согласия. Генерация оплачивается по тарифу подключённого сервиса.", "The request goes to the chat. The character may refuse; the photo appears after agreement. Your connected service’s charges apply."],
  draftBusy: ["В поле сообщения уже есть черновик. Отправьте или уберите его, затем попросите селфи.", "The message field contains a draft. Send or clear it before asking for a selfie."],
  busy: ["Дождитесь окончания ответа DeepSeek.", "Wait for DeepSeek to finish replying."], failed: ["Не удалось отправить просьбу. Попробуйте ещё раз.", "Could not send the request. Try again."],
  ready: ["Можно попросить — решение за персонажем", "You can ask; the character decides"], story: ["Согласие зависит от вашей истории", "Willingness depends on your story"],
  trustNeeded: ["Пока не хватает доверия", "More trust is needed"], affinityNeeded: ["Пока не хватает близости", "More closeness is needed"],
  how: ["Как сблизиться", "How to grow closer"], howHint: ["Отношения меняются после сыгранных поступков и диалогов. Учитывайте характер, выполняйте обещания и уважайте границы. Простая просьба о фото не даёт баллы.", "Relationships change after played actions and dialogue. Respect personality and boundaries, and keep promises. Asking for a photo alone earns no points."],
  status: ["Отношения сейчас", "Current relationship"], exact: ["Точные показатели и пороги", "Exact scores and thresholds"], access: ["Когда можно отправлять", "When sending is allowed"],
  storyPreset: ["По решению персонажа", "Character’s discretion"], comfortablePreset: ["Когда комфортно общаться", "When comfortable together"], closePreset: ["В близких отношениях", "In a close relationship"], custom: ["Свои условия", "Custom conditions"],
  trust: ["Доверие", "Trust"], affinity: ["Близость", "Closeness"],
  collections: ["Готовые подборки селфи", "Uploaded selfie collections"], collectionsHint: ["Необязательно. Подборки используются вместо генерации, когда подходят к сцене. Для ситуации без подходящей подборки выбирается обычная.", "Optional. Collections replace generation when they fit the scene. The default collection covers unmatched situations."],
  needed: ["нужно", "needed"], lastChange: ["Последнее изменение отношений", "Last relationship change"], generated: ["Селфи из генератора", "Generated selfies"],
  referenceFor: ["Референс для", "Reference for"], consent: ["Любой уровень оставляет персонажу право отказать.", "At every level the character can refuse."],
} as const;
export type SelfieCopyKey = keyof typeof strings;
export const selfieText = (locale: Locale, key: SelfieCopyKey) => strings[key][locale === "ru" ? 0 : 1];
