# Политика приватности DeepRole

Дата обновления: 1 октября 2026 года.

DeepRole хранит записи памяти, книги, миры, профили персонажей/мест, заготовки, настройки, связи и ручной выбор памяти в чатах, слепки сюжета, неподтверждённые предложения и журнал отмены изменений локально в хранилище расширения в профиле браузера пользователя.

DeepRole:

- не имеет собственного сервера;
- не собирает аналитику и телеметрию;
- не отправляет данные разработчику;
- не продаёт данные и не отправляет их сторонним сервисам, кроме описанной ниже передачи контекста в DeepSeek;
- запрашивает доступ только к `chat.deepseek.com` и локальному хранилищу браузера.

При отправке сообщения выбранная память текущего мира, его подтверждённое описание, описания подходящих профилей, описания связей между выбранными записями и явно применённое состояние истории добавляются к запросу в DeepSeek. Скрытие технического текста в интерфейсе не скрывает его от DeepSeek: сервис получает этот контекст и обрабатывает по своей политике приватности. Подсказки связей по упоминаниям названий вычисляются локально и не сохраняются без подтверждения.

Отдельно, только по явной команде пользователя, DeepRole отправляет служебную инструкцию через открытый чат DeepSeek, чтобы предложить записи, изменения существующей памяти или сжатый перенос сюжета. При анализе передаётся ограниченный набор существующих записей с ID; при создании лора — введённое описание. Анализ не запускается автоматически. Предложения сохраняются как память только после подтверждения пользователя. Служебный запрос и ответ видны в чате. После обработки технический блок данных заменяется коротким сообщением; исходная реплика остаётся в истории на стороне DeepSeek.

Импорт BDS обрабатывается локально. Исходный файл не изменяется; вместе с импортированными записями сохраняются исходные названия и значения важности. Экспорт мира, профиля или заготовки — обычный незашифрованный JSON; защищённый экспорт всей библиотеки доступен в настройках.

Обычное хранилище расширения не зашифровано. Пользователь может включить локальный сейф или создать защищённую паролем копию. Для них используется AES-256-GCM, а ключ создаётся из пароля через PBKDF2-SHA-256 со случайными salt и IV.

Ключ сейфа находится только в сессионном хранилище расширения, а не на странице DeepSeek. «Закрыть сейф» очищает ключ, локальный контекст и временные редакторы DeepRole во всех вкладках; незавершённые правки нужно сохранить заранее. Обычный черновик и история DeepSeek не изменяются. Блокировка не удаляет уже переданные DeepSeek сведения и не шифрует прежние скачанные JSON-файлы.

Описания мира и профилей отправляются только при включённом переключателе «Использовать описание в чате». Ранее сохранённые приватные заметки не включаются без явного согласия.

Удаление расширения или сброс профиля браузера может удалить локальные данные. Перед этим следует создать резервную копию.

---

# DeepRole Privacy Policy

Last updated: October 1, 2026.

DeepRole stores memories, worlds, character/location profiles, story starters, settings, books, chat bindings, and handoff snapshots locally in extension-owned browser storage. It has no server, analytics or telemetry. It does not sell data or send it to the developer.

Per-chat attachments/exclusions, pending proposals and recovery history are also stored locally. They are not separate active memory copies and are encrypted with the other records when the optional vault is enabled.

When you send a message, selected memory, approved world and relevant profile descriptions, selected relationships and explicitly applied story state are included in the DeepSeek request. Hiding technical text from the interface does not hide it from DeepSeek. Analysis sends a bounded set of existing records and IDs; lore drafting sends your brief. These requests run only on your command. Proposed additions and updates require approval. Technical service turns remain in DeepSeek's server-side history. DeepSeek processes requests under its own terms and privacy policy.

BDS imports are processed locally without changing the source file. Original titles and importance values are retained. World/profile/starter exports are unencrypted JSON; encrypted full-library backups are available in Settings.

Regular extension storage is not encrypted. The optional local vault and password-protected backups use AES-256-GCM with a PBKDF2-SHA-256 password-derived key and random salt and IV.

The vault key stays in extension session storage, never in the DeepSeek page. Lock vault clears that key, local context and temporary DeepRole editors across tabs; save unfinished edits first. DeepSeek's ordinary draft and history are unchanged. Locking does not remove previously transmitted DeepSeek data or encrypt previously downloaded JSON files.

World/profile descriptions are included only with Use description in chat enabled. Previously saved private notes are not sent until you explicitly enable that setting.

Uninstalling the extension or resetting the browser profile may remove local data. Create a backup first.
