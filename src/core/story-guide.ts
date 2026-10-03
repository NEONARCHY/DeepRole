import type { Locale } from "./types";

const guides = {
  ru: {
    title: "Как обновить и перенести историю", close: "Закрыть памятку", current: "",
    intro: "Лор хранит факты о мире. Состояние истории — пересказ для продолжения. Чтобы перенести актуальный сюжет, сначала обновите лор, затем сделайте пересказ.",
    sections: [
      { title: "1. Откройте чат с последними событиями", lines: [
        "В DeepRole → Игра → Мир выберите уже загруженный мир. Открыть его в библиотеке недостаточно: он должен быть подключён к этому чату.",
        "Если JSON уже импортирован, повторно загружать его не нужно. Дождитесь конца ответа DeepSeek. Если в поле сообщения есть черновик, сохраните его отдельно и очистите поле."
      ] },
      { title: "2. Добавьте новые события в память", lines: [
        "Нажмите «Обновить лор». DeepSeek предложит новые факты и изменения существующих записей.",
        "Откройте «Проверить изменения», сравните текст, отметьте нужное и нажмите «Сохранить выбранное». До подтверждения лор не меняется."
      ] },
      { title: "3. Продолжите в новом чате", lines: [
        "В этом же чате откройте Игра → Продолжение истории → «Продолжить в новом чате». DeepSeek подготовит пересказ; DeepRole сохранит его, затем попробует открыть новый чат и отправить начало продолжения.",
        "Пересказ сохраняет важные события, отношения, текущую сцену и незавершённые линии, но не копирует каждую реплику. Полная переписка остаётся в старом чате. Проверьте, что важные для вас детали не потерялись."
      ] },
      { title: "Если хотите продолжить позже или в другом чате", lines: [
        "«Сохранить состояние истории» создаёт только пересказ: чат не переключается.",
        "Откройте нужный чат, подключите тот же мир, затем в «Продолжении истории» нажмите «Применить» у нужного сохранённого состояния. Оно добавится к следующему отправленному сообщению один раз; сама кнопка сообщение не отправляет.",
        "Если автоматический переход не сработал, сохранённое состояние доступно здесь же. Если DeepRole подготовил черновик продолжения, отправьте его сами. Пока DeepSeek отвечает, новый запуск недоступен."
      ] },
      { title: "Почему старый ответ может относиться к «другому миру»", lines: [
        "Это проверка привязки обновления карточек, а не оценка сюжета. Старая копия мира или другой чат могут иметь другую привязку, даже если история та же. Предупреждение само по себе не означает, что чат сломан.",
        "Подключите нужный мир и запустите «Обновить лор» заново. Старое служебное обновление не применяется к новой копии наугад. Новое состояние персонажей может появиться после следующего обычного ответа."
      ] },
      { title: "Что происходит с JSON-файлом", lines: [
        "Сохранённые изменения обновляют память внутри DeepRole. Исходный JSON на диске не перезаписывается.",
        "Для обновлённой копии сделайте новый экспорт. На другом компьютере нужен перенос данных расширения: чат DeepSeek сам по себе не переносит библиотеку DeepRole."
      ] }
    ]
  },
  en: {
    title: "How to update and continue your story", close: "Close guide", current: "",
    intro: "Lore stores world facts. A saved story state is a recap for continuing. To move your latest story, update the lore first, then create a recap.",
    sections: [
      { title: "1. Open the chat with the latest events", lines: [
        "In DeepRole → Play → World, choose the world you already imported. Viewing it in the library is not enough: connect it to this chat.",
        "If you already imported the JSON, do not import it again. Wait for DeepSeek to finish. If the message box contains a draft, save it elsewhere and clear the box."
      ] },
      { title: "2. Add new events to memory", lines: [
        "Click “Update lore”. DeepSeek will suggest new facts and changes to existing records.",
        "Open “Review changes”, compare the text, select what you want and click “Save selected changes”. Lore stays unchanged until you confirm."
      ] },
      { title: "3. Continue in a new chat", lines: [
        "In the same chat, open Play → Continue your story → “Continue in a new chat”. DeepSeek will prepare a recap; DeepRole saves it, then tries to open a new chat and send the first continuation message.",
        "The recap preserves key events, relationships, the current scene and loose ends, not every message. The full conversation stays in the old chat. Check that the details important to you were kept."
      ] },
      { title: "To continue later or in a different chat", lines: [
        "“Save story state” only creates a recap. It does not switch chats.",
        "Open the destination chat and connect the same world. In “Continue your story”, click “Apply” on the saved state you want. It is added once to your next sent message; clicking Apply does not send a message.",
        "If the automatic move fails, the saved state is still available here. If DeepRole prepared a continuation draft, send it yourself. You cannot start another request while DeepSeek is answering."
      ] },
      { title: "Why an old reply may belong to a “different world”", lines: [
        "This checks the link for updating character cards, not the plot. Another world copy or chat can have a different link even when the story is the same. The warning alone does not mean the chat is broken.",
        "Connect the right world and run “Update lore” again. An old service update is not applied blindly to a new copy. Fresh character state may appear after the next ordinary reply."
      ] },
      { title: "What happens to the JSON file", lines: [
        "Saving changes updates memory inside DeepRole. It does not overwrite the original JSON file on disk.",
        "Export again to get an updated copy. On another computer, you need to transfer the extension data: a DeepSeek chat alone does not transfer your DeepRole library."
      ] }
    ]
  }
} as const;

export function storyGuide(locale: Locale) { return guides[locale]; }
