# Если важная память не помещается — RP274

Перед следующим сообщением DeepRole проверяет найденный важный набор для поддержанных формулировок. Например, для двери и ключа есть12 отдельных условий. Если весь набор не помещается вместе с обязательным лором и правилами, сохраняется прежний подбор и появляется спокойное предупреждение **«Не вся важная память поместилась»**.

Оно доступно на странице DeepSeek и в разделе «Игра». Кнопка **«Подробнее о памяти»** на странице открывает панель подключённой памяти; новый разбор или запрос модели не запускается. Предупреждение не перехватывает фокус, не блокирует отправку, не открывает диалог и не отправляет отдельный запрос модели. Можно проверить лимит памяти и объём закреплённых данных в настройках; сохранённая история не удалена.

## Что означают состояния

| Состояние | Что действительно известно |
| --- | --- |
| Найденный набор подготовлен целиком | Целые проверенные источники вычисленного алгоритмом набора вошли в подготовленный контекст. Все важные по смыслу условия могли не попасть в сам этот набор. Это не вся библиотека и не подтверждение отправки или использования моделью. |
| Не вся важная память поместилась | Проверка полного достоверного набора отклонена именно из-за локального бюджета. Применяется точный прежний подбор, который может быть неполным. |
| Источник не подтверждён | Связь с источником, цитата или доступность участника не подтверждены. Это не доказательство нехватки места. |
| Формулировка не поддержана | Полнота важного набора неизвестна; обычный подбор продолжает работать. |
| Полнота памяти для этого хода не подтверждена | RP337 нашёл связанные записи по названным предметам сложного хода, но не подтвердил весь разбор, источники или предел набора. Плашка предлагает проверить подключённую память и уточнить ход. Это не ошибка бюджета и не подтверждение действия. |
| Защитный предел передачи | Доказанный объединённый набор превышает технический предел одного блока; это не размер библиотеки мира. |
| Обязательная память превышает лимит | Уже закреплённые правила, лор или защищённые данные больше бюджета; они сохраняются целиком. Это отдельная причина. |

Успех, неподдержанная фраза и неизвестные источники не вызывают всплывающих сообщений. Их объяснение находится в раскрытии **«Что добавит DeepRole»**. Обычные пропуски второстепенной памяти остаются отдельными счётчиками и сами не включают предупреждение о важном наборе.

Для нового подбора RP337 сложных ходов действует отдельное видимое предупреждение выше: найденные предметы не означают, что понятны все части фразы. Общая ссылка «её капсула» подбирает кандидатов без назначения владельца. Условное «если разрешат» и утверждение «уже починил» не отменяют сохранённые условия и не закрывают дела. Подбор ограничен названиями из проверенных источников, размером набора и бюджетом; это не произвольное понимание речи.

RP341 распространяет этот отдельный подбор на вопросы, цитаты и другие глаголы,
если найдены названия из проверенных источников. Целая группа включает условия,
владельцев, запреты и статусы, даже если это больше восьми записей. Небольшой
явный словарь может предложить связанные варианты («насос/помпа», «занавес/портьера»);
он не устанавливает, что это один предмет. Все кандидаты сохраняют свои источники,
а плашка сообщает, что полнота смысла не подтверждена. Неподтверждённые источники,
предел набора или бюджет сохраняют защитный отказ; настройки отключения учитываются.
Обычный прежний подбор без такого дополнения остаётся в подробностях.

## Границы

Независимая проверка RP342 выявила пропуски; [первый результат](RP05-FREE-NARRATIVE-HOLDOUT-RESULTS-20261019.md) сохранён. RP343 исправляет их на знакомом наборе: неопознанный операционный вопрос может получить ограниченный список незавершённых дел и их условий с плашкой неопределённости. Это запасные варианты, не подтверждение смыслового совпадения. Короткая ссылка может использовать названные темы двух последних реплик; роль автора при этом не угадывается. Доступный источник и неизвестная историческая роль — разные состояния. [Ремонт и проверки](RP05-UNRESOLVED-MEMORY-REPAIR-20261019.md).

Список ограничен32 названиями,128 объединёнными исходными записями и бюджетом. Предыдущий подбор сохраняется атомарно при отказе; отсутствие плашки всё равно не доказывает произвольное понимание речи. Для неподдержанных ссылок может понадобиться уточнение.


RP284 добавляет [ограниченный разбор абзаца](NARRATIVE-ACTIONS.md) с прежними источниками/бюджетом. Для него semantic полнота остаётся unverified/query («Формулировка не поддержана» в существующем интерфейсе), даже если вычисленная группа вошла целиком. Это осторожность по полноте смысла; найденная память всё равно может добавляться в запрос.

В первой проверке RP283 три неполных scored случая всё же получили complete: часть нужных источников алгоритм не включил в свой набор. RP285 [исправляет «сани/саней»](OBJECT-FORMS.md) в двух русских случаях; RP286 [добавляет связанные записи к короткой английской ссылке](OBLIGATION-RECALL.md) и оставляет для нового способа неподтверждённую полноту. На знакомом наборе прежние три случая исправлены. Статус всё равно нельзя читать как гарантию понимания любого запроса; дальше нужна новая независимая проверка. [Первый результат](INDEPENDENT-SEQUENCE-RESULTS.md) сохранён.

Это предпросмотр/подготовка текущего запроса. Последняя подтверждённая отправка показана отдельно существующей квитанцией; новый статус не добавляется в её историческую запись и после reload пересчитывается для текущего ввода. Локальная оценка добавки не измеряет свободное контекстное окно на сервере DeepSeek. Новый чат сам по себе не увеличивает установленный локальный бюджет.

Статус идёт отдельным каналом состояния страницы. Текст запроса, выбранные записи, отчёт и счётчики компилятора, исходные цитаты, точный fallback и канон не меняются. Текущий контрольный снимок RP273 сохранён в `docs/benchmarks/rp273-final-compiler.txt`; исходные регистрации, gold и отчёты не перезаписываются. Старый benchmark без флагов проверяет прежний baseline; повтор старого `--evaluate` на изменившемся файле правильно останавливается проверкой fingerprint, не даёт новой регистрации автоматически.

## English

The fresh RP342 red is preserved in [results](RP05-FREE-NARRATIVE-HOLDOUT-RESULTS-20261019.md). RP343 repairs those SEEN cases with bounded pending-duty candidates for unresolved operative requests and recent-topic supplementation for references. Candidates are not semantic identity; available sources may have unknown frozen roles. The existing incomplete notice remains honest. Bounds and atomic source/budget fallback apply. [Repair and limits](RP05-UNRESOLVED-MEMORY-REPAIR-20261019.md). A fresh independent check is still needed.

“Complete” covers the compiler's computed candidate set. It does not guarantee that every semantically necessary condition was identified. The three RP283 incomplete-positive cases have been repaired on those seen inputs in RP285/286; the new reference lane explicitly stays unverified. A fresh independent evaluation is still needed. [Evidence and limits](OBLIGATION-RECALL.md).

For supported wording, DeepRole checks the identified whole important set while preparing the next message. A proven local-budget deficit shows a nonblocking notice on the page and in Play; the exact previous selection remains. Required-data overflow is separate. Unknown sources, unsupported wording and ordinary optional omissions do not become budget warnings. Details describe preparation, not confirmed delivery or model use. The history and request payload remain unchanged; the existing delivery receipt remains separate. Reload recomputes coverage for the current draft, without persisting it as game memory or a historical delivery verdict.

RP337 adds a separate visible “Memory coverage for this turn is unverified” notice for complex-action topic supplementation. Retrieved candidates do not certify the entire action sequence, ownership, permission or completion. This notice is not a budget error, blocks nothing and is never included in the model payload or saved canon. Ordinary unverified states remain details-only.

RP341 also admits questions, quotations and other verbs through source-backed topic
groups. A small explicit query-only vocabulary supplies related candidates, not
object identity. Whole groups retain conditions, owners, prohibitions and status;
the existing incomplete notice stays visible. Source/size/budget guards and opt-outs
still apply. Original sources, historical roles and canonical memory are unchanged.

## Проверка

15 выбранных unit-файлов/953pass, TypeScript/diff-check0; все64 прежних RP273 результата совпадают целиком с замороженными outputDigest, baseline CLI без флагов подтверждает64 случая.32 UI проверки Edge/Firefox RU/EN320/900px и2 current isolated Edge runtime (2 штатных Firefox skip) прошли;28 исходящих POST проверяют целые12 источников, отдельный статус/sidepanel/reload и неизменность памяти. Используются вымышленные данные и синтетический DeepSeek; весь unit/browser suite и личный live аккаунт этим не проверены. Точные ранние провалы и границы — начало CODEX-HANDOFF.
