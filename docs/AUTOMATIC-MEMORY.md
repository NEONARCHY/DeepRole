# Автоматическое сопровождение игры / Automatic game accompaniment

## Как включить

Подключите лор к актуальному чату и откройте **«История → Сопровождение игры»**. Если запись ещё не включена, нажмите **«Включить автоматическую память»**. Если запись уже идёт, выберите **«Автоматически»**. Старые установки сохраняют прежний режим проверки до вашего выбора.

Режим сохраняется для лора и действует при продолжении в другом чате. Начало записи фиксирует текущую исходную точку: прежняя переписка не считается задним числом сыгранными событиями.

- **Автоматически:** пригодные сведения сохраняются после завершённого ответа. Открывать панель на каждом ходу не нужно.
- **С подтверждением:** факты, новые люди и дополнения анкет остаются в **«Нужно проверить»**.
- **Пауза:** новые факты и дополнения не накапливаются. Сохранённая память остаётся; обновление текущей сцены и чисел управляется отдельными настройками.

Сопровождение не создаёт служебный чат и не отправляет дополнительный запрос модели. Небольшая порция данных приходит вместе с обычным ответом: до восьми фактов и четырёх персонажей, по четыре текстовых поля. Это предел одной порции, а не всей памяти или библиотеки. Отдельная настройка коррекции повреждённых метаданных по-прежнему может запускать свой служебный запрос.

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

Точная цитата подтверждает наличие текста, но не гарантирует правильность категории или вывода. Ошибки модели возможны; при отсутствии пригодного блока изменения не выдумываются. Старую непроверенную переписку можно разбирать отдельными явными инструментами. Периодический глубокий анализ по 10–15 ходов, полноценное смысловое разрешение конфликтов и общий интерфейс открытых задач остаются следующими этапами.

## English

Open **Story → Game accompaniment** in the current chat. Choose **Enable automatic memory**, or **Automatic** if recording already runs. Existing installations keep review mode until you explicitly choose. The setting follows this lore’s shared game across chats.

**Automatic** saves suitable details after completed normal replies. **With confirmation** queues all proposals. **Paused** stops new memory/profile accumulation while keeping saved data and independently configured scene updates. Accompaniment adds no service chat or extra model request: each normal reply carries at most eight facts and four people with four profile fields each. These are per-portion bounds, not total storage limits.

Events, promises, plans, beliefs, revealed secrets and tasks remain distinct. A promise is not fulfillment; a plan is not an accomplished event. New named people may receive cards even when only mentioned. Unknown ages, appearances and numeric relationships are not invented. Lasting profile details append to the game profile while original author text stays intact.

**Profile protection** selects fields for manual review after saving the character. Conflicts, uncertain identities, ages and insufficient evidence appear under **Review needed**, with a source quote and reason. Choose individual fields, explicitly select an existing person or create an unambiguous new card, or skip. Reviewing one item does not interrupt routine saves.

The queue and decisions survive reload, checkpoints and continuation. A late resolution attaches to the current completed scene while preserving its old source. New chats without a completed ordinary scene retain the queue but cannot resolve it yet. Only the current game chat can write progress.

Stored reply versions provide durable processing receipts. Normalized text, bounded lexical similarity and optional claim keys detect repeats; this is not full semantic understanding. Memory supplied to later requests is bounded and ranked by current-message words and recency. Undo/alternative selection reverses dependent memory and profile additions; checkpoints fix earlier progress. Full backups preserve sources, queues and decisions; standalone world exports exclude played memory.

Exact quotes establish text presence, not perfect model interpretation. Missing/invalid metadata does not fabricate changes. Optional metadata repair is a separate setting and may use an extra request. Retrospective unverified history, periodic deeper batches and a full open-task interface remain future work.
