# Сводки эпизодов / Episode summaries

## Как пользоваться

В разделе «Память игры» появились «Сводки эпизодов». Они автоматически собираются из уже принятой игровой памяти. Откройте эпизод: сверху находится краткий связный текст, ниже — все записи. Номер [1] рядом с текстом открывает точную исходную цитату и переносит на неё фокус. Поиск проверяет текст факта, название задачи и цитату. Кнопка «Показать более ранние эпизоды» раскрывает старые порции.

Например, «Нора: “Я помогу, если дорогу откроют”» остаётся обещанием с условием, а не превращается в «Нора помогла». Слишком длинная цитата не обрезается: она остаётся в полном списке, а краткий текст сообщает о пропущенных записях. Это локальное представление из целых цитат, не свободный пересказ модели. [Правила и ограничения](NARRATIVE-SUMMARIES.md).

Первая версия группирует по 12 записанным завершённым игровым репликам. Номер эпизода показывает порядок в сохранённой истории. Он не обозначает день, главу или самостоятельно определённую сюжетную арку. Эпизод может содержать меньше 12 реплик, если это текущая порция. В сводке присутствуют только принятые факты; непроверенные предложения туда не попадают.

Сводка является пересчитываемым представлением памяти. Исправление, обновление состояния, снятие принятия или выбор другого ответа автоматически меняют её. Исходные сцены и пользовательский лор сохраняются. Отдельного запроса к DeepSeek для создания этих сводок нет. В запросе выбранные факты могут использовать [обратимую компактную упаковку](COMPACT-GAME-MEMORY.md); этот UI-текст поверх тех же фактов не добавляется.

## Если прошло много игровых дней

Например, в прежней сцене Нора ждала у моста, а после скачка времени оказалась в библиотеке:

1. Подтверждённая новая запись состояния становится актуальной для того же ключа. Сводка использует её.
2. Исходная сцена у моста остаётся в хронике. Давние описания позиции или занятия передаются модели как сведения своей сцены, а не как гарантированное настоящее.
3. Обещание починить ворота остаётся открытым, пока нет подтверждённого выполнения или отмены. Прохождение дней само по себе статус не меняет.
4. При одинаковом совпадении с запросом поздний подтверждённый источник получает больший приоритет. Прямой вопрос о старом событии по-прежнему может подобрать его.

У постоянных сведений, сыгранных событий, обещаний и временных обстоятельств разный смысл. Связь с давней сценой не означает, что все её факты перестали действовать. DeepSeek получает пояснение о последнем известном состоянии, условиях и открытых делах.

Добавлены явные подтверждённые метки времени и классификация новых состояний как временных или постоянных. После более позднего перехода временное состояние из раннего источника отмечается как относящееся к прежней сцене. [Примеры и ограничения](GAME-TIME.md). Точный календарь, произвольные сроки годности и автоматическая просрочка задач пока не рассчитываются. Правильное использование переданных данных моделью требует проверки в настоящей игре.

## Источники и перенос

У временного свойства может появиться отметка «Обстоятельство завершено в истории»: например, после явного окончания чтения. Запись о завершении заменяет прежнее текущее значение, но не выполняет задачу автоматически. [Примеры и ограничения](CIRCUMSTANCES.md).

- Порядок берётся из выбранной завершённой цепочки реплик. Размышления, незавершённые ответы, режим «вне игры» и исключённые варианты не добавляются в эту цепочку.
- Каждый размещённый факт сохраняет исходный ID реплики и точную цитату. Это не устанавливает неизвестного владельца обещания или местоимения.
- При отсутствии проверенного порядка запись попадает в «Ранее сохранённую память». Её дату и позицию расширение не придумывает.
- Новый чат подключается к той же игре лора и наследует порядок источников. Перезагрузка, полная резервная копия, сброс с архивом и его отмена сохраняют соответствующие связи.
- Принятые факты и цитаты передаются в прежнем общем бюджете. Дополнительная метка источника и пояснение тоже учитываются; неподходящий по размеру факт целиком пропускается.

## English

Known temporary properties can now carry an explicit ended status. Selected memory retains the ending rather than the previous current activity; original scenes remain available. Tasks are not fulfilled by ending an activity. [Details](CIRCUMSTANCES.md).

Episode summaries are automatically derived from accepted game facts, grouped by 12 complete recorded in-character turns. A brief source-backed paragraph now precedes the full fact list: numbered citations open and focus the exact source disclosure. Whole quotes preserve conditions, negation, attribution, kinds and confirmed task statuses. Overlong records remain in the full list with explicit omissions in the brief. This is a local template view, not a model-written recap or a change to outgoing memory. [Contract and limits](NARRATIVE-SUMMARIES.md). Episode numbers represent recorded order, not dates or inferred story arcs. Search fact/task/quote text or show earlier portions in Story memory.

Earlier transient position/activity is last-known at its source; the current scene and later explicit state updates take priority. Permanent knowledge can remain relevant. Time passing alone does not complete or cancel obligations. Confirmed source recency resolves otherwise equal retrieval candidates; explicit old-event queries remain supported.

The selected source lineage is carried through continuation and full backups, validated for scope, order, completeness and inherited segments. Rejected facts and excluded alternatives leave the derived outline. Unknown chronology stays unknown; episode membership does not infer speaker identity. The existing whole-context budget includes source annotations and their guide. Explicit accepted time markers and temporary/lasting state annotations are now supported; [details and limits](GAME-TIME.md). No extra model call or new provider is added. Calendar arithmetic, arbitrary expiry and automatic overdue status remain future work; automated checks do not prove live-model behavior.
