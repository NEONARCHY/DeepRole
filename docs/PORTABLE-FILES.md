# Большие файлы мира и резервные копии

**Настройки → Файлы и защита → Экспорт** сохраняет один JSON. Отдельная папка фото не нужна. «Этот мир» переносит лор, анкеты и изображения; «Полная резервная копия» также переносит сохранённый игровой прогресс, историю и настройки.

Изображение, назначенное одновременно на аватарку, несколько эмоций и подборку селфи, записывается в файл один раз. Все назначения сохраняются. Фото не сжимаются и не уменьшаются при экспорте. Переносятся сохранённые версии: прежний отброшенный оригинал загрузки восстановить таким способом нельзя.

Во время подготовки показываются сбор данных, количество обработанных изображений и формирование файла. Большой экспорт собирается частями; большой импорт читает записи и изображения по отдельности. Лимита DeepRole на 200 МБ нет. Доступные память и место браузера всё равно конечны.

## Если экспорт не получился

- **EX-PHOTO**: одно из сохранённых изображений недоступно. Неполный файл не скачивается.
- **EX-LOCKED**: откройте сейф и повторите экспорт.
- **EX-MEMORY**: браузеру не хватило ресурсов при подготовке файла.
- **EX-HISTORY**: сохранённая история не прошла проверку связей.

В этих случаях исходная библиотека не удаляется. Сохраните код ошибки для диагностики. При обновлении замените файлы в прежней папке расширения, перезагрузите DeepRole на странице расширений и обновите DeepSeek. Удалять расширение для обновления не нужно.

## Совместимость и формат

Старые миры v1 и резервные копии v1–v4 продолжают читаться. Новые файлы с изображениями используют мир v2 / резервную копию v5: `records` хранит назначения на неизменяемые идентификаторы фото, `photos` — пары `{ id, image }` со всеми оригинальными данными. Это ссылки внутри одного файла, не на ваш компьютер. Перед импортом в другую установку обновите и её.

Импорт проверяет наличие каждого необходимого фото, отсутствие дубликатов идентификаторов и SHA-256 содержимого перед сохранением записей. Фото под неправильным идентификатором не подменяет существующее. Полная копия сохраняет идентификаторы истории; экспорт мира сохраняет прежнюю область переносимых данных. Пароль продолжает защищать всю копию, включая таблицу изображений; шифрование требует дополнительных ресурсов браузера.

## English

World and full-backup downloads remain one self-contained JSON. Each original image is embedded once, with all avatar/action/library/selfie assignments preserved. No recompression occurs. Files are assembled in parts; large imports parse records and photo entries individually. There is no DeepRole 200 MB quota, although browser memory and disk remain finite.

World v2 and backup v5 contain a `photos` table of `{ id, image }`, alongside compact record references. Old world v1 and backup v1–v4 files remain readable. Update the receiving installation before importing the new format. Missing/duplicate assets and mismatched content hashes are rejected before record replacement. Password protection includes the table and needs additional memory. EX-PHOTO, EX-LOCKED, EX-MEMORY and EX-HISTORY identify the export failure without exposing private image/lore data.

Verification uses synthetic data, including an Edge download/import/restore of a 280 MiB library with 24 characters and 40 originals. It does not inspect the user's installed library or account.
