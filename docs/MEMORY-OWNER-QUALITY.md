# RP241: проверка подбора по владельцу / Owner retrieval quality

## Что это даёт игроку

Можно написать «Напомни, что Нора обещала Мире», «Какие планы у Норы?» или «Каково мнение Норы?». Подтверждённая запись с Норой как владельцем обещания, плана или мнения получает больший приоритет, чем запись, где Нора только адресат или упомянута. Поиск использует однозначные имена, короткие формы и псевдонимы. Новые кнопки и дополнительные запросы DeepSeek не нужны.

Переименование работает по сохранённому ID: после переименования Норы в Еву можно спросить о Еве, а исходная цитата останется с историческим именем. Запрос сам не создаёт доказательства. Старая игровая память без подтверждённой связи остаётся с неизвестной личностью.

«Что она обещала?» не выбирает персонажа по полу или последнему упоминанию. «Нора сказала, что Мира обещала» не становится обещанием Норы. Совместные и неоднозначные запросы не получают специального бонуса владельца; обычный поиск памяти продолжает работать. Условия и исходные цитаты не переписываются. Здесь определяется только явно названный владелец; отдельного фильтра по адресату пока нет.

## Измерение на фиксированном наборе

Набор находится в tests/fixtures/story-owner-quality.ts, проверки — tests/story-owner-quality.test.ts. Это вручную размеченные регрессионные примеры, не оценка всех формулировок или ответов живой модели.

| Группа | Результат |
| --- | --- |
| 42 явных RU/EN запроса: обещания, планы, убеждения | Прежний reader: 10/42; новый query helper: 42/42 |
| Подбор первой записи среди владельца, адресата и простого упоминания | 42/42 правильных первых кандидата |
| 46 запросов с местоимениями, отрицанием, цитатами, условиями, совместными владельцами и подделкой внутренних меток | 46/46 без выдуманного владельца |
| 18 исходных цитат: прямые, пересказанные, условные, отрицательные, с несколькими голосами | Прежний и новый reader совпадают с разметкой во всех 18 |

Дополнительно проверяются коллизии форм имени и псевдонимов, чужой мир, сохранённое неизвестное происхождение, RU/EN переименование и единый бюджет запроса. Всего 111 новых автоматических проверок.

## Implementation boundary

story-owner-query.ts interprets only the current explicit query. createStoryRoleReader uses its result for the existing +40 same-owner / -12 other-owner / 0 unknown score. read/status delegate to createStoryRoleReaderV1 with the existing stored binding callback. Version-1 source grammar, frozen rosters, persisted IDs, validation and canonical facts are unchanged. The helper never backfills historical ownership, resolves pronouns, proves completion/truth or adds a model call. Literal input cannot spoof generated name tokens.

The measured gains apply to this curated corpus, not arbitrary semantic retrieval. Pronouns, complex reported ownership, earlier unbound facts, unconfirmed/late transport pairs, semantic comparison and large-history scaling remain open RP-05/RP-07 work. Request payload delivery is separate from correct model use.
