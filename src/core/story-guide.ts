import type { Locale } from "./types";

const guides = {
  ru: {
    title: "Как обновить и перенести историю", close: "Закрыть памятку", current: "",
    intro: "Лор хранит факты о мире. «Продолжить в новом чате» сохраняет доступную историю и точный прогресс одним нажатием. Обновление лора и подготовка пересказа — дополнительные шаги для особенно длинной истории, а не обязательное условие.",
    sections: [
      { title: "История уже идёт, а мира ещё нет?", lines: [
        "Готовый JSON не нужен. В «Лор → Создать свой мир» создайте пустой мир и дайте ему название. Затем подключите его к текущему чату через «Игра → Мир».",
        "Нажмите «Обновить лор», проверьте предложения DeepSeek и сохраните нужные. Так вы соберёте память из уже сыгранной истории, без ручного заполнения всех фактов.",
        "«Обновить лор» не создаёт мир автоматически. Без выбранного мира записи сохраняются в области «Без мира», а не в отдельном мире."
      ] },
      { title: "1. Откройте чат с последними событиями", lines: [
        "В DeepRole → Игра → Мир выберите уже загруженный мир. Открыть его в библиотеке недостаточно: он должен быть подключён к этому чату.",
        "Если JSON уже импортирован, повторно загружать его не нужно. Дождитесь конца ответа DeepSeek. Если в поле сообщения есть черновик, сохраните его отдельно и очистите поле."
      ] },
      { title: "2. Добавьте новые события в память", lines: [
        "Нажмите «Обновить лор». DeepSeek предложит новые факты и изменения существующих записей.",
        "Откройте «Проверить изменения», сравните текст, отметьте нужное и нажмите «Сохранить выбранное». До подтверждения лор не меняется."
      ] },
      { title: "«Запомнить» или «Обновить лор»?", lines: [
        "«Запомнить» — сохранить конкретный факт, который вы написали или выделили. DeepSeek не анализирует всю историю по этой кнопке.",
        "«Обновить лор» — попросить DeepSeek найти важные факты и изменения в разговоре. Они сохранятся только после вашего подтверждения.",
        "Это память о фактах, не копия всей переписки. Проверьте важные детали: модель может что-то пропустить. Текущую сцену и прогресс переносит кнопка «Продолжить в новом чате»."
      ] },
      { title: "3. Продолжите в новом чате", lines: [
        "В этом же чате нажмите «Продолжить в новом чате» на индикаторе контекста или в Игра → Продолжение истории. DeepRole локально сохранит состояние, откроет пустой чат и один раз отправит продолжение — без обязательного ответа DeepSeek в старом чате.",
        "Мир, портреты, ручной выбор памяти, точные отношения, характеристики и их журналы сохраняются. Новый чат получает прежний пересказ и доступную переписку до последнего события. Исходный чат не удаляется.",
        "Частичная история помечается в сохранениях: так бывает, если она очень длинная, сервер не отдаёт её полностью или доступны только сообщения со страницы. Для общего обзора есть «Подготовить пересказ с DeepSeek». Числа при этом берутся из базы, а не из пересказа."
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
        "Чтобы скачать собранный мир, нажмите «Экспорт → Этот мир». Для переноса всех миров, настроек и состояний чатов выберите «Полная резервная копия». Сам чат DeepSeek не переносит библиотеку DeepRole на другой компьютер."
      ] }
    ]
  },
  en: {
    title: "How to update and continue your story", close: "Close guide", current: "",
    intro: "Lore stores world facts. “Continue in a new chat” saves available history and exact progress in one click. Updating lore and preparing a recap are optional steps for especially long stories, not required for a transfer.",
    sections: [
      { title: "Already playing, but no world yet?", lines: [
        "You do not need a ready-made JSON file. In “Lore → Create your world”, create an empty world and give it a name. Then connect it to the current chat through “Play → World”.",
        "Click “Update lore”, review DeepSeek’s suggestions and save the ones you want. This builds memory from the story you have already played, without entering every fact by hand.",
        "“Update lore” does not create a world automatically. With no world selected, records are saved under “No world”, not in a separate world."
      ] },
      { title: "1. Open the chat with the latest events", lines: [
        "In DeepRole → Play → World, choose the world you already imported. Viewing it in the library is not enough: connect it to this chat.",
        "If you already imported the JSON, do not import it again. Wait for DeepSeek to finish. If the message box contains a draft, save it elsewhere and clear the box."
      ] },
      { title: "2. Add new events to memory", lines: [
        "Click “Update lore”. DeepSeek will suggest new facts and changes to existing records.",
        "Open “Review changes”, compare the text, select what you want and click “Save selected changes”. Lore stays unchanged until you confirm."
      ] },
      { title: "“Remember” or “Update lore”?", lines: [
        "“Remember” saves a specific fact you wrote or selected. It does not ask DeepSeek to analyze the whole story.",
        "“Update lore” asks DeepSeek to find important facts and changes in the conversation. They are saved only after you approve them.",
        "This is factual memory, not a copy of the full conversation. Check important details: the model may miss something. “Continue in a new chat” carries the current scene and progress."
      ] },
      { title: "3. Continue in a new chat", lines: [
        "In the same chat, click “Continue in a new chat” on the context meter or under Play → Continue your story. DeepRole saves a local checkpoint, opens an empty chat and sends the continuation once — no answer from DeepSeek in the old chat is required.",
        "The world, portraits, memory selections, exact relationships, attributes and their histories are preserved. The new chat receives the earlier recap and available conversation through the latest event. Your original chat is not deleted.",
        "Partial history is labelled in saved states: the conversation may be too long, the server may return only part of it, or only page messages may be available. “Prepare a recap with DeepSeek” provides a compact overview. Scores come from the local database, never from the recap."
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
        "To download the world you built, choose “Export → This world”. To transfer all worlds, settings and chat states, choose “Full backup”. A DeepSeek chat alone does not transfer your DeepRole library to another computer."
      ] }
    ]
  }
} as const;

export function storyGuide(locale: Locale) { return guides[locale]; }
