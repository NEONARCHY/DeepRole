# Политика приватности DeepRole

Дата обновления: 6 октября 2026 года.

DeepRole хранит записи памяти, книги, миры, профили персонажей/мест, заготовки, настройки, связи и ручной выбор памяти в чатах, слепки сюжета, неподтверждённые предложения и журнал отмены изменений локально в хранилище расширения в профиле браузера пользователя.

DeepRole:

- не имеет собственного сервера;
- не собирает аналитику и телеметрию;
- не отправляет данные разработчику;
- не продаёт данные и не отправляет их сторонним сервисам, кроме описанной ниже передачи контекста в DeepSeek;
- запрашивает доступ только к `chat.deepseek.com` и локальному хранилищу браузера.

При отправке сообщения выбранная память текущего мира, его подтверждённое описание, описания подходящих профилей, описания связей между выбранными записями и явно применённое состояние истории добавляются к запросу в DeepSeek. Скрытие технического текста в интерфейсе не скрывает его от DeepSeek: сервис получает этот контекст и обрабатывает по своей политике приватности. Подсказки связей по упоминаниям названий вычисляются локально и не сохраняются без подтверждения.

Для приблизительного индикатора контекста DeepRole читает историю только открытого чата через внутренний маршрут `chat.deepseek.com`. Токен входа используется только в странице для этого запроса, не передаётся в хранилище расширения и не записывается в журналы. Текст истории не сохраняется DeepRole: из страницы в расширение передаются только число сообщений и оценка токенов. Если маршрут недоступен, используется неполная оценка по загруженным сообщениям.

Если включены «Выборы в сценах» и к чату подключён мир, DeepRole добавляет к исходящему сообщению инструкцию о четырёх вариантах. Сами кнопки не отправляют сообщения; выбранный текст попадает в DeepSeek только после ручной отправки пользователем.

При включённом «Восстановлении ответов» DeepRole сохраняет локальную копию последнего видимого фрагмента, заменённого точной заглушкой DeepSeek. Копия относится к своему чату, входит в полную резервную копию и шифруется сейфом. Последний подходящий восстановленный фрагмент автоматически добавляется к следующему обычному сообщению пользователя в этом чате как цитата ответа; для длинного текста передаются последние 64 000 символов без изменения полной копии. После успешного сетевого ответа отметка передачи сохраняется, чтобы не дублировать фрагмент при дальнейших отправках и перезагрузке. Служебные запросы его не расходуют. Выключение функции или закрытие сейфа прекращает передачу; исходная серверная реплика не переписывается. Это не отдельный запрос к модели.

Отдельно, только по явной команде пользователя, DeepRole отправляет служебную инструкцию через открытый чат DeepSeek, чтобы предложить записи, изменения существующей памяти или сжатый перенос сюжета. При анализе передаётся ограниченный набор существующих записей с ID; при создании лора — введённое описание. Анализ не запускается автоматически. Предложения сохраняются как память только после подтверждения пользователя. Служебный запрос и ответ видны в чате. После обработки технический блок данных заменяется коротким сообщением; исходная реплика остаётся в истории на стороне DeepSeek.

Импорт памяти [Better Deepseek (BDS)](https://github.com/EdgeTypE/better-deepseek) обрабатывается локально. Исходный файл не изменяется; вместе с импортированными записями сохраняются исходные названия и значения важности. Экспорт мира, профиля или заготовки — обычный незашифрованный JSON; защищённый экспорт всей библиотеки доступен в настройках.

Обычное хранилище расширения не зашифровано. Пользователь может включить локальный сейф или создать защищённую паролем копию. Для них используется AES-256-GCM, а ключ создаётся из пароля через PBKDF2-SHA-256 со случайными salt и IV.

Ключ сейфа находится только в сессионном хранилище расширения, а не на странице DeepSeek. «Закрыть сейф» очищает ключ, локальный контекст и временные редакторы DeepRole во всех вкладках; незавершённые правки нужно сохранить заранее. Обычный черновик и история DeepSeek не изменяются. Блокировка не удаляет уже переданные DeepSeek сведения и не шифрует прежние скачанные JSON-файлы.

Описания мира и профилей отправляются только при включённом переключателе «Использовать описание в чате». Ранее сохранённые приватные заметки не включаются без явного согласия.

Удаление расширения или сброс профиля браузера может удалить локальные данные. Перед этим следует создать резервную копию.

---

# DeepRole Privacy Policy

Last updated: October 6, 2026.

DeepRole stores memories, worlds, character/location profiles, story starters, settings, books, chat bindings, and handoff snapshots locally in extension-owned browser storage. It has no server, analytics or telemetry. It does not sell data or send it to the developer.

Per-chat attachments/exclusions, pending proposals and recovery history are also stored locally. They are not separate active memory copies and are encrypted with the other records when the optional vault is enabled.

When you send a message, selected memory, approved world and relevant profile descriptions, selected relationships and explicitly applied story state are included in the DeepSeek request. Hiding technical text from the interface does not hide it from DeepSeek. Analysis sends a bounded set of existing records and IDs; lore drafting sends your brief. These requests run only on your command. Proposed additions and updates require approval. Technical service turns remain in DeepSeek's server-side history. DeepSeek processes requests under its own terms and privacy policy.

For the approximate context indicator, DeepRole reads only the open chat's history through an internal `chat.deepseek.com` route. The sign-in token is used only within the page for this read request; it is not stored by the extension or logged. DeepRole does not store the history text. Only aggregate message and token estimates pass from the page to the extension. When the route is unavailable, the indicator uses a partial estimate from loaded messages.

With Scene choices enabled and a world connected, DeepRole includes an instruction to offer four options in outgoing requests. Choice buttons do not send messages; selected text reaches DeepSeek only when you send it yourself.

With Reply recovery enabled, DeepRole saves a local copy of the last visible fragment replaced by DeepSeek's exact refusal. Copies are chat-scoped, included in full backups and encrypted by the vault. The latest applicable recovery automatically accompanies your next ordinary message in the same chat as quoted assistant history; long text sends its final 64,000 characters without modifying the full local copy. A successful network response records delivery so subsequent sends and reloads do not repeat it. Service requests do not consume it. Disabling the feature or locking the vault stops transmission; the original server reply is not rewritten. No separate model request is made.

[Better Deepseek (BDS)](https://github.com/EdgeTypE/better-deepseek) imports are processed locally without changing the source file. Original titles and importance values are retained. World/profile/starter exports are unencrypted JSON; encrypted full-library backups are available in Settings.

Regular extension storage is not encrypted. The optional local vault and password-protected backups use AES-256-GCM with a PBKDF2-SHA-256 password-derived key and random salt and IV.

The vault key stays in extension session storage, never in the DeepSeek page. Lock vault clears that key, local context and temporary DeepRole editors across tabs; save unfinished edits first. DeepSeek's ordinary draft and history are unchanged. Locking does not remove previously transmitted DeepSeek data or encrypt previously downloaded JSON files.

World/profile descriptions are included only with Use description in chat enabled. Previously saved private notes are not sent until you explicitly enable that setting.

Uninstalling the extension or resetting the browser profile may remove local data. Create a backup first.
