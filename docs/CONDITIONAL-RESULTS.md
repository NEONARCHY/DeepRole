# RP297 — первый замер условных обязательств

Неизменённый RP296, новые авторские тексты: почта у вулкана и горная обсерватория,RU/EN. Conditional commitments без `I promise to`,completed-сосед рядом сopen,длинные/короткиеодноимённыепредметы,общийaliasдвухлюдей,отрицательноеобязательство иexplicitendedpermission. [Протокол](CONDITIONAL-EVALUATION.md), [firstreport](benchmarks/rp297-conditional-results.json), [seal](benchmarks/rp297-first-report-seal.json).

64inputs:38scored,20controls,6budget;176goldrecords,28uncertainty. Доcompilerfrozeninput/gold/protocol/ownrunner/helper/all410src:414hashes,separatefreeze/evaluate,wxfirstbaseline/report/seal,before-afterunchanged. Доfreeze schema-validation отклонила `ended` с неполным claim.value; только representation исправлено наvalue=text без изменения prose/gold. Первыйcompilerexecution выполнен уже после успешногоfreeze.

## Первый результат

**23/38запросов полны,138/176goldrecords;38пропусков в15запросах.** Integritycases0,falsecomplete0. Все28uncertaininputs имеютUIunverified;24/28такжеexplicitguard. Четыре guardgaps — толькоfree-reference.20controls,включаянеоднозначныйкороткийalias,защищеныguard/unverified.

| Семейство | Полных | Потеряно записей |
|---|---:|---:|
| Явное условное обязательство | 4/4 | 0 |
| Перефразировка | 0/4 | 8 |
| Составное действие | 0/4 | 12 |
| Ссылка на одноимённые вещи | 1/4 | 6 |
| Свободная ссылка на договорённость | 0/4 | 12 |
| Квалифицированный соседний предмет | 4/4 | 0 |
| Отрицательное обязательство | 4/4 | 0 |
| Отозванное разрешение | 4/4 | 0 |
| Scale600/2800/7500, явные вопросы | 6/6 | 0 |

По источникам:A0(условияобязательства)7пропусков,A1(доступ)15,A2(актуальноеместо)12,A3(незавершённость)2,B1(другаявещь/доступ)2. Во всех15неполныхзапросах отсутствует A1.

Ниодногоизмененияtext/kind/quote/task/claim/roles/revision/episode/timeStatus,дублей,superseded `old`/`b0`/`d1`,inputmutation,coldwarmdrift,ошибокwholemeterилиoptionaloverflow. CompletedB остаётсяcompleted,openA —open,временное разрешение —ended. Это сохранность переданных исходных привязок,не гарантия,что живая модель не перепутает правильно переданных кандидатов.

Budget отдельно:900теряет5/8gold(остаётся3/8)наRUEN;2800/5600теряют3/8(остаётся5/8). Большийбюджет не устраняет потери поиска. Budgetprobes вне38scored.

## Пример

«Я достаю красный штормовой фонарь и проверяю запасной; напомни оба набора ограничений» не получаетA0,A1,A2:доставка только после прекращенияпеплопада и подписи,ключ от ящика у смотрителя,приём перенесён вкаменныйангар. Условное обещание записано,но небыло отобрано вместе со всемиограничениями. Другойфонарь уже доставлен АлинеЮг;это не закрываетобязательство АлиныСевер. Статусы не переписались,но ответмодели всёравно может ошибиться из-за отсутствующихусловий.

## Следующая задача

Сохранить first23/38/gold/seal. Отдельныйfix15incomplete/4guards сSEENreport иoldRP296/RP295/RP292/RP289/RP287/RP283regressions. Доruntimeправки сохранитьRP296source snapshotsпо414hashes,переключитьhistoricalunitpinsпоним,неудалять. Проверить source-boundгруппыусловныхобязательств без `I promise to`: нынешний genericprefix привязан именнокявномуaffirmativeprefix. Это объясняет ограничение ветки,но не доказывает причину каждого пропуска. Не считать conditionalpromise выполненным по условномунаклонению/времени,невыводитьownerизкороткогоимени,не объединятьобычный/запаснойприбор вoneobject. Не расширять caps и не резатьусловия.

## QA и границы

68newauditchecks,369oldregressionchecks,492unifiedstrictchecks:929pass/0fail в29files. Старыйunified60/60/0gaps истарые34/34сохранены;онинеопровергаютновый23/38. TypeScript/diff0. Runtime/UIне менялись,fullunit/native/browser/liveзановонезапускались. SourceZIPисключаетtests,QA требуетGitcheckout.

Agent-authoredsyntheticacceptedmemory,неexternalblind/liveproof. Каркас/переводы/фон коррелируют,7500recordsне7500сыгранныхсцен. Conditional/tasks/rolesужеодобрены,неизвлеченыживоймоделью. Новыекейсытеперьseen. Installedcopy/миры/аккаунтнетронуты,pushнепросили. [QA](benchmarks/rp297-qa-results.json).
