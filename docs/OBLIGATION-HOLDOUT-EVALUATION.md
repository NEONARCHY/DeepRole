# RP287 — протокол новой проверки долгов

Зарегистрирован до первого запуска compiler. Это новый agent-authored synthetic accepted-memory audit после RP286. Тексты и gold написаны по сюжетам без импорта предыдущих corpora, matcher, parser или результатов. Это не blind external test и не проверка ответа живого DeepSeek. Общий генератор, переводы и повторение фоновых сцен ограничивают независимость примеров.

## Фиксация

`scripts/story-search-obligation-holdout.mjs --freeze` сначала проверяет schema facts, role seeds, episode IDs, уникальность и gold, затем фиксирует fixture/protocol/runner/shared digest utility и ВСЕ src TS/TSX fingerprints. Compiler импортируется только в отдельном процессе `--evaluate`. Оба файла пишутся с wx; перезапись запрещена. Любое изменение manifest останавливает evaluation. Runtime остаётся RP286; улучшать его по ходу этого замера нельзя.

## Набор и gold

Театр, ботанический сад, радиостанция, регата; 4 новых сюжета, RU/EN. В каждом: два открытых возврата одинаково названной вещи разных владельцев с разными бирками/условиями, похожая вещь с завершённым возвратом, отдельный отменённый возврат, обещание ремонта/настройки и устаревшее место сдачи. Имена/коды/условия должны оставаться раздельными. Подготовка вещи не означает возврат.

96 main = 4 сюжета × 2 языка × 12 сценариев, за 720 фоновыми сценами. Семь положительных семейств: буквальный запрос первого долга, перефразировка, запрос второго владельца, два владельца вместе, завершённый возврат, отменённый возврат, короткая ссылка с exact accepted bridge. Пять controls: ссылка без bridge; ложный bridge только в raw recent; подмена владельца; несуществующая вещь; exact accepted bridge с неизвестным raw продолжением.

6 scale: 250/1500/5000 сцен × RU/EN, запрос двух долгов. 6 budget: 900/2200/5000 tokens × RU/EN. Итого 108 inputs: 62 scored positives, 40 controls, 6 budget probes. Это количество самостоятельных запросов, не 108 независимых миров.

Gold — явные source IDs и полные facts/source/roles из повествования: первый долг a0–a3; второй b0–b2; оба — объединение этих списков; completed c1/c2; cancelled d1/d2. Старая aOld и superseded open c0/d0 никогда не должны передаваться. Отсутствие superseded записей проверяется во всех inputs. Controls не получают gold по recall; budget omissions публикуются отдельно и не считаются semantic failure.

## Независимые показатели

1. Recall: все требуемые **целые** gold records найдены, отдельно missing records. Для каждого scored запроса требуемая совокупность имеет достаточно места в 16000-token бюджете. Дополнительные реальные кандидаты сами по себе не ошибка ownership.
2. Integrity: точные text/quote/kind/task/claim/roles/revision ID/episode/terminal statuses; отсутствие superseded/duplicate/fabricated records; исходный input/draft/canon не изменён; cold/warm output и coverage равны; whole transport budget и meter верны.
3. Uncertainty: для proved short reference и 5 controls полнота по смыслу не доказана, ожидаются `unverified` и explicit unresolved guard. Их отсутствие записывается **отдельно** как confidence/guard gap, а не выдуманная порча фактов. Дополнительно любой scored missing с coverage complete считается false-complete относительно этого gold. UI coverage само по себе не доказывает понимание смысла.
4. Статусы completed/cancelled должны остаться исходными; проверка не оценивает, что DeepSeek потом ответит словами. Роль promisor фиксируется из accepted источника, не выводится из одинакового имени предмета.

Первый report и отдельный seal сохраняются. Если обнаружены потери, следующий runtime fix получает отдельный seen report; ни fixture, ни gold, ни первый результат не меняются ради зелёных чисел. Предыдущий RP286 54/54 относится к уже знакомому RP283, проценты с новым набором напрямую не сравниваются.

## Запуск

Node 22, установленный Vite. Из корня репозитория:

```powershell
node scripts/story-search-obligation-holdout.mjs --freeze
node scripts/story-search-obligation-holdout.mjs --evaluate
```

Проверка работает только с вымышленными accepted facts; личный лор/браузер/модель/настройки не используются. Повторный запуск evaluation после первого report должен остановиться на существующем файле.
