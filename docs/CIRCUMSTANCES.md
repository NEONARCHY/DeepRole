# Завершение временных обстоятельств / Ending temporary circumstances

## Пример без настроек

Нора ждёт у моста. DeepSeek сохранил это как временное состояние. Позже в игре явно происходит: «Нора ушла с моста».

В том же обычном ответе DeepSeek может предложить завершение прежнего обстоятельства. Если предложение связано с точным ключом уже известного временного свойства, цитата есть в сыгранной сцене и проверка не выявила сомнений, выбранный автоматический режим сохраняет его. В режиме проверки оно ждёт подтверждения.

В «Память истории» → «Сводки эпизодов» появляется отметка **«Обстоятельство завершено в истории»**. В следующий запрос передаётся запись о завершении, а прежнее ожидание не передаётся как действующее. Исходная сцена у моста остаётся в хронике.

Это работает отдельно для каждого свойства. «Нора сняла пальто» может завершить состояние одежды, но не стирает знание пароля и не выполняет обещание починить ворота. Завершение занятия тоже не означает, что связанная задача успешно выполнена.

## Что сохраняется

- Переход времени, пропуск упоминания или просто новая сцена не закрывают обстоятельство самостоятельно. Последнее известное состояние может относиться к прежней сцене, но это другой смысл.
- «Нора не ушла», «Нора собирается уйти», «Нора сказала, что ушла» и неизвестная связь с прежним свойством требуют проверки. Поддержана ограниченная проверка слов о прекращении, уходе и снятии предмета; она не понимает произвольные условия или владельцев состояний.
- Если Нора снова начала ждать, DeepSeek может предложить явное возобновление того же свойства. Старое описание без отметки возобновления не возвращает завершённое обстоятельство автоматически.
- Отмена принятого завершения возвращает прежнее принятое состояние. Это отмена конкретного изменения, не перемотка всей игры.
- Перезагрузка, продолжение в другом чате, полная резервная копия и восстановление архива сохраняют статус и исходную цитату. Без проверенной связи с источником время состояния остаётся неизвестным.
- Старый лор и импортированные факты не переклассифицируются задним числом. Постоянные сведения, задачи, изображения и анкеты этим механизмом не удаляются.

Дополнительного запроса модели или отдельного переключателя нет. Полная запись, источник и пояснение учитываются в общем бюджете памяти. Техническая проверка сохранения и отправки не подтверждает качество извлечения настоящим DeepSeek. Произвольные условия вроде «ждёт до возвращения каравана», точный календарь и автоматические сроки годности ещё не реализованы.

## English

A literal played ending can replace the current value of one known temporary property. For example, “Nora left the bridge” can end the previously recorded waiting circumstance. DeepSeek proposes the exact existing property key and a source-backed ending in its ordinary reply. The selected accompaniment mode applies routine supported proposals automatically or holds them for review. Episode summaries show **Circumstance ended in the story**, and selected request memory identifies it as an ending, not a current activity. Original scenes remain in history.

Time, silence and scene changes alone never end a property. Lasting knowledge and open tasks are unaffected. Unknown links, future, conditional, negated or reported endings need review; the local lexical gate is bounded, not universal condition or ownership understanding. Explicitly played resumption requires an active progress proposal. Stale statusless active descriptions cannot automatically reopen an ended property; delayed batch extraction cannot overwrite a later ending.

Rejection/undo rebuilds the current value. Reload, continuation, full backup and archive restore preserve status and exact sources. Missing chronology stays unknown, and old imports are not backfilled. There is no extra model call, provider or setting. The whole-context budget includes metadata and guides. Arbitrary end conditions, calendar calculations and live-model extraction quality remain unverified or future work.
