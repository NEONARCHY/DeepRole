# Автоматическое сопровождение игры / Automatic game accompaniment

## Игровое время / Game time

Явное завершение временного обстоятельства теперь сохраняется отдельно: «Нора ждёт у моста» → «Нора ушла с моста». Источник остаётся в хронике; постоянные знания и открытые обещания не закрываются. Неясные предложения требуют проверки. [Примеры](CIRCUMSTANCES.md).

Known temporary properties can end through an explicit played event, with exact source evidence and review for uncertain proposals. Time passing never ends them by itself; tasks and lasting knowledge are retained. [Details](CIRCUMSTANCES.md).

Сводки показывают последнюю принятую метку вроде «День 12» или «Прошло три дня». Временные состояния, записанные до более поздней метки, передаются как сведения прежней сцены; постоянные знания и открытые обязательства сохраняют свой смысл. Точная дата из относительного перехода не вычисляется. Старые записи не получают угаданную классификацию. [Примеры и ограничения](GAME-TIME.md).

Episode summaries display the latest accepted source-linked time marker. Temporary state preceding a later explicit transition is annotated as earlier scene state; lasting knowledge and obligations keep their confirmed meaning. Elapsed phrases do not establish an absolute calendar. Old imports are not retrospectively classified. [Details](GAME-TIME.md).

## Сводки эпизодов / Episode summaries

В «Память истории» появились автоматические сводки из принятых фактов с раскрытием точных цитат и поиском. Они группируются по12 записанным завершённым игровым репликам; номер обозначает порядок, а не игровой день. Обновление или снятие принятия пересчитывает сводку. При продолжении в новом чате и полной резервной копии порядок источников сохраняется.

Давние позиции и занятия относятся к исходной сцене. Новые явные изменения и текущая сцена имеют приоритет; прохождение времени само по себе не закрывает обещания или задачи. Дополнительный запрос модели не нужен. [Примеры и ограничения](EPISODE-SUMMARIES.md).

Story memory now offers local extractive episode summaries from accepted facts, grouped by12 complete recorded turns with exact evidence and search. Episode order is not a game-day calendar. Earlier transient state is last-known at its source; explicit later progress and the current scene take priority, while obligations keep their confirmed status. Continuation/backups retain source order, with no extra model call. [Details](EPISODE-SUMMARIES.md).

## Кто именно обещал

Позднее подтверждение запроса не создаёт вторую версию уже сохранённой сцены и не меняет принятую память. При нескольких попытках используется точная пара сообщений; несколько квитанций для одной пары оставляют связь неизвестной. Неизвестная связь не удаляет факт или цитату. [Пример и ограничения](LATE-SOURCE-EVIDENCE.md).

Теперь можно спросить и естественнее: «Напомни, что Нора обещала Мире», «Какие планы у Норы?», «Каково мнение Норы?». При однозначном имени её собственная запись получает приоритет перед записью, где Нора лишь адресат. Запрос не создаёт новую связь и не меняет старую память. [Примеры и результаты проверки](MEMORY-OWNER-QUALITY.md).

«Нора сказала Мире: я обещаю принести инструменты, если дорогу откроют». В обычном запросе DeepRole может отдельно передать: говорящий и обещавший — Нора, адресат — Мира. Вопрос «Что обещала Нора?» повышает приоритет её обещания; обещание Миры Норе не получает этот приоритет. Исходная цитата и условие остаются целиком. Обещание не считается выполнением.

Это локальная проверка простых явно названных RU/EN конструкций. Для новых источников с подтверждённой XHR-парой список имён фиксируется перед отправкой, а связь сохраняет исходный ID и цитату. Если Нора стала Евой, её старое обещание остаётся её; новая Нора его не получает. Подтверждённое объединение и отмена используют исходные ID. Перенос и полная копия сохраняют эти связи; удалённая карточка остаётся исторической личностью.

«Нора сказала, что Мира обещала» не делает Нору обещавшей. Одинаковые имена, неизвестные конструкции и «она/он» не получают угаданную связь. Старая память без снимка имён и источники без подтверждённой отправки сохраняются с неизвестной привязкой к нынешним карточкам. Исходные тексты, цитаты и лор не переписываются, новых кнопок или дополнительных запросов модели нет. Доставка памяти не гарантирует правильный ответ DeepSeek.

### Who made the promise

Late request confirmation no longer turns an unchanged stored user body into an edit or duplicates its scene. Exact user/assistant pairs distinguish retries; multiple claims for one pair keep identity unknown. Facts and evidence remain available, and existing sources are not retrospectively rebound. [Details and limits](LATE-SOURCE-EVIDENCE.md).

Natural explicit queries such as “Remind me what Nora promised Mira”, “What are Nora's plans?” and “What is Nora's opinion?” now prioritize that person's own statement over a mere mention or recipient role. Query syntax creates no historical proof and changes no stored binding. [Fixed corpus and limits](MEMORY-OWNER-QUALITY.md).

For supported explicit RU/EN source syntax, ordinary requests distinguish the speaker, recipient and owner of a stated promise, plan or belief. Confirmed XHR sources retain their pre-send roster and original IDs: renaming, approved merging/undo, continuation and full backups preserve ownership. A new same-name person does not inherit a former person's promise. Removed IDs remain historical. Earlier unbound memory and unsupported/unconfirmed sources keep unknown identity rather than using today's names. Exact evidence and conditions remain intact; pronouns and complex language are not guessed. No extra model request or canonical text edit occurs. Passing evidence does not prove correct model use.

## Поиск при другой формулировке / Paraphrased requests

Запись «Нора обещала ремонт ворот» можно найти запросом «Восстановить ворота». Для принятой игровой памяти добавлен небольшой локальный RU/EN словарь восьми действий; он помогает выбрать факт и сохраняет его цитату, условие, вид и статус задачи. Имена и псевдонимы исключаются из поиска действий. [Примеры и ограничения](MEMORY-PARAPHRASES.md).

A small local RU/EN action dictionary helps select accepted facts through supported paraphrases, such as “mend the gate” → “fix the gate”. It preserves exact evidence, conditions, task status and saved character identity. The fixed48-query corpus improves3→48 first candidates; broader semantic understanding and live-model use remain unverified. [Details](MEMORY-PARAPHRASES.md).

## Сколько памяти добавляется в запрос

Лимит в настройках памяти теперь учитывает добавки DeepRole вместе: правила работы, текущую сцену, записи лора, игровые факты и задачи, нужные фрагменты анкет, пересказ, восстановленный ответ для текущего запроса и формат вариантов ответа. Размер приблизительный, не точное число токенов DeepSeek.

Например, в библиотеке сто персонажей, а герой сейчас разговаривает с одним смотрителем о ключе. Расширение выбирает участников сцены, нужный факт о ключе и подходящие абзацы анкет, а не повторяет все сто биографий. Точное имя или известный псевдоним подключает соответствующего человека. Это локальный подбор по словам, именам и связям, не понимание любого смысла или местоимения.

В индикаторе памяти раскройте «Что добавит DeepRole»: видны общий размер, обязательная часть, выбранные категории и то, что не включилось в этот запрос. Пропущенное не удаляется из библиотеки. Необязательный длинный абзац целиком пропускается, а не режется посередине условия или отрицания.

Записи «Всегда», ручное прикрепление, защищённые поля и текущая сцена сохраняются целиком. Если они превышают лимит, появляется объяснение; можно увеличить лимит или вручную сократить закреплённое. Лимит не является гарантией безопасного переполнения. Расширение не очищает накопленную историю DeepSeek и не обещает бесконечный контекст одного чата.

### Shared request budget

The added context budget counts DeepRole's protocol, scene, lore, accepted facts/tasks, profile excerpts, recap, request-bound recovered reply and choice format together. Local selection uses words, known names/aliases and configured links, not semantic understanding. Whole optional paragraphs may be omitted; the stored profiles and history remain unchanged. The What DeepRole adds disclosure shows estimated size, required data and included/omitted categories. Required, Always and manually pinned data is not silently clipped; overflow is shown. This does not remove DeepSeek's existing conversation history.

## Задачи и противоречия

В автоматическом режиме новые задачи обновляются вместе с обычным ответом DeepSeek. В «История → Сюжетные задачи» можно посмотреть открытые, выполненные и отменённые задачи и их цитаты. Постоянно открывать панель не нужно.

Например, «Мира обещала починить ворота» открывает задачу. «Мира собирается починить ворота завтра» не закрывает её. Сыгранное «Мира починила ворота» может закрыть ту же задачу автоматически, если модель верно сохранила её связь и проверки прошли. Пропуск упоминания не означает выполнение. Неясная связь, смена задачи или повторное открытие завершённой требуют проверки. Прежние обещания без связи показываются отдельно и не объявляются выполненными задним числом.

Если прежде красный ключ открывал подвал, а новая сцена называет синий, «Нужно проверить» показывает обе записи и цитаты. «Оставить прежнюю» отклоняет новое предложение; «Принять новую версию» заменяет показанные игровые записи. Исходный текст истории и авторский лор не удаляются. Изменение текущего состояния, например закрытие открытых ворот, проходит автоматически только с пометкой подтверждённого развития, а не исправления прошлого.

В следующем обычном запросе DeepRole передаёт выбранную память и состояния подходящих задач в прежнем ограниченном бюджете, не весь список. Дополнительного запроса ради задач нет. Смена варианта ответа пересчитывает зависимые задачи и решения; новый чат и полная копия переносят их. Старая непроверенная переписка автоматически не разбирается.

Сопоставление смысла выполняет модель; она может пропустить связь или ошибиться. Проверки точной цитаты, ключей и состояний уменьшают риск, но не доказывают смысловую правильность любого ответа.

### Story tasks and conflicting memory

Automatic accompaniment saves new linked tasks during normal play. Story → Story tasks shows open, completed and cancelled obligations with source quotes. A promise to repair a gate is not fulfillment; an explicitly played repair can close the same task. Ambiguous linkage and reopening require review. Earlier unlinked promises are shown separately, not retroactively marked completed.

Review needed compares old and new conflicting memory. Keep the previous version dismisses the proposal; Use the new version supersedes the shown game-memory records without deleting their sources or author lore. Played mutable-state progress is distinct from correcting a past fact. The next normal request receives selected task states within the existing bounded memory budget; no new service requests are added. Variant selection, continuation chats and full backups retain the corresponding state. Model interpretation can still be wrong.

## Как включить

Подключите лор к актуальному чату и откройте **«История → Сопровождение игры»**. Если запись ещё не включена, нажмите **«Включить автоматическую память»**. Если запись уже идёт, выберите **«Автоматически»**. Старые установки сохраняют прежний режим проверки до вашего выбора.

Режим сохраняется для лора и действует при продолжении в другом чате. Начало записи фиксирует текущую исходную точку: прежняя переписка не считается задним числом сыгранными событиями.

- **Автоматически:** пригодные сведения сохраняются после завершённого ответа. Открывать панель на каждом ходу не нужно.
- **С подтверждением:** факты, новые люди и дополнения анкет остаются в **«Нужно проверить»**.
- **Пауза:** новые факты и дополнения не накапливаются. Сохранённая память остаётся; обновление текущей сцены и чисел управляется отдельными настройками.

Сопровождение не создаёт служебный чат и не отправляет дополнительный запрос модели. Небольшая порция данных приходит вместе с обычным ответом: до восьми фактов и четырёх персонажей, по четыре текстовых поля. Это предел одной порции, а не всей памяти или библиотеки. Отдельная настройка коррекции повреждённых метаданных по-прежнему может запускать свой служебный запрос.

## Дополнительная проверка накопленных сцен

В разделе **«История → Дополнительная проверка памяти»** можно отдельно включить более глубокий разбор. Он использует дополнительные запросы и лимиты DeepSeek; по умолчанию выключен. Обычное сопровождение выше продолжает работать без них.

После примерно 12 новых завершённых игровых ходов DeepRole передаст небольшую партию записанных сцен в видимое служебное окно с плашками. При большом объёме или смене состава сцены проверка может начаться раньше. Весь лор и фотографии не отправляются; запрос не добавляется к игровой переписке. Черновик не трогается: разбор ждёт свободного чата. После проверки и удаления временного чата окно закрывается.

**Пример:** в ранней сцене Нери отдал фонарь Мире, но обычный ответ не принёс пригодного блока памяти. При разборе партии это событие может попасть в память с цитатой. «Нери обещал отдать фонарь» останется обещанием. Если факт уже сохранён, повтор не добавляется. Спорное предложение или защищённое дополнение анкеты появится в «Нужно проверить».

Есть пауза, отключение, отмена и явный повтор. Ошибка сохраняет память и незавершённые позиции; бесконечных автоматических повторов нет. Reload, новая исходная точка и продолжение в новом чате сохраняют обработку. В новом чате нужен обычный завершённый ход. Смена выбранной линии убирает её зависимую память. Полная копия переносит позиции, но после восстановления или импорта лора дополнительную проверку нужно возобновить вручную.

Старая непроверенная переписка до исходной точки не разбирается автоматически. Цитаты не гарантируют безошибочное понимание модели. Лимит native чата DeepSeek не отменяется: общий бюджет контекста — следующий этап.

## Что сохраняется

**Пример:** «Нери вернул фонарь» — сыгранное событие. «Нери обещает вернуть фонарь» — обещание; выполнение не отмечается. «Нери планирует осмотреть башню» — план. «Нери считает башню пустой» — его мнение. Явно раскрытый секрет и назначенная задача имеют отдельные категории; статус задачи сохраняется в её тексте.

Упомянутый новый человек может получить карточку, даже если его сейчас нет в сцене. Неизвестные внешность, возраст и числовые отношения не заполняются выдуманными значениями. Для существующего человека новые постоянные сведения дополняют игровую анкету поверх исходного текста. Временная поза, одежда сцены и текущее настроение относятся к состоянию сцены.

В анкете откройте **«Защита анкеты»**, отметьте нужные поля и сохраните персонажа. Автоматическое дополнение этих полей будет ждать проверки. Ручная правка, сделанная во время ответа, тоже защищена.

## Когда нужна проверка

Противоречивые, неоднозначные и недостаточно подтверждённые предложения не меняют память автоматически. В меню «История» виден счётчик, а в **«Нужно проверить»** — причина и исходная цитата. Это не блокирует дальнейшие обычные ходы.

Можно сохранить факт, выбрать поля дополнения или пропустить предложение. Для неоднозначного нового имени можно выбрать существующего персонажа либо явно создать новую карточку с уточнённым именем. Выбор существующего персонажа добавляет выбранные сведения; он не выполняет скрытого слияния карточек или назначения псевдонима.

Очередь сохраняется после перезагрузки, новой исходной точки и перехода в другой чат. Позднее подтверждение связывается с текущей завершённой сценой, сохраняя цитату прежнего источника. В новом чате без завершённой обычной сцены предложение остаётся видимым; подтвердить его можно после сцены. Решения неактуального чата не записываются.

## Повторы, отмена и ограничения

Каждая записанная версия завершённого ответа обрабатывается один раз. Повторная загрузка не создаёт новые факты или карточки. Повторы проверяются по нормализованному тексту, категории, сопоставимому началу и словам либо устойчивому ключу утверждения. Это консервативная проверка текста, а не полное понимание смысла.

Неизменяемые утверждения с разными значениями требуют проверки. Изменяемый ключ состояния может получить новое значение из сыгранной сцены. Ключи — подсказки модели для сравнения, не разрешение менять защищённый исходный лор. В следующие запросы передаётся ограниченный подбор принятой памяти по словам текущего сообщения и давности; вся библиотека не вставляется целиком.

Отмена или выбор другой записанной линии убирает зависимые факты и дополнения. Возврат восстанавливает уже записанные последствия без повторной генерации. Новая исходная точка закрепляет предыдущий прогресс; произвольный откат через неё пока не предлагается. Сброс игры архивирует память и очередь вместе с прогрессом; немедленная отмена сброса возвращает их. **Полная резервная копия** включает источники и решения; отдельный экспорт мира не переносит сыгранную память.

**«Полный сброс по исходному лору»** — отдельное действие. DeepSeek предлагает начальные состояния и очистку записей, вы проверяете их и подтверждаете дважды. Сыгранные факты, очередь предложений, сводки и игровое время уходят в архив предыдущей игры; выбранные устаревшие записи удаляются или очищаются. Родство, исходная любовь и другие отношения из начального лора сохраняются, изображения остаются. Игра начинается в новом пустом чате. Автоматическая память не выполняет такой сброс самостоятельно. [Порядок и ограничения](WORLD-RESET.md).

Точная цитата подтверждает наличие текста, но не гарантирует правильность категории или вывода. Ошибки модели возможны; при отсутствии пригодного блока изменения не выдумываются. Старую непроверенную переписку можно разбирать отдельными явными инструментами. Полноценное смысловое разрешение конфликтов и общий интерфейс открытых задач остаются следующими этапами.

## English

**Extra memory review** is a separate, disabled-by-default option under Story. It uses additional DeepSeek requests and limits, usually after 12 completed recorded game turns, earlier for large excerpts or cast changes. A visible masked service window reviews bounded excerpts and closes after validation/cleanup. It does not send the entire lore, photos, or a request into the game chat, and waits for an idle empty composer.

Suitable missing details use the normal automatic/review policy; duplicates, conflicts and protected fields use the same checks/inbox. An interrupted batch keeps memory and offsets and needs explicit retry. Reload, checkpoints and continuation inherit progress; a new chat needs a completed game scene. Restore/world import pauses this extra option rather than authorizing imported jobs. Choosing an alternative removes dependent memory and reopens sources whose analysis anchor disappeared. Model interpretation can still be wrong; native chat capacity and the full RP-05 context budget are not solved by batching.

Open **Story → Game accompaniment** in the current chat. Choose **Enable automatic memory**, or **Automatic** if recording already runs. Existing installations keep review mode until you explicitly choose. The setting follows this lore’s shared game across chats.

**Automatic** saves suitable details after completed normal replies. **With confirmation** queues all proposals. **Paused** stops new memory/profile accumulation while keeping saved data and independently configured scene updates. Accompaniment adds no service chat or extra model request: each normal reply carries at most eight facts and four people with four profile fields each. These are per-portion bounds, not total storage limits.

Events, promises, plans, beliefs, revealed secrets and tasks remain distinct. A promise is not fulfillment; a plan is not an accomplished event. New named people may receive cards even when only mentioned. Unknown ages, appearances and numeric relationships are not invented. Lasting profile details append to the game profile while original author text stays intact.

**Profile protection** selects fields for manual review after saving the character. Conflicts, uncertain identities, ages and insufficient evidence appear under **Review needed**, with a source quote and reason. Choose individual fields, explicitly select an existing person or create an unambiguous new card, or skip. Reviewing one item does not interrupt routine saves.

The queue and decisions survive reload, checkpoints and continuation. A late resolution attaches to the current completed scene while preserving its old source. New chats without a completed ordinary scene retain the queue but cannot resolve it yet. Only the current game chat can write progress.

Stored reply versions provide durable processing receipts. Normalized text, bounded lexical similarity and optional claim keys detect repeats; this is not full semantic understanding. Memory supplied to later requests is bounded and ranked by current-message words and recency. Undo/alternative selection reverses dependent memory and profile additions; checkpoints fix earlier progress. Full backups preserve sources, queues and decisions; standalone world exports exclude played memory.

Exact quotes establish text presence, not perfect model interpretation. Missing/invalid metadata does not fabricate changes. Optional metadata repair is a separate setting and may use an extra request. Retrospective unverified history, full semantic conflict resolution and a full open-task interface remain future work.
