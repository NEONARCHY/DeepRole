# Игровое время и временные сведения / Game time and temporary state

## Что теперь происходит

DeepSeek может добавить метку времени в обычный ответ вместе с предложениями памяти. DeepRole проверяет точную цитату и источник. Метка начинает действовать после сохранения по выбранному режиму сопровождения: обычные подтверждённые предложения могут сохраняться автоматически, спорные требуют проверки. Дополнительный запрос модели для этого не нужен.

В «Память истории» → «Сводки эпизодов» видна последняя подтверждённая метка. Поддержаны явные начала строки: «День 12», «Day 12», дата `2026-10-13`, «Прошло три дня», «Three days later». Для переходов поддержаны также числовые дни, недели, месяцы и годы. DeepSeek должен исключать даты из диалогов, планов и воспоминаний. Расширение проверяет буквальный текст, оформление и источник; универсального понимания истории у этой проверки нет.

## Пример

1. В сцене Нора стоит у моста в синем пальто. Это временные сведения.
2. Затем история явно говорит: «Прошло три дня».
3. Временные записи с более ранним подтверждённым источником помечаются как относящиеся к прежней сцене. В следующем запросе DeepSeek получает это пояснение вместе с исходной цитатой. Прежнее пальто или занятие не следует считать гарантированным настоящим.
4. «Нора знает код ворот», если это принято как постоянное сведение, сохраняет такой смысл.
5. «Нора обещала помочь завтра» остаётся открытым обещанием даже через три дня. Закрыть его может подтверждённое выполнение или отмена. Сейчас отдельной отметки просрочки нет.

Временное состояние в той же или более поздней сцене обозначается как последнее известное. Пропуск обновления не доказывает, что персонаж всё ещё там. Новое принятое значение того же свойства заменяет прежнее в текущей памяти; исходная сцена остаётся в хронике.

## Ограничения

Явное сыгранное завершение теперь может отдельно закрыть временное свойство: «ждёт у моста» → «ушла с моста». Это не автоматическое истечение от времени. [Примеры завершения и возобновления](CIRCUMSTANCES.md).

- Метки «три дня спустя» сохраняются буквально. Одинаковая фраза в двух разных сценах обозначает два перехода, но расширение не складывает их в календарную дату.
- Номер эпизода, часы компьютера и порядок импорта не задают игровую дату. Когда проверенной метки нет, интерфейс сообщает об этом.
- Поддержка времени ограничена перечисленными форматами. Произвольные даты, сезоны, сложный календарь мира и автоматические сроки годности пока не рассчитываются.
- Разделение временных и постоянных свойств предлагает DeepSeek в новых записях. Старые импортированные факты не получают выдуманную классификацию; без подтверждённого порядка источников время состояния неизвестно.
- Переход на более ранний номер дня или ISO-дату требует проверки. Изменение уже принятой классификации также требует проверки. Это не механизм отката всей истории.
- При снятии принятия метки, выборе другого ответа или отмене эффектов представление пересчитывается из оставшейся принятой памяти. Продолжение в новом чате, перезагрузка, полная копия и восстановление архива сохраняют подтверждённые связи.
- Состояния и метка времени передаются в общем бюджете запроса. Метка с источником учитывается целиком в обязательной части; превышение обязательного бюджета видно пользователю.

Автоматические проверки подтверждают сохранение и передачу данных. Поведение настоящей модели в вашей истории ещё требует проверки.

## English

Explicit played endings of known temporary properties are now supported independently of time passing. [Ending and resumption examples](CIRCUMSTANCES.md).

DeepSeek can propose a literal game-time marker in its ordinary played reply. DeepRole validates its exact line-opening evidence and applies it only through the existing accepted-memory workflow. Supported forms are Day 12 / День 12, ISO date YYYY-MM-DD and explicit elapsed days/weeks/months/years, such as Three days later / Прошло три дня. The model must exclude dialogue, plans and flashbacks. Literal formatting/source checks are not universal semantic understanding; unsupported labels are rejected.

New mutable state claims can be marked temporary (`scene`) or lasting (`persistent`). A source-linked temporary state before a later accepted time transition is shown and sent as belonging to an earlier scene. Other temporary state is only last-known at its source. Lasting knowledge remains available. Open promises/tasks keep their status until explicit accepted fulfillment or cancellation; there is no automatic overdue status.

Elapsed markers are not summed into dates. Unknown chronology and unclassified old imports remain unknown. Backwards absolute time and changes to an accepted lifetime need review. Rejection, alternatives and undo rebuild the view; continuation/full backups/archive restore retain sources. No extra model request, provider, author-lore rewrite or image change is added. This is a limited temporal contract, not an arbitrary world calendar or expiry engine. Live-account model quality is not established by synthetic checks.
