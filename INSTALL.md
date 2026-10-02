# Установка DeepRole

## Chrome и другие Chromium-браузеры

1. Распакуйте архив `deeprole-0.1.0-chrome.zip` в отдельную папку.
2. Откройте страницу `chrome://extensions`.
3. Включите «Режим разработчика».
4. Нажмите «Загрузить распакованное расширение».
5. Выберите распакованную папку DeepRole.
6. Откройте `chat.deepseek.com` и нажмите значок DeepRole — справа появится боковая панель.

## Firefox

1. Распакуйте архив `deeprole-0.1.0-firefox.zip`.
2. Откройте `about:debugging#/runtime/this-firefox`.
3. Нажмите «Загрузить временное дополнение».
4. Выберите файл `manifest.json` внутри распакованной папки.

Временное дополнение Firefox нужно загружать заново после перезапуска браузера. После публикации в магазине это ограничение исчезнет.

## Первый запуск

1. Откройте меню DeepRole на сайте → «Лор». Выберите «Загрузить готовый лор» для JSON-памяти BDS/экспорта мира DeepRole или «Создать свой мир» для своих правил.
2. При импорте оставьте «Использовать в открытом чате» включённым. Для уже сохранённого мира нажмите «Использовать в этом чате». Над картой появится «Подключён к этому чату».
3. «Карта мира» и «Список записей» показывают одну память. Добавление и правки не требуют создавать копии. Профили и заготовки доступны в «Мир и профили».
4. В «Игре» видно, сколько записей выбрано для следующего сообщения. На странице через «Сцена» можно выбрать участников и место; обязательных окон перед отправкой нет.
5. Пишите как обычно. Мир и фокус сохраняются для чата; в новом пустом чате привязка создаётся после первой отправки.
6. Нажмите «Контекст», чтобы увидеть именно выбранную память, убрать лишнее или прикрепить запись вручную. «Вручную» само по себе ничего не отправляет.

Если DeepSeek не знает ваш лор: сначала проверьте статус подключения мира. Затем напишите реплику и откройте «Контекст» — нужная запись должна быть в подборе. Отсутствующую можно прикрепить вручную. Наличие записи в библиотеке ещё не означает, что она включена в запрос.

Меню обновляется при смене вкладки. Если переключить чат во время загрузки заготовки или выбора мира, устаревшая команда не применяется к новому чату — повторите действие там. Если DeepSeek не принял анализ, попробуйте ещё раз. Если во время подготовки переноса вы начали писать сообщение, оно остаётся на месте; слепок можно применить позже через «Игра → Продолжение истории».
Не обязательно заранее готовить JSON или разбираться в полном редакторе. «Контекст» → «Запомнить»: введите своё правило или факт и сохраните. «Автоподбор» ищет совпадения слов, имён и сцены; «Всегда» добавляется каждый раз, «Вручную» — после вашего выбора. В этом же окошке можно попросить DeepSeek предложить лор по вашему описанию; сначала нужно освободить поле сообщения.

Во время игры нажмите «Обновить лор», когда хотите разобрать сыгранное. DeepSeek подготовит предложения, но они ещё не изменят память. Откройте «Проверить изменения», сравните «было → станет», поправьте текст и сохраните выбранное. Можно продолжать играть, пока предложения ждут. «Отменить последние изменения» возвращает сохранённый пакет, если его записи ещё не редактировали.

Чтобы перенести BDS: «Лор» → «Загрузить готовый лор» → «Выбрать JSON». Выберите исходный файл памяти BDS или подготовленный `.deeprole-world.json`: формат определится автоматически. Проверьте название, выберите, подключать ли мир к открытому чату, и нажмите «Подтвердить импорт». Ваш существующий лор не заменяется. Полные резервные копии восстанавливаются отдельно в настройках.

Нажмите «Открыть карту мира»: карта сразу займёт всё окно сайта, мир появится в центре симметричного круга разделов, все ветви и записи уже раскрыты. Один клик открывает окошко рядом с узлом, двойной — сворачивает или раскрывает ветвь; с клавиатуры используйте Alt+Enter. Камера и соседние узлы остаются на месте. При повторном открытии ветви снова раскрыты, сохранённые позиции узлов остаются. Двигайте карту зажатым колёсиком или прокруткой. Shift+колесо — по горизонтали, Ctrl+колесо — масштаб. ЛКМ на фоне выделяет карточки рамкой; Ctrl/Shift добавляют к выбору. Перенос одной выбранной карточки двигает всю группу, без сдвига соседей и невыбранных потомков. Ctrl+A на карте выбирает все видимые карточки. Размещение сохраняется; случайное наложение не меняет раздел записи. В окошке можно читать, менять и явно сохранять текст. «Обзор» раскрывает ветви и возвращает камеру к миру; поиск — к выбранному результату. «Дополнительно → Вернуть расположение» восстановит симметрию без удаления памяти. Кнопка вверху сворачивает карту в окно и разворачивает обратно. Esc сначала закрывает окошко, следующий Esc или верхний X — карту; при несохранённом тексте нужно подтвердить отказ от черновика. Полноэкранное разворачивание работает из меню на самой странице DeepSeek, не из узкой браузерной боковой панели.

Вместо «?» рядом с каждым узлом и инструментом наведите курсор на саму кнопку на секунду. С клавиатуры подсказка появится при фокусе; Esc сначала закрывает открытую подсказку, затем карту. Автосохранение включено: Ctrl+Z / Ctrl+Shift+Z или стрелки отмены/повтора вверху меняют последнюю правку карты, включая режимы памяти. В поле ввода эти сочетания работают с набранным текстом. «Сбросить» требует подтверждения и возвращает расположение, ветви, категории, связи и изменённые на карте режимы к состоянию при открытии; сброс тоже отменяется. Тексты, профили и прикрепления к чату остаются. История не сохраняется после закрытия карты; при конфликте со свежими изменениями из другого окна откат не перезаписывает их.

Нажмите ветвь: рядом появятся её записи и режимы «Всегда / Автоподбор / Вручную». Названия и размещение ветвей не влияют на подбор. Массовая смена режима находится внутри ветви и требует подтверждения; поиск не ограничивает её область, выключенные записи остаются выключенными. Режим записи общий для чатов её мира; прикрепление к текущему чату — отдельное действие. DeepSeek получает выбранную память при следующей отправке, не всю карту автоматически. В заголовке карты видно, подключён ли мир; при открытом чате его можно подключить здесь же.

Кроме BDS и мира DeepRole импортируются JSON-списки записей и словари с названием и текстом. Исходные строки сохраняются. Перед импортом проверьте ключи, режимы и выключенные записи. Неподдерживаемые дополнительные параметры потребуют отдельного согласия; неоднозначный или повреждённый файл не импортируется частично. Полное описание полей — в README.

Для связи перетяните круглый значок справа от узла на любую плашку или нажмите «Связать запись» и найдите вторую через поиск. Если это раздел, выберите по одной конкретной записи с каждой стороны. Пустому разделу сначала нужна запись. Укажите, что их связывает, прочитайте объяснение результата и подтвердите. До подтверждения ничего не сохраняется; массовые связи автоматически не создаются. Та же операция доступна в обычном редакторе. Тематическая ветвь только организует память; подтверждённая связь объясняет DeepSeek отношение, когда обе записи выбраны в контекст. Возможные персонажи и связи — подсказки, не готовые факты: их нужно проверить. Неоднозначные записи находятся в «Разобрать»; раздел можно исправить вручную. Профили и заготовки находятся в «Мир и профили», обычное редактирование — в «Списке записей».

## Два мира и профили на карте

«Редактируемый мир» переключает только библиотеку в этом окне, не мир DeepSeek. «Создать пустой мир» создаёт название и пустые разделы, без готового лора. «Два мира рядом» открывает второй независимый редактор: его камера, выбор и Ctrl+Z не затрагивают первый. На узком экране редакторы расположены друг под другом; их можно прокрутить. Между мирами записи не копируются автоматически.

Подключён только один мир: статус виден над каждой картой, а «Подключить к чату» явно переключает источник памяти. В его разделе «Сцена» выбирайте персонажей, место, группу и книгу; можно включить несколько участников. Просмотр второго мира, создание пустого и ручное перемещение карточек ничего не отправляют и не меняют текущую сцену. Перед сменой редактируемого мира или закрытием нужен ответ, если остался несохранённый текст.

Ориентир для одной записи: 30–100 слов в «Всегда», 80–250 в «Автоподбор»/called. Это рекомендация, не технический лимит. Одна запись — одна тема; большую биографию разделите на внешность, характер, отношения и события. В редакторе карты видна приблизительная оценка токенов. Общий начальный лимит памяти — около 2000 токенов; длинные постоянные записи уменьшают место для автоматической памяти. «Всегда» и ручные прикрепления не отбрасываются ради этого лимита: превышение показывается отдельно.

## Обновление локальной сборки

Не удаляйте расширение: это может стереть данные. Обновите файлы в ранее загруженной папке, нажмите кнопку перезагрузки расширения на странице управления дополнениями, затем обновите вкладку DeepSeek. Если была загружена папка проекта `.output/chrome-mv3`, после пересборки достаточно этих двух перезагрузок.

Дата сборки указана внизу «Настроек». Если её нет, открыта старая версия. Пересборка проекта не обновляет другую папку, в которую раньше был распакован ZIP: сначала обновите файлы именно там. Удалять и устанавливать расширение заново не требуется.

## Что DeepSeek получит сейчас

На экране «Игра» видно, готова ли память для следующей реплики. «Посмотреть записи» показывает выбранный текст и причину выбора. «Память готова» не означает, что что-то уже отправлено: память добавляется при отправке вашего сообщения. Пересказ для переноса истории помечается отдельно и добавляется один раз.

«Обновить лор» показывает подготовку, ожидание ответа, предложения либо отсутствие новых фактов. Ответ остаётся видимым в чате. Отметьте нужные предложения и нажмите «Сохранить выбранное» — карта и список обновятся вместе.

## Подбор памяти без скрытых меню

«Настройки» открываются на вкладке «Память»: три режима с примерами, наглядные баллы и параметры подбора. Экспорт и сейф находятся в «Файлах и защите», язык и напоминания — в «Приложении». «Автоподбор» — новое название прежнего «По смыслу»: алгоритм остался балльным, без отдельного ИИ. Короткое объяснение есть и рядом с режимами в редакторах карты, списка и окошке «Запомнить».

Над параметрами указано, к какому подключённому миру они относятся. Внесите изменения и нажмите «Сохранить подбор». Другие миры не изменятся. Если мир не выбран, меняются параметры для чатов без мира.

В карточке записи «По режиму» оставляет обычный подбор; «Всегда здесь» вручную включает запись, «Не отправлять» исключает её. Это настройки только текущего чата. Выключенная книга не отправляется даже при ручном выборе записи.

Прежние предложения переносятся в новую очередь, а не сохраняются в канон автоматически. Старые приватные описания мира/профилей остаются приватными; для их включения в контекст отметьте «Использовать описание в чате» в редакторе соответствующего мира или профиля.

## Резервная копия

- Откройте «Настройки» → «Файлы и защита» → «Резервная копия».
- «Обычный JSON» удобно хранить локально.
- «С паролем» создаёт зашифрованный файл; без этого пароля восстановление невозможно.
- Для восстановления нажмите «Импорт» и выберите полную копию DeepRole. Сначала появится предпросмотр; файл ещё не записан.
- «Добавить недостающее» оставит ваши записи и настройки прежними. Данные с уже существующими ID не заменяются.
- «Полностью восстановить копию» заменит библиотеку и настройки после отдельного согласия. Режим сейфа не меняется.
- «Отмена», крестик или Esc закрывают предпросмотр без изменений. Файл проверяется целиком до восстановления; поддерживаются прежние v1-копии, до 50 МБ и 20 000 сущностей.

Перед удалением расширения обязательно создайте резервную копию: браузер может удалить локальную память вместе с расширением.

## Локальный сейф

«Настройки» → «Файлы и защита» → «Защита на устройстве» → «Включить локальный сейф» защищает библиотеку паролем. После разблокировки память доступна до закрытия браузерной сессии или нажатия «Закрыть сейф». Эта кнопка закрывает память во всех вкладках; сначала сохраните правки, потому что незавершённые редакторы и окошки «Запомнить» очищаются. Уже сохранённый лор остаётся на месте. Меню можно закрыть крестиком или Esc даже при закрытом сейфе.

Обычный чат и черновик DeepSeek остаются доступными, но новая память не добавляется к запросам до разблокировки. Сейф не удаляет уже отправленный DeepSeek контекст и не шифрует ранее скачанные обычные JSON-файлы. Подготовленный экспорт отменяется, если закрыть сейф или выйти из раздела до скачивания.

## Если DeepSeek обновился

DeepRole отправит обычное сообщение без памяти и покажет предупреждение. Текущий контекст можно скопировать одной кнопкой и вставить вручную. Это защитный режим: обновление сайта не должно ломать отправку сообщений.

---

# Installing DeepRole

For Chrome, unpack `deeprole-0.1.0-chrome.zip`, open `chrome://extensions`, enable Developer mode, choose “Load unpacked”, and select the unpacked folder.

For Firefox, unpack `deeprole-0.1.0-firefox.zip`, open `about:debugging#/runtime/this-firefox`, choose “Load Temporary Add-on”, and select `manifest.json`.

The menu has three sections: Play (current chat and selected memory), Lore (map/list, worlds and profiles), and Settings (visible memory modes and tuning, language, backups, reminders and on-device protection). Importing a file into the library does not by itself make it available to DeepSeek. Use “Use in this chat”, or leave “Use in the open chat” checked during import. No message is sent. Existing worlds need not be imported again. “In your next message” counts selected records, not every library entry. Manual records still require attachment.

Create a backup before uninstalling the extension. Password-protected backups cannot be recovered without their password.

Settings → Files & security → Import first validates and previews a full DeepRole backup. Add missing data keeps current records and settings, skipping existing IDs. Restore the full backup replaces library/settings only after explicit consent, without changing the vault mode. Cancel, X and Escape do not import anything. Older v1 backups are supported, up to 50 MB and 20,000 records. Import BDS or individual worlds in Lore → Import existing lore instead.

Settings → Files & security → On-device protection → Enable local vault protects your library with a password. Memory stays unlocked for the browser session until you choose Lock vault. This locks every tab; save edits first, as unfinished DeepRole editors and Remember drafts are cleared. Saved lore stays intact. The menu still closes with X or Escape. DeepSeek's chat and draft remain accessible, but requests receive no new memory until you unlock. Locking does not remove previously sent DeepSeek context or encrypt downloaded plain JSON files. An unfinished export is cancelled if you lock the vault or leave its section before download.

Context → Remember saves your own fact, rule or manual note without creating a JSON file. You can explicitly ask DeepSeek to propose lore from a brief. Update lore leaves a review badge, not a forced dialog. Compare before/after changes and save selected proposals; undo is available while no later edit would be overwritten. The map, list and chat tools share the same memory and chat attachments.

The menu follows your active tab. A delayed world/template command never applies to a different chat; repeat the command there if needed. Rejected analyses or requests cancelled through the site's abort signal can be retried without waiting ten minutes; DeepRole does not resend them automatically. A newly typed message prevents automatic handoff navigation, while the saved state remains available in Play → Continue your story. Only the reply to the specific service request is accepted, even if old chat messages are rerendered. Ordinary messages quoting the technical format stay visible.

Open Lore → Open world map. The world starts in the center of a symmetric circle of sections, with every branch and entry already expanded. One click opens a card beside the node; double-click (Alt+Enter on a keyboard) folds the branch. Neither action moves the camera or neighbouring nodes. Every reopening expands all branches again while retaining saved positions. Pan with middle-button drag or scrolling; Shift+wheel pans horizontally, Ctrl+wheel zooms. Left-drag the background to frame-select cards; Ctrl/Shift add to the selection, Ctrl+A on the canvas selects all visible cards. Drag a selected card to move the group; neighbours and unselected descendants stay still. Overlaps never change an entry's section. Use the nearby card to read, edit and explicitly save an entry without leaving the map. Overview explicitly expands branches and returns to the world; selecting a search result moves to that node. Drag its round connection circle to any card. For sections, choose one entry from each; describe the relationship, read its effect and confirm it. Empty sections need an entry first. No automatic mass connections are created. Section detection supports English and Russian; ambiguous entries remain in To organize and can be corrected manually. Suggested characters and connections always need review. Advanced → Reset positions restores symmetry without deleting memory. Reload the extension and the DeepSeek tab after updating local files; do not uninstall it, as that may erase data.

Selecting a branch opens its canonical entries in a nearby card. Branch names and positions do not change matching. Change an individual saved mode or confirm changing the whole branch, including sub-branches and entries hidden by search. Disabled entries stay disabled. Modes are shared by chats using that world; per-chat attachments are separate. Map autosave, Ctrl+Z, Ctrl+Shift+Z and the confirmed Reset include mode edits made on the map. Reset restores the opening state without rewriting text, profiles or chat attachments.

The importer also accepts JSON entry arrays and dictionaries with titles and text. Preview original text, keys, modes and disabled status. Unsupported extra settings require consent to omit them; ambiguous or malformed files are rejected without partial writes. See README for supported fields. A map does not automatically send all its memory: DeepSeek receives only the selected context with each request.

Editing world changes only the editor's library. Create empty world adds a name and empty sections, with no preset lore and no automatic chat connection. Two worlds side by side opens independent editing surfaces; each has its own camera, selection and undo history. On narrow screens the panes stack vertically and scroll. Switching worlds or closing protects unsaved text. Records are not automatically copied between worlds.

Only one world can be connected to the current chat. Its status appears above the map; Connect to chat explicitly switches the memory source. Scene controls on that map reuse the current chat's profiles, participants, location, group and book; multiple participants can be selected. Browsing the other world or moving cards does not send anything or change the scene.

Practical entry sizes: 30–100 words for Always, 80–250 for By meaning/called. These are guidelines, not hard limits. Keep one topic per entry; split a long biography into appearance, personality, relationships and events. The map editor shows an approximate token estimate. The starting memory budget is about 2,000 tokens. Long Always entries leave less room for automatic matches. Always and manually attached entries are not silently dropped to fit the budget; over-budget context is reported separately.
