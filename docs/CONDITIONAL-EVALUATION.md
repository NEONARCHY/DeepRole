# RP297 — условные обязательства, похожие предметы и отзыв разрешения

Новые авторские тексты для неизменённого RP296: почта у вулкана и горная обсерватория, RU/EN. Fixture не импортирует старые corpus/querymatchers/scorers; только типы и общий constructor принятой roleSeed. Проверка не является внешней слепой оценкой.

## Заранее заданные ожидания

Заголовки обязательств содержат «если…доставлю», «после…берусь», «когда…отвечаю», `If… I will`, `After… I undertake` и `Once… I take responsibility`, а не положительное `I promise to`. У первого участника задача open, у второго одноимённая задача completed. Два полных имени имеют одинаковый короткий alias; короткое имя не даёт выбрать человека по порядку в списке. Есть квалифицированный соседний предмет: запасной/малый прибор, содержащий короткое название основного. Отрицательное обязательство о тайне остаётся open. Временное разрешение explicitly ended, не текущая возможность.

Gold вручную по текстам:

- A0–A3: полные условия первого обязательства, доступ, актуальное место, незавершённость.
- B1–B3: отдельный предмет и завершённая доставка/установка; завершение B не закрывает A и не снимает его ограничений.
- C0–C3: квалифицированный соседний предмет, доступ, новое место, подготовка без выполнения.
- D0+D3: запрет разглашения и всё ещё закрытые сведения.
- D2+D3: отзыв временного разрешения и отсутствие права вскрытия/чтения.
- `old`, `b0`, `d1` superseded; их не выбирать.

Семейства scored: explicit-conditional=A; work-paraphrase=A; compound=A+C; same-label-reference=A+B; free-reference=A+B; qualified-neighbour=C; negative-duty=D0+D3; revoked-permission=D2+D3. Короткая ссылка требует всех буквальных кандидатов с separate source bindings, не доказанной уникальной identity. Controls: чужой promisor, неизвестный объект, raw-only bridge, неизвестный хвост, неоднозначный короткий alias; пустой gold не требует пустой выборки, но требует guard/unverified.

52maininputs по1500backgroundrecords плюс6scale600/2800/7500 и6budget900/2800/5600. Итого64inputs,38scored,20controls,6budget,176goldrecords,28uncertainty expectations. Scale только явные запросы; budget вне основной полноты. Порядок sourceevents отличает старое разрешение от отозванного.

## Неизменяемый первый замер

Отдельные `node scripts/story-search-conditional-audit.mjs --freeze` и `--evaluate`. До первого compilerexecution: schema/input/gold/свойrunner/protocol/helper ивсе410src фиксируются hashes. Firstbaseline/report/seal только wx. Before/after hashes одинаковы. После получения первого результата не менять runtime/query/gold в этой итерации. Возможный fix — отдельно seen.

Считать полноту scored и missinggold отдельно от kind/text/quote/task/claim/sourceRoles/revision/episode/lifetime/status integrity. Явное ended должно остаться timeStatus ended,completed не open. Проверять duplicates/superseded/inputmutation/coldwarm/meters/wholebudget,guard/coverage иfalsecomplete. Иные кандидаты не автоматически «смешение людей»: изменённая атрибуция — отдельная ошибка. Модель может неправильно использовать корректные кандидаты; этот тест её ответ не проверяет.

Каркас/переводы/фон коррелируют с методикой старых тестов, хотя тексты и ситуации новые.7500records не7500сыгранныхсцен. Роли и сложные условные обязательства уже приняты (при необходимости человеком), это не доказательство автоматического извлечения. Tests неliveDeepSeek,неstorage/native/lifecycle proof,неallpossibletexts/semanticunderstanding. Локальное время не SLA.
