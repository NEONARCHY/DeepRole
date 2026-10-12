# Один лор — одна игра / One lore, one game

## Автоматическая память

**«История → Сопровождение игры»** включает сохранение обычных фактов и дополнений анкет без дополнительных запросов. Проверки, цитаты и очередь спорных предложений сохраняются в общей игре при продолжении. [Примеры и ограничения / Examples and limits](AUTOMATIC-MEMORY.md).

## Как продолжать

У каждого лора одна актуальная игра: состав персонажей, объединения и псевдонимы, отношения, характеристики, выполненные события и ручной подбор памяти. Обновляет её один актуальный чат.

**Пример:** у Элис доверие 45, энергия героя 30. Вы выбираете этот же лор в новом пустом чате — значения остаются 45 и 30. Объединённые карточки тоже сохраняются; исходные дубликаты не возвращаются в список. Другой лор имеет свою игру.

- **«Продолжить в новом чате»** проверяет память, ждёт подтверждения, готовит сжимку последних сцен и только после этого открывает продолжение. Отмена или ошибка не завершают перенос.
- **Новый чат, созданный вручную:** выбор того же лора подключает общую игру. DeepRole передаёт сохранённые данные и ограниченный фрагмент последних сцен. Полная старая переписка сама не появляется в памяти нового чата; для подготовленного пересказа используйте кнопку продолжения.
- **Возврат в старый чат:** плашка ведёт в актуальный чат. «Продолжить здесь» делает старый чат актуальным с последними общими значениями. Если сначала написать обычное сообщение, DeepSeek получит просьбу один раз напомнить о переносе; следующее обычное сообщение возобновит игру здесь. Выполнение просьбы зависит от модели, плашка работает отдельно.

Неактуальный чат можно читать. Его запоздалые ответы не переписывают общую игру. Перед ручным изменением прогресса выберите «Продолжить здесь» в разделе «История». Расстановка панелей и портретов остаётся настройкой конкретного чата.

## Начать заново

В разделе **«История»** раскройте **«Начать игру заново»** и подтвердите сброс. Лор, исходные анкеты и фотографии сохраняются; отношения и показатели начинают с исходных настроек, текущая сцена очищается. Предыдущая игра архивируется. До первых новых изменений доступно **«Отменить начало новой игры»**. После изменения прогресса эта быстрая отмена недоступна; произвольный выбор старого архива в интерфейсе пока не реализован.

**«Новая исходная точка»** в журнале сцен закрепляет текущие значения для дальнейшей записи и сохраняет прогресс. Это отдельное действие, не сброс игры.

## Старые данные и резервные копии

При первом открытии старого лора выбирается подтверждённое продолжение, а при его отсутствии — последнее сохранённое состояние сцены. Несовместимые старые значения из разных чатов не складываются. Исторические записи сохраняются; тексты и возраст в лоре не переписываются.

- **Полная резервная копия** сохраняет общую игру, её архивы, историю и изображения. Используйте её для переноса прогресса на другое устройство.
- **Экспорт мира** сохраняет актуальные анкеты, имена, правила и изображения, включая объединённый состав. Достигнутые числовые значения, активный чат и история игры туда не входят. Импортированный отдельный мир начинает собственную игру.

Перестроенная сборка не обновляет установленную копию автоматически. Замените файлы в прежней папке расширения, перезагрузите расширение и вкладку DeepSeek. [Установка](../INSTALL.md).

## English

One lore has one shared game: its effective roster, merges, aliases, relationships, characteristics, completed events and memory selection. Only its current chat updates progress. Selecting that lore in another chat keeps the latest values. A different lore has its own game.

**Continue in a new chat** reviews memory, waits for confirmation and prepares a scene recap. Manually selecting the same lore connects saved progress and a bounded recent excerpt; it does not give DeepSeek the complete old conversation. Use the continuation workflow for a prepared recap.

An older chat shows a link and **Continue here**, which resumes from the latest shared state. Alternatively, its first ordinary message receives a one-time reminder request; the next ordinary message resumes here. Late replies in an inactive chat cannot overwrite progress. Layouts remain local to each chat.

**Start game over** archives progress and resets it to the original settings while preserving lore, original profiles and images. **Undo starting over** is available before new progress is saved. There is no general archive picker yet. **New checkpoint** only rebases scene recording and preserves progress.

Legacy migration selects the confirmed continuation, or the most recently saved scene when none exists; it never combines divergent scores. Full backups include shared progress, archives, history and images. World exports contain the effective roster, profile rules, starting settings and images, excluding played scores and chat ownership. Reimporting a standalone world creates a separate game.
