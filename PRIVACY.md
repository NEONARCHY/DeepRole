# Политика приватности DeepRole

Дата обновления: 8 октября 2026 года.

DeepRole хранит записи памяти, книги, миры, профили персонажей/мест, заготовки, настройки, связи и ручной выбор памяти в чатах, слепки сюжета, неподтверждённые предложения и журнал отмены изменений локально в хранилище расширения в профиле браузера пользователя.

DeepRole:

- не имеет собственного сервера;
- не собирает аналитику и телеметрию;
- не отправляет данные разработчику;
- не продаёт данные; передаёт выбранный контекст в DeepSeek и, только при отдельном включении генерации и нажатии пользователя, описание/референсы своему провайдеру изображений;
- постоянно работает с `chat.deepseek.com` и локальным хранилищем; дополнительные адреса API и загрузки результата разрешаются отдельно по нажатию.

При отправке сообщения выбранная память текущего мира, его подтверждённое описание, описания подходящих профилей, описания связей между выбранными записями и явно применённое состояние истории добавляются к запросу в DeepSeek. Скрытие технического текста в интерфейсе не скрывает его от DeepSeek: сервис получает этот контекст и обрабатывает по своей политике приватности. Подсказки связей по упоминаниям названий вычисляются локально и не сохраняются без подтверждения.

Для приблизительного индикатора контекста DeepRole читает историю только открытого чата через внутренний маршрут `chat.deepseek.com`. Токен входа используется только в странице для этого запроса, не передаётся в хранилище расширения и не записывается в журналы. Текст истории не сохраняется DeepRole: из страницы в расширение передаются только число сообщений и оценка токенов. Если маршрут недоступен, используется неполная оценка по загруженным сообщениям.

Если включены «Выборы в сценах» и к чату подключён мир, DeepRole добавляет к исходящему сообщению инструкцию о четырёх вариантах. Сами кнопки не отправляют сообщения; выбранный текст попадает в DeepSeek только после ручной отправки пользователем.

При включённом «Восстановлении ответов» DeepRole сохраняет локальную копию последнего видимого фрагмента, заменённого точной заглушкой DeepSeek. Копия относится к своему чату, входит в полную резервную копию и шифруется сейфом. Последний подходящий восстановленный фрагмент автоматически добавляется к следующему обычному сообщению пользователя в этом чате как цитата ответа; для длинного текста передаются последние 64 000 символов без изменения полной копии. После успешного сетевого ответа отметка передачи сохраняется, чтобы не дублировать фрагмент при дальнейших отправках и перезагрузке. Служебные запросы его не расходуют. Выключение функции или закрытие сейфа прекращает передачу; исходная серверная реплика не переписывается. Это не отдельный запрос к модели.

Отдельно, только по явной команде пользователя, DeepRole отправляет служебную инструкцию через открытый чат DeepSeek, чтобы предложить записи, изменения существующей памяти или сжатый перенос сюжета. При анализе передаётся ограниченный набор существующих записей с ID; при создании лора — введённое описание. Анализ не запускается автоматически. Предложения сохраняются как память только после подтверждения пользователя. Служебный запрос и ответ видны в чате. После обработки технический блок данных заменяется коротким сообщением; исходная реплика остаётся в истории на стороне DeepSeek.

Импорт памяти [Better Deepseek (BDS)](https://github.com/EdgeTypE/better-deepseek) обрабатывается локально. Исходный файл не изменяется; вместе с импортированными записями сохраняются исходные названия и значения важности. Экспорт мира, профиля или заготовки — обычный незашифрованный JSON; защищённый экспорт всей библиотеки доступен в настройках.

Обычное хранилище расширения не зашифровано. Пользователь может включить локальный сейф или создать защищённую паролем копию. Для них используется AES-256-GCM, а ключ создаётся из пароля через PBKDF2-SHA-256 со случайными salt и IV.

Ключ сейфа находится только в сессионном хранилище расширения, а не на странице DeepSeek. «Закрыть сейф» очищает ключ, локальный контекст и временные редакторы DeepRole во всех вкладках; незавершённые правки нужно сохранить заранее. Обычный черновик и история DeepSeek не изменяются. Блокировка не удаляет уже переданные DeepSeek сведения и не шифрует прежние скачанные JSON-файлы.

Описания мира и профилей отправляются только при включённом переключателе «Использовать описание в чате». Ранее сохранённые приватные заметки не включаются без явного согласия.

Генерация изображений по умолчанию выключена. Включение само по себе не запускает запрос: по нажатию провайдер получает выбранную модель, окончательное описание, дополнительные параметры и выбранные референсы. Запрос выполняется фоновой частью расширения с ключом пользователя. Весь чат и база мира туда не передаются. Откровенный набор включается только с отдельным подтверждением возраста и не меняет состав того, что уходит провайдеру. Если отдельно попросить DeepSeek описать сцену, служебный запрос включает текст сцены, внешность и обычный подключённый контекст; изображения и ключ API в него не входят. Провайдер обрабатывает данные по своим условиям, может взимать плату и применять собственные фильтры контента. Автоматических повторов нет.

Ключи API и подключения хранятся отдельно в `storage.local`, не шифруются сейфом и не входят в экспорт мира или полную копию. На странице DeepSeek ключи недоступны нашему контент-скрипту; в интерфейсе показываются лишь последние четыре символа. Готовые иллюстрации, их описания и три диагностических заголовка сохраняются в библиотеке, защищаются сейфом и входят в экспорт. Для отдельного разрешения домена готового файла временная ссылка с привязкой хранится в сессии до 15 минут; при включённом сейфе эта запись зашифрована, после блокировки она недоступна. Загрузка готового файла не передаёт ключ API на его домен. [Подробнее об изображениях](docs/IMAGE-GENERATION.ru.md).

Удаление расширения или сброс профиля браузера может удалить локальные данные. Перед этим следует создать резервную копию.

---

# DeepRole Privacy Policy

Last updated: October 8, 2026.

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

Image generation is off by default and starts only on your click. Your chosen provider receives the model, final description, extra parameters and selected references, not the entire chat or world database. Only the extension background sends API requests with your key. The explicit preset requires a separate age confirmation and does not change what the provider receives. A separate request asking DeepSeek to describe the scene includes scene text, appearance and the usual connected context, but no image bytes or API key. Your provider's terms, privacy policy, content filters and charges apply. There are no automatic retries. Additional API and finished-image hosts require separate optional access; static host permissions were not broadened.

API keys and connection settings live separately in `storage.local`, are not encrypted by the vault and are excluded from world exports and full backups. Our DeepSeek content script cannot read the keys; the UI shows only the last four characters. Finished illustrations, descriptions and three diagnostic response headers are library records, covered by the vault and exports. A finished-file link and its association can remain in session storage for up to 15 minutes to grant download permission; this ticket is encrypted when the vault is enabled and unavailable while locked. Downloading the file never sends the API key to its host. [Image-generation details](docs/IMAGE-GENERATION.en.md).

Uninstalling the extension or resetting the browser profile may remove local data. Create a backup first.
