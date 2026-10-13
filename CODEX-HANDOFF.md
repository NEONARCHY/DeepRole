# Передача Codex — 13 октября 2026

## Продолжение на другом компьютере после pull

Полный срез сегодняшней работы: [docs/HANDOFF-2026-10-13.md](docs/HANDOFF-2026-10-13.md). Прочитать его и верх ROADMAP перед следующей реализацией. Текущая точка — UX238, не старые RP-04 next steps из исторических разделов. Последний запрос пользователя разрешает commit/push всех сегодняшних изменений и требует сохранить передачу; следующие push не делать без нового разрешения.

Следующая реализация: UX-02 — понятный первый запуск и экран «Игра» со следующим действием для пустого мира, неподключённого чата, выключенной автоматической памяти и нормальной игры. После этого UX-03/04 — редакторы и память игры. Не возвращаться к shape-подтверждению четырёх разделов: пользователь уже продолжил реализацию. RP-05–08 остаются открытыми; UX не разрешает менять лор или backend памяти.

Сборка для установки: downloads/DeepRole-Edge-UX-settings-20261013.zip. Пользователь должен обновить установленную копию и вкладку самостоятельно, сначала сохранив резервную копию. После смены компьютера пути проекта определять заново, не использовать домашний абсолютный путь из этой машины как рабочую директорию.

При упаковке передачи 13 октября source ZIP дополнен AGENTS/дневным срезом/актуальными handoff и roadmap;531 исходный файл сверён SHA256, runtime ZIP23/23 без изменения кода после UX238. Повторный TypeScript прошёл. Точные ветка/commit и успешность синхронизации проверяются Git после pull; не публиковать заново только из-за исторических строк «нового push нет» ниже.

## Текущая точка: UX238 — навигация и оглавление настроек

Пользовательское «дальше усиливает UX/UI (финальный промпт)» принято как подтверждение структуры. Реализованы новые RU/EN navigation-i18n и SettingsNavigation/css; SettingsView default home, группированные объяснённые переходы, advanced memory/diagnostics, отдельная диагностика вместо блока внутри data. Bottom nav: Play/Worlds/Story memory/Settings. Формы оставлены mounted+hidden для черновиков. Не менять это на remount при переключении. Мировые и общие области в hints различаются; навигация ничего не сохраняет. Никакого backend/data/defaults изменения. Отключена entrance animation только Settings page.

QA:204 files/3290 unit pass/5 прежних todo; TypeScript pass.52 distinct browser scenarios pass/10 expected installed-Firefox skips: RUEN320/900/1100,keyboard/scoped axe, помощь, настройка reasoning/reload, actions, world tuning isolation/newer edits, installed diagnostics4 и story alternatives/edit/undo/reload/two tabs2. Последние4 installed settings cases подтвердили unsaved budget3333 survives category changes при unchanged stored settings. Свои contexts закрыты. Первоначальные12 failures расширенного набора были stale test labels/internal neutral; исправлены только expectations, повтор26-case группы22pass4skip. Механически обновлены old nav selectors в E2E и helper openSettingsSection; Playwright --list2182cases/173files загружается, но весь набор не запускался. Не заявлять live model/full E2E/screen-reader coverage.

Chrome/Firefox/source пересобраны и SHA256 каждого включённого файла проверен:23/23/530. Канонические downloads ZIP обновлены; актуальный Edge архив:downloads/DeepRole-Edge-UX-settings-20261013.zip. Large-chunk warning остаётся RP-08. Пользователю дать работающую сборку с просьбой backup/update+reload. Весь UX-01–07 не закрыт: UX-02 first-run/game и UX-03/04 editor/memory следующий приоритет. RP-05–08 тоже открыты. Не обещать идеальный/бесконечный продукт и не менять его память ради оболочки. Предыдущие dirty edits сохранены, нового push нет.

## История планирования UX до реализации UX238

Пользователь просит понятную иерархию всего расширения для новичка, минимум вмешательства в игру, разделение главных/второстепенных/служебных действий. Начальная source-level сверка и предложенный UX-01–07 план сохранены в верхней секции ROADMAP.md. Предложена навигация «Игра / Миры / Память игры / Настройки» с сохранением AXIS-2 без liquid glass. Не утверждать, что дизайн уже реализован: в этом ходе нет UI edits, rendered audit, новой сборки или изменений backend. Последний проверенный архив — RP237 ниже.

Сначала получить подтверждение предложенной структуры по shape workflow; далее UX-01 mapping всех существующих функций и UX-02 работающий первый экран. Нужные ошибки, конфликты и блокировки не прятать; детали протокола/диагностики не делать повседневной обязанностью игрока. Лор, память ветви, scene state и глобальные настройки не смешивать. Использовать существующие токены/общие компоненты, RU/EN и narrow-layout проверки. Прежние dirty изменения сохраняются, push не разрешён. RP-05–08 остаются открытыми; UX-track не повод заявить их закрытие.

## Текущая точка после RP237

Финальное девятое продолжение RP229–RP237. Итоговая инструкция: docs/RP05-CHECKPOINT.ru.md (простые примеры, действия пользователя и реальные gaps). Основной RP-05 checkbox reasons/saved/selected/delivered/model-use отмечен [x] по RP231/232; broader cross-turn repetition остаётся [ ] с подитогом RP235/236. RP-05 НЕ закрыт целиком; speaker/owner bindings, semantic retrieval comparison, full incremental classification/source-backed summaries и cross-turn safeguards ещё открыты. RP-06–08 не закрывать по локальным частичным сценариям.

Текущий turn — audit/documentation без новых application code edits. В startup-runtime test исправлен Brave standalone-menu wait: 5s → 12s при прежнем независимом 8s cold-read deadline. Первый расширенный прогон дал 20 pass/2 failures/22 expected installed-Firefox skip; обе failures были на этом 5s assertion. Полный повторный прогон прошёл22 pass/22 предусмотренных skip, результаты — верх ROADMAP. Первая отдельная installed browser группа14 pass/6 expected installed-Firefox skip: RP02 reviewed-memory after quiet turns/alternative/strict-send плюс RP04 lifecycle/attribution/refs, common budget/100 profiles/names, receipts/HTTP500/new-chat, RUEN320/900 keyboard/Axe. Synthetic server/isolated profiles only, no personal account/external model requests. Все собственные контексты закрываются finally.

Финальная QA RP237: полный повтор дополнительной группы22 pass/22 expected installed-Firefox skip; обе Brave проверки прошли. Вместе с первой группой36 browser pass/28 skip. Общий unit-прогон203 files/3286 pass/5 прежних todo, TypeScript/diff-check без ошибок. No live-account/full native-server coverage. Chrome/Firefox/source пересобраны и проверены SHA256:23/23/527 файлов. Актуальный архив:downloads/DeepRole-Edge-RP05-checkpoint-20261013.zip; канонические ZIP обновлены. Large-chunk warning остаётся RP-08. Нового push не было.

Дальше: сначала пользовательская проверка свежей сборки после backup/update + one-time Automatic memory (если ещё не enabled); затем замеренный attribution/retrieval quality slice RP-05, не тяжёлая новая архитектура в один ход. Не угадывать pronoun owners, не обещать native context infinity, не внедрять внешний provider без выбора. Push без запроса не делать; прежние dirty изменения сохраняются. Последний код RP236 остаётся baseline этого checkpoint.

## Текущая точка после RP236

Актуальный архив: downloads/DeepRole-Edge-compact-protocol-20261013.zip. Финальная QA: 203 unit-файла, 3286 pass/0 fail/5 прежних todo, targeted42 pass, TypeScript/diff-check без ошибок, browser12 pass/4 expected installed-Firefox skip. Chrome/Firefox/source пересобраны; ZIP SHA256 проверены:23/23/526 файлов, канонические копии обновлены. Live account/native server/full E2E не проверялись; контексты закрыты. RP-05 открыт, установленная копия сама не обновляется, нового push не было.

Уточнение RP235: sourceQuoteRef не записываются в canonical StoryFact или reusable source table. Исторический dispatch journal сохраняет exact outgoing context string вместе с локальными refs; это не live authority и не permission использовать таблицу прошлого запроса. Не утверждать абсолютное отсутствие refs в любых persisted bytes.

Восьмое продолжение серии; осталось одно. storyUpdateInstruction optional fifth factPolicySupplied применяется только в compact branch; дефолт false, full legacy unchanged. Unified compiler получает accompaniment один раз, выставляет флаг только when nonempty + world.policy mode automatic/review; absent/off retains complete fact schema/evidence clause. Core compact kind definitions усилены: promise NOT fulfillment, plan NOT completion, belief NOT objective truth. Scope/version2/ops/known goals/present-partners/numeric-selfie/OOC/identity ограничения прежние.

formatStoryFacts optional third typesSupplied применим только compact. Unified compiler passes !!input.story, так как current story_update_mode действительно в этом же render. Compact header не повторяет kind definitions, но task.status semantics, original dates/latest claims, attribution/sourceQuote/ref guides остаются. Default standalone and full format самодостаточны. Не выставлять флаги на основе сохранности прошлых сообщений/native контекста. No DB/schema/parser/retrieval/approval changes, no extra POST; полная защита ручных профилей/quoted evidence/claims/tasks остаётся в текущем accompanying policy.

tests/story-protocol-compaction.test.ts:6 cases automatic/review, absent/off, default/full legacy, kinds+status+source attribution preservation and token estimate reduction. Targeted42 pass. Installed lifecycle adds duplicate-schema/kind-absence + NOT fulfillment/completion/objective truth assertions across actual next POST; финальная QA/архив — верх ROADMAP. RP-05 открыт: speaker/owner binding, broader quality, native continuation/performance gaps не объявлять закрытыми. Следующее — финальная сквозная сверка этой серии и честное разделение implemented vs pending перед RP-06. Push без запроса не делать; предыдущие dirty изменения сохранены.

## Текущая точка после RP235

Актуальный архив: downloads/DeepRole-Edge-shared-evidence-20261013.zip. Финальная QA: 202 unit-файла, 3280 pass/0 fail/5 прежних todo;6 новых targeted cases, TypeScript/diff-check без ошибок; browser12 pass/4 expected installed-Firefox skip. Chrome/Firefox/source пересобраны; ZIP SHA256 проверены:23/23/526 файлов, канонические копии обновлены. RP-05 открыт, установленная копия сама не обновляется, нового push не было.

Седьмое продолжение серии, осталось два. core/story-fact-context storyFactPayload собирает selected storyFactHint, exact quote→first earlier index map. Только дополнительные sourceQuote (quote!=text) могут стать sourceQuoteRef integer. Target всегда earlier fact с full sourceQuote, без chained refs и без references к предыдущим запросам. Recompute per render; no schema/DB change, no global cache or native-history deletion. Нельзя дедуплицировать авторский лор/профили или normalize цитаты ради экономии.

Shared payload применяется только если estimateTokens(encodedJSON+STORY_QUOTE_REFERENCE) строго меньше inlineJSON; short evidence остаётся inline. Full/compact envelopes добавляют локальное ref объяснение only for shared; full-render admission учитывает JSON+guides и keeps quote whole. safeJson сохраняет escaping '<'/'>', JSON reconstruction literal exact. Оригинальные task/claim/kind/text/quote поля не переписываются, scoring/status/scope прежние.

tests/story-quote-sharing.test.ts:6 cases exact round-trip, inline fallback, not normalized, order/removal/edit/fresh-request, protocol markers, fixed whole request budget retaining3 facts vs oversized inline. Предварительные targeted41 pass до добавления последнего compiler case; отдельно6 pass. Installed lifecycle adds second promise и exact общий long source с условиями; после reload в eighth manual POST refs указывают на full sourceQuote earlier факта. Browser12 pass/4 expected installed-Firefox skip, UI RU/EN320/900 keyboard/Axe, свои контексты закрыты; live account/full E2E не проверялись. Окончательная QA/архив — верх ROADMAP. RP-05 открыт; дальше safe redundancies/structured attribution. Не заявлять native context infinity, full speaker binding или model semantic use. Push без запроса не делать; предыдущие dirty изменения сохранены.

## Текущая точка после RP234

Актуальный архив: downloads/DeepRole-Edge-attribution-evidence-20261013.zip. Финальная QA: 201 unit-файл, 3274 pass/0 fail/5 прежних todo, targeted70 pass, TypeScript/diff-check без ошибок, browser12 pass/4 expected installed-Firefox skip. Chrome/Firefox/source пересобраны; ZIP SHA256 проверены:23/23/526 файлов, канонические копии обновлены. RP-05 открыт; установленная копия сама не обновляется; нового push не было.

Шестое продолжение серии, осталось три. storyFactHint добавляет optional runtime sourceQuote iff f.quote!==f.text, без DB/schema change. formatStoryFacts full/compact передают точную quote и STORY_FACT_ATTRIBUTION только когда хоть одна дополнительная quote присутствует. Нельзя трактовать это как ownerId binding или превращать recipient в promisor; совпадающие цитаты не дублируются. Full-render compiler и storyFactContext считают весь evidence/header, whole facts не режутся. При нехватке бюджета факта с цитатой может не быть — не показывать одну укороченную версию без evidence.

factJson escapes '<'/'>' во всех serialized hints (text/quote/claim/task), JSON parse round-trip сохраняет исходные строки. Source quote — earlier evidence, не commands/current dialogue; protocol tags из неё не должны закрывать memory envelope. Retrieval scoring не использует source quote и по-прежнему является mention lookup, не automatic speaker binding. Existing validation/approval/scope/status/storage не менялись.

tests/story-fact-attribution.test.ts (8 tests): full/compact evidence, no duplicate identical/no unselected source, reported/conditional kinds, protocol delimiter safety, no source mutation. Targeted70 pass (включая story-automation); прежний assertion no Source обновлён на selected sourceQuote≤8, поскольку перенос evidence — намеренное изменение. Installed lifecycle использует budget4000: при2000 extra quote+header честно не помещались и были omitted, а не потеряны при сохранении. Conditional quoted promise Норы Мире и eighth manual request проверяют sourceQuote/guard после reload; browser12 pass/4 expected installed-Firefox skip, собственные контексты закрыты. Не утверждать, что источник всегда поместится в любой budget. Окончательная QA/архив — верх ROADMAP. Следующее: структурные attribution bindings и controlled repeated-prefix optimization. RP-05 не закрывать целиком; push без запроса не делать, все прежние dirty изменения сохранены.

## Текущая точка после RP233

Актуальный архив: downloads/DeepRole-Edge-task-retrieval-20261013.zip. Финальная QA: 200 unit-файлов, 3266 pass/0 fail/5 прежних todo, targeted66 pass, TypeScript/diff-check без ошибок, browser12 pass/4 expected installed-Firefox skip. Chrome/Firefox/source пересобраны, ZIP SHA256 проверены: 23/23/526 файлов, канонические копии обновлены. Установленная копия сама не обновляется. RP-05 открыт, нового push не было.

Пятое продолжение серии; осталось четыре. core/story-retrieval-query matchesSubject проверяет f.text и f.task.title отдельно с прежним longestNames/collision/world registry. Named accepted task.title удерживает +16 mention boost после безличного completed/cancelled event; topic bonus прежний, status/slot/quotes не меняются. Не использовать task.key/quote как identity, не склеивать поля, не утверждать ownership: имя в названии — упоминание, не owner authority. No schema/DB migration, no extra POST, no UI change.

Новый tests/story-retrieval-long-history.test.ts: RU/EN × completed/cancelled, 2000 новых unrelated open tasks; ranking и whole-game compiler находят старый terminal, удаляют obsolete open slot, бюджет≤3000, фактов≤8, inputs unchanged. Negatives nested/shared names, keys/quotes, field boundary, title/alias edits. Targeted66 pass. Installed lifecycle обновлён: title — literal full-name promise clause в quote, impersonal done, next POST/reload/alias/given-name сохраняют terminal. Первоначальная colon-title fixture была отклонена existing literalEvidence: production validation НЕ ослаблялась. Browser12 pass/4 expected installed-Firefox skip, 7 ручных POST lifecycle без лишних сообщений, UI RU/EN320/900 keyboard/Axe. Контексты закрыты; live account/full E2E не проверялись. Финальная QA/архив — верх ROADMAP после завершения.

Следующее: более широкие attribution/quality checks, speaker/owner bindings (полной поддержки местоимений всё ещё нет), безопасное уменьшение repeated added context. Не закрывать RP-05 целиком и не обещать расширение native контекста или AI semantic search. Push без запроса не выполнять, прежние dirty изменения сохранены.

## Текущая точка после RP232

Актуальный архив: downloads/DeepRole-Edge-memory-delivery-20261013.zip. Финальная QA: 199 unit-файлов, 3260 pass/0 fail/5 прежних todo; 61 целевой pass, TypeScript/diff-check без ошибок, browser12 pass/4 expected installed-Firefox skip. Chrome/Firefox/source ZIP пересобраны, содержимое SHA256 проверено: 23/23/526 файлов; канонические копии обновлены. Large-chunk warning остаётся RP-08. Установленная копия сама не обновляется.

Четвёртое продолжение серии, осталось пять. Добавлен отдельный historical MemoryDeliverySummary в PageWidget+sidepanel. core/memory-delivery-view выбирает последнюю valid local user-turn capture по createdAt в exact world/binding/chat, не по updatedAt старого ответа; ties unavailable. Restored/OOC/service/invalid/foreign excluded. Это не current-game/branch authority: UI явно допускает прежнюю игру/вариант ответа. Game-managed captures не имеют storyBranchId; не создавать post-hoc связь. Нельзя переименовывать текущий selection.contextReport в sent.

View передаёт только at/stage/injection/optional proven context/responseInterrupted. Original draft, новый reply, native IDs, wire и error payload не передаются отдельными полями. Exact context может содержать private lore, старые реплики и protocol identifiers: не объявлять весь view sanitized report. injection=context proof означает exact whole outgoing string equality в существующем journal; source-confirmed отдельно от started, HTTP accepted отдельно от model use и reply completion. Лор в textarea — private user data, не safe report; ленивое раскрытие, readOnly, RU/EN/Intl date. Content читает уже загруженные dispatch records, current scope getter исключает locked/service/missing world/binding mismatch; lock очищает массив. DR_PAGE_STATE опционально передаёт view, sidepanel очищает вместе с PageState.

Точечное обновление receipt: optional onUpdated callback StoryDispatchCaptureClient после успешных prepare/source/packet writes; ошибки UI не мешают source ACK. Content читает один dispatch через repository.get, не вызывает reload/updateContext и не меняет journal/library notifications. Async generation + URL/chat/world/binding/locked guards блокируют опоздавшие результаты. Dispatch-only writes намеренно не announceLibraryChange: не включать полный reload для обновления панели.

61 целевой test pass; browser 12 pass/4 expected installed-Firefox skip. Фактический POST RU/EN: verified prefix равен отправленному, HTTP500→failed, reload сохраняет receipt, новый чат не получает чужой; ровно5 ручных POST, без дополнительных сообщений, исходные100 анкет сохранены. GUI RU/EN320/900 keyboard/Axe, два PNG просмотрены, контексты закрыты. Live account/full E2E не проверялись. Финальная QA/архив — верх ROADMAP после завершения. Следующее: quality benchmark долгой истории, owner/speaker binding и repeat optimization; RP-05 открыт. Push без запроса не выполнять. Все предыдущие dirty изменения сохранены.

## Текущая точка после RP231

Актуальный архив: downloads/DeepRole-Edge-memory-explanations-20261013.zip; канонические Chrome/Firefox/source обновлены. 3251 unit pass/5 прежних todo (198 файлов), 30 целевых pass, TypeScript/diff-check без ошибок. Browser 12 pass/4 expected installed-Firefox skip: nested reason disclosure/preview disclaimer RU/EN 320/900 keyboard/Axe, два PNG просмотрены; установленный Edge бюджет/100 профилей/имена + lifecycle/tasks/conflicts/alias/short-name, без лишних POST. Свои контексты закрыты, личный аккаунт не использован. Следующее — отдельный request-bound delivery view по dispatch evidence; не менять preview на Sent без него. RP-05 открыт; нового push не было.

Третье продолжение серии, пользователь ожидает ещё шесть. Первая часть why selected: GameContextReport.explanation optional runtime numeric counters draftFacts/recentFacts/openTasks/recentFallback, классификация лишь после admission selectedFacts, сумма ==selected.facts, metadata не входит в prompt. Нет новых persisted данных или source quote/name/ID в report. RU/EN ContextBudgetSummary в PageWidget+sidepanel принимает entries отдельно для локального UI; native details показывает первые8 titles и локализованные нормализованные причины, а не raw keywords/IDs. Режимы Always/manual, words/title/name, focus/entity, linked; неизвестное не выводится raw. UI cap не ограничивает memory selection.

Экран явно selected-memory preview, stored≠included, not confirmation of sending, recomputed before sending, how model uses unknown. Причины анкет/whole continuation generic; поддержан legacy report без explanation. Не считать текущий selection.contextReport последней подтверждённой отправкой. Отдельной Sent-history панели пока нет: следующее — читать request-bound dispatch evidence, проверять scope/world/chat/branch, различать proposed/actually submitted/server accepted/failed и никогда не обещать semantic use. Нельзя основывать Sent только на compile или наличии assistant reply.

tests/context-explanation.test.tsx: counters/omitted/no private report strings/no prompt additions/RUEN/raw-reason masking/8-item cap/legacy; context-budget-ui обновлён для nested disclosure keyboard, preview disclaimer и Always reason. 30 целевых pass, TypeScript без ошибок; актуальная финальная QA/архив — верх ROADMAP. Все прежние dirty изменения сохранены, push без запроса не выполнять. RP-05 ещё открыт.

## Текущая точка после RP230

Актуальный архив: downloads/DeepRole-Edge-character-reference-selection-20261013.zip, канонические Chrome/Firefox/source обновлены. 3246 unit pass/5 прежних todo (197 файлов), 77 целевых pass; TypeScript/diff-check без ошибок. Browser 12 pass/4 expected installed-Firefox skip; установленный Edge RU/EN проверил настоящий POST без чужой анкеты/description при nested full-name query, ambiguity guard и 4 ровно ручных POST, сохранив 100 профилей. Прежние lifecycle/alias/short-name проверки прошли; GUI RU/EN 320/900/Axe/keyboard, два PNG просмотрены. Свои контексты закрыты, личный аккаунт не использован, полного E2E не было. Установленная копия сама не обновляется; RP-05 открыт. Следующая итерация — причины выбора и stored/selected/sent различие.

Второе продолжение новой серии; осталось семь по последнему сообщению пользователя. RP-05 продолжается. storyRetrievalQuery возвращает mentionedIds (unique registry ownership, включая уникальный alias даже при duplicate canonical name) и ambiguousName (matched non-pronoun longest phrase с несколькими владельцами). Game compiler использует IDs для selectCharacterContext optional final arg и resolvedMentionIds в compileMemoryWorkspace/rankMemories. Старые scalar mentionsCharacter/legacy callers без registry не переписывались. Физические участники/player/partners/focus независимы от mention lookup; прежняя защита optional request roster budget сохранена.

runtimeMemoryDocuments принимает resolvedMentionIds, исключая ложную required entity description при Ann Lee→Ann overlap. Entity-linked score boosts используют те же IDs; scope через expandFocus/world проверяется каждый раз. compileMemoryWorkspace материализует iterable один раз до projection/ranking. Неперсонажные ссылки (groups/locations) остаются через mentionedEntities, group members раскрываются для roster reference, не устанавливают presentIds и не пишутся в базу. Неоднозначный запрос получает AMBIGUOUS_STORY_NAME в required render, даже без story если есть обычный scene scope; referenceOnly выключает registry/guard.

tests/character-reference-selection и game-context покрывают nested full vs short, ambiguity/no order choice, preserved actual cast/partner/focus, legacy, iterator, groups; 77 целевых pass. game-context-runtime RU/EN дополнен off-scene Ann/Ann Lee, actual POST без чужого profile/description и ambiguous short-name guard, ровно четыре ручных POST; исходные 100 анкет сравниваются с сохранёнными. Следующее — причины выбора и stored/selected/sent различие, quality benchmark/speaker bindings/repeat optimization. Keyword/title heuristic отдельных lore entries пока не является строгой привязкой к человеку. Актуальные проверки/архив — верх ROADMAP. Прежние dirty изменения сохранены; push без запроса не делать.

## Текущая точка после RP229

Актуальный архив: downloads/DeepRole-Edge-reference-search-20261013.zip; канонические Chrome/Firefox/source обновлены. 196 unit-файлов/3237 pass/5 прежних todo, 56 целевых pass, TypeScript/diff-check без ошибок. Browser 12 pass/4 expected installed-Firefox skip: Edge RU/EN next-POST после completion/resolution + Keeper alias + unresolved her/её + короткое Mira/Миры для Mira Vale/Мира Вейл, ровно 7 ручных POST, исходная реплика не изменена; общий бюджет/100 профилей. GUI обоих языков/320/900/клавиатура/Axe, два PNG просмотрены. Все свои контексты закрыты; живой аккаунт и весь E2E не проверялись. Установленная копия сама не обновляется. RP-05 открыт; нового push не было.

Первый из новой серии девяти продолжений (пользователь ожидает ещё восемь). RP-05 продолжается: core/story-retrieval-query делает query-only exact unique alias/name expansion в текущем мире; duplicate canonical names тоже не расширяются. score +4 для распознанного RU/EN типа (promise/task including terminal, plan/task, belief, secret), +16 для факта с точным однозначным именем/алиасом явно названного человека. Это упоминание, не вывод владельца/говорящего. Старый rankStoryFacts без scope сохраняет прежние scores; game compiler передаёт scope только для текущего draft. Recent fallback остаётся прежним и не получает это усиление.

Уточнение пользователя: полное имя с фамилией НЕ должно быть обязательным. Добавлены runtime given-name формы для conventional multi-part proper names и RU формы однословных имён на а/я. Общая owner map учитывает явные и выведенные формы; shared first names не назначаются произвольно. Canonical uniqueness отдельно проверяется по explicit names/aliases: уникальный псевдоним может отличить человека Ann от Ann Lee, даже если короткое Ann неоднозначно. Longest-name защита действует в запросе и самом факте. Однословные personal pronouns как названия/алиасы не дают автоматической привязки. Полная морфология/любые nickname guesses не объявляются готовыми; inferred forms не пишутся в базу. Scope теперь также scene.worldId при профилях без story; referenceOnly исключён. Поисковый draft используется в compileMemoryWorkspace и selectCharacterContext, настоящий draft и canonical records остаются прежними. Lifecycle RU/EN — 7 ровно ручных POST, включая Keeper, her/её и Mira/Миры после reload.

При распознанной теме и personal reference добавляется короткий deeprole_reference_guard: NOT resolved, кандидаты не доказательство принадлежности, не объединять обязательства. Guard в required общем бюджете, no profile/service без story. Никакой подмены draft, gender guessing, first/last recent name binding, persisted writes или дополнительного POST. Факт/цитата/claim/task остаются исходными. tests/story-retrieval-query — 12 фиксированных positive misses baseline → correct top1, отрицательные shared aliases/world/substrings/duplicate names/mutation; game-context сохранение обеих promise candidates, guard budget и off-scene профиль по короткому имени; lifecycle-runtime RU/EN дополнен alias, pronoun и short-name запросами после reload, 7 ровно ручных POST. Актуальный результат — верх ROADMAP.

Следующее — закончить оставшиеся RP-05: проверяемые speaker/participant bindings, quality comparisons/reasons и repeat optimization, затем RP-06. Нельзя представлять текущую lexical эвристику как полное понимание любого лора или завершённый pronoun resolver. Прежние dirty изменения сохранены; push без запроса не выполнять.

## Текущая точка после RP228

Актуальный архив: downloads/DeepRole-Edge-fact-search-20261013.zip; канонические Chrome/Firefox/source обновлены. Полный unit 3207 pass/5 прежних todo, 51 целевой pass, TypeScript без ошибок; выбранный browser 12 pass/4 expected installed-Firefox skip, GUI обоих языков/320/900 и установленный Edge next-POST после completion/conflict resolution. Все свои контексты закрыты, живой аккаунт не использован. Установленная копия сама не обновляется; полного RP-05/semantic retrieval здесь нет.

Первый lexical layer игровых фактов: core/story-fact-search-index WeakMap по исходному StoryFact хранит лишь text/claim.key/task.title и synthetic MemoryEntry. rankStoryFacts использует compactStoryFactSources (исходные identities) для индекса и cleanStoryFact для возвращаемых независимых копий. compactStoryFacts сохраняет прежний copy contract через sources.map(cleanStoryFact). Порядок latest slots/replaces вычисляется каждый раз, open bonus берётся из текущего source.task.status; цитаты/статусы/выбор ветки не кэшируются. После reload библиотеки новые source objects намеренно получают новый индекс; ускорение постоянного кэша между перезагрузками не обещать.

tests/story-fact-search-index содержит 1000-факт reuse, parity с прежним cold scorer, in-place edits, статус/цитаты, независимость returned copies, latest claim/human replacement/undo и supplied branch isolation. Это оптимизация CPU разбора, не улучшение semantic quality. Следующее — измеримые сложные случаи поиска/неоднозначные ссылки, полная incremental classification и безопасное сокращение повторов; далее RP-06. Актуальные проверки/архив — верх ROADMAP; прежние dirty RP226/227 сохранены, push не выполнялся.

## Текущая точка после RP227

Актуальный архив: downloads/DeepRole-Edge-incremental-search-20261013.zip; канонические Chrome/Firefox/source обновлены. 3196 unit pass/5 прежних todo, 44 целевых pass, TypeScript без ошибок; выбранный браузерный набор 10 pass/2 expected installed-Firefox skip. GUI RU/EN 320/900 и фактические установленные игровые POST RU/EN проверены синтетически; личный аккаунт не использован. Все свои контексты закрыты. Установленная копия сама не обновляется. RP226 незакоммиченные изменения сохранены, нового push не было.

RP-05 продолжен первым инкрементальным lexical layer: core/memory-search-index.ts, используемый scoreMemory, хранит WeakMap по MemoryEntry object. Сравнивает фактические title/content/keyword values, а не updatedAt; переиспользует неизменённые компоненты. Другой объект с тем же ID не получает чужой индекс. Нет persistent cache, API, изменения score/reasons или кэширования selections. Проверки scope/disabled/book/manual/excluded выполняются каждый раз.

memory-workspace titleIndexes теперь проверяет снимок scoped enabled записей (ID/title/content/copied keywords), поэтому та же array identity после правки/замены/добавления/удаления не оставляет старую name association. При изменении классификация имён пока пересчитывается целиком; это не полный инкрементальный индекс. compactStoryFacts создаёт новые объекты и его ускорение этим слоем не объявляется готовым. Следующее — измеримые случаи более точного поиска, индекс игровых фактов/классификации, неоднозначные местоимения и сокращение повторов без предположения о сохранности старого native context. Подробные проверки и актуальный архив — верх ROADMAP.

## Текущая точка после RP226

Первый бюджет RP225 и его проверка/упаковка завершены вместе с исправлением запуска RP226. Текущая сборка: downloads/DeepRole-Edge-common-context-budget-20261013.zip; канонические Chrome/Firefox/source ZIP обновлены. Следующее — оставшийся RP-05: точнее локальный поиск/неоднозначные местоимения, инкрементальный индекс, сокращение повторных вставок без предположения о бесконечной сохранности старого контекста; затем RP-06. На другом компьютере .output нужно создать заново. Актуальные результаты — верх ROADMAP; ранние таймауты не выдавать за финальный прогон.

RP226: startupBudget даёт один 8s logical deadline для всех content startup фаз, начальные чтения идут вместе. active lease и reloadGeneration защищают поздние ответы; imageSettings присваиваются только после проверки generation. getVaultConfig/getSessionKey ограничивают именно storage read внутри операции: reject, не unlocked default, освобождает библиотечный lock. Нельзя заменять это таймаутом всей записи/crypto/IDB transaction или принудительно освобождать lock у продолжающейся мутации. Tests startup.test/vault-read-deadline и installed startup-runtime включают задержку перед зависшим vault; все 8 Edge cases прошли. Основной выбранный E2E 20 pass/12 expected skip, обе recovery; полный unit 3184 pass/5 todo, TypeScript без ошибок. Живой аккаунт, installed Firefox/Brave и весь E2E проекта не проверены.

Первый игровой слой RP-05 подключён: compileGameContext собирает весь добавленный prefix, включая [User message] separator, в одном приблизительном бюджете. Нативная история DeepSeek не сокращается и не удаляется. Следующее: более точный релевантный поиск/неоднозначные местоимения, инкрементальный индекс, контролируемое сокращение повторов; затем RP-06 продолжение. Полный RP-05 ещё открыт.

Required часть: компактный протокол, текущая сцена/roster/action restrictions/numeric policies, защищённые поля активных анкет, записи Всегда/manual и выбранная summary snapshot и полный проверенный recovered reply для конкретного запроса. Ничего из этого молча не обрезается; при required>limit optional данные не добавляются, превышение видно в общем индикаторе. Strict sending сохраняет свой существующий режим. Нормальный запрос использует compact variants; referenceOnly/service и standalone вызовы прежних функций остаются полными, не получают новый write-протокол.

Прямые совпадения игрового факта с вопросом резервируют место до общих абзацев анкеты; слова последней сцены — fallback, не конкурируют с явным вопросом. Остальные optional части добавляются небольшими раундами: ранжированные принятые факты/задачи (макс8), релевантные записи, цельные абзацы appearance/personality/goals/background, затем до двух цельных последних turns переноса. Полный render проверяет лимит после каждой попытки; JSON, условия и отрицания не режутся. profile_excerpts явно partial/nonadjacent. Анкеты/история в базе не меняются. Активные профили не ограничены шестью; physically present/player/focus/exact-mentioned roster сохраняет IDs/alias ambiguity rules, без unrelated библиотеки.

Candidate-only режим rankMemories/compileMemoryWorkspace не строит огромный совокупный prompt; прежние вызовы сохраняют поведение. Контекстный neighbor допускается только от фактически выбранного родителя. Подбор остаётся локальным words/stems/names/links; местоимения не подменяются догадкой и embeddings не включены. estimateTokens остаётся приблизительным, не native token count.

Content.updateContext использует единый builder; ContextSelection.contextReport передаёт только counts/budget/overflow (не новые persistent данные). ContextBudgetSummary в sidepanel и PageWidget, RU/EN, что выбрано/не включено и обязательное превышение. Preview и финальная отправка могут различаться из-за актуального request ID/scene; фактический prefix проверяется на синтетической MV3. Обновление архива не обновляет установленную копию. MemoryStatus и badge учитывают игровые факты/фрагменты даже без lore entry. Native parent/edit подготовка ограничена tracked shared game; обычный чат без мира не вызывает game rewind и не теряет recovered reply. Same-chat/world/vault guards сохранены.

Файлы: core/game-context/context-budget-i18n, compact варианты characters/actions/relationships/attributes/story-update/story-automation/scene-choices, story-fact-context; content.tsx; shared/ContextBudgetSummary. Tests: game-context.test.ts, context-budget-ui.spec.ts, game-context-runtime.spec.ts. Итоговые проверки/архивы — верх ROADMAP. Живая модель и весь E2E не заменяются тестами; сохранять прежние нерешённые границы RP223/224 ниже.

## Текущая точка после RP224

Рабочие задачи и разрешение противоречий подключены к игре, поверх RP220/223. Inline по-прежнему не делает дополнительных запросов; отдельные партии остаются opt-in. Следующая основная задача — RP-05: общий бюджет контекста и более точный подбор памяти. Старый непроверенный backfill и сложные идентичности ещё открыты; не объявлять весь бесконечный ролплей законченным.

StoryFact.task хранит exact key, literal title и open/completed/cancelled. Terminal требует event и известную связь; планы/обещания/сомнения/переименование/повторное открытие не закрывают задачу автоматически. claim.transition:progress отличает сыгранное изменение state от correction; новое differing state без progress требует проверки. Сопоставление смысла и ключей всё ещё зависит от модели, не является доказательством. Старые факты читаются без новых полей.

Review показывает старые/новые игровые факты и цитаты. Human resolver может добавить replaces с exact storyFactIdentity только из предложенных текущих сравнений, под guard/game/writer; inline/batch запрещают модельное replaces. compactStoryFacts снимает влияние старых значений, не удаляет sources; selected-line undo/continuation/seeds/backup используют тот же fold. Авторский лор не удаляется. Старая неподключённая память promise/plan/task показана отдельно, не считается выполненной задним числом.

StoryTaskPanel в основном StoryWorkspace: поиск, открытые задачи, completed/cancelled, цитаты, пагинация без общего потолка. Русский и английский текст общий story-task-i18n. Подбор контекста остаётся до восьми фактов в прежнем supplied budget; приоритет open задач не увеличивает бюджет. Batch hints передают до восьми open и двенадцати остальных в прежних 5000 символах; служебные replaces/quotes не передаются как hints.

Попутно исправлены хронологический порядок previous memory в planStoryAccompaniment, сравнение отклонённых proposals с исправленными metadata, сохранение factSeeds при restart/checkpoint и сохранение раскрытия завершённых задач после поиска. Похожие слова не должны поглощать marked conflict или explicit differing-claim progress.

Файлы: core/story-memory-lifecycle, story-task-i18n, story-update/automation/fact-context/review; storage/story-automation(-review)/story-facts/review/game/memory-batch; StoryTaskPanel, StoryAutomationInbox/Workspace. Tests: story-memory-lifecycle, fixtures/story-lifecycle, e2e/story-lifecycle-ui/runtime. Финальные проверки и актуальные архивы — верх ROADMAP; пересборка не перезагружает установленную копию. Личный аккаунт/живая модель/installed Firefox не тестируются вместо синтетических проверок.

## Текущая точка после RP 223

Пакетная проверка новых записанных сцен подключена к игре. Последующие задачи RP224 описаны выше; этот раздел сохраняет передачу после пакетной части. Не повторять её очередь. Полный старый backfill и «бесконечный ролплей» не закрыты.

«История → Дополнительная проверка памяти» отдельно включает дополнительные запросы. По умолчанию выключено; automatic/paused/off имеют собственную revision. Inline220 сохраняется без дополнительных запросов. Запуск — в свободном видимом актуальном чате с пустым черновиком: после 12 ходов, при большом объёме или смене состава сцены после четырёх ходов. Частично разобранный большой текст продолжается следующей порцией. Проверка таймером 15 секунд не означает запрос модели каждые 15 секунд.

StoryRevision.memoryBatch хранит offset и request(id, anchor, policy, end, status, at). Receipt зависит от выбранного anchor: смена варианта повторно открывает ранние исходники, если результаты их анализа ушли с отменённой линией. Game.memoryBatchSources / Baseline.memoryBatchSeeds переносят выбранные источники через checkpoint и новый чат; новая игра очищает их. Полная копия хранит позиции; restore и импорт лора ставят дополнительный разбор на паузу с новой policy revision.

Транспорт общий с палочками: IsolatedFieldCoordinator + CharacterDiscoveryClient, один видимый masked popup, cleanup/ack. NativeStartLane исключает одновременное резервирование партии и cast. Brief и raw reply только в текущем background; потеря job — сохраняемая ошибка, не resend. Повтор разрешается явно. Существующий безопасный service audit использует категорию character-field/profile; состояние партий показывается отдельно.

JSON требует каждого source, complete:true, лимитов и точной цитаты в своей выдержке; это не доказательство смысловой полноты модели. Данные проходят planStoryAccompaniment и общую review queue. Batch events связаны с completed head и memoryBatchSourceRevisionId; profile proofs сохраняют исходные IDs. Старое state значение и пользовательское заявление о произошедшем событии не перезаписывают текущую память автоматически. Авторские поля/возраст/фото/числа сохранены.

Модули: core/storage story-memory-batch, StoryMemoryBatchPanel, native-start-lane; интеграция в graph/shared-game/checkpoint/reset/backup/import и content scheduler. Tests: story-memory-batch.test.ts, story-memory-batch-coordinator.test.ts, story-memory-batch-ui/runtime.spec.ts. Проверки и архивы — верх ROADMAP. Живая модель/личный аккаунт/installed Firefox не проверены.

## Начни здесь

Текущая точка и следующий шаг описаны выше. Ниже сохранена историческая передача после UX222 и критерии выполненной пакетной части RP-04. Поиск эмоций и большой экспорт тоже уже сделаны; повторять их реализацию не нужно.

Сначала проверь `git status`, ветку и последние коммиты. Рабочая ветка — `main`, remote — `https://github.com/NEONARCHY/DeepRole.git`. Если домашний checkout чистый, обнови его через `git pull --ff-only`. Если есть местные правки или расхождение веток, сохрани их и разберись с различиями; не выполняй reset/clean и не перезаписывай их автоматически. Не полагайся на наличие истории этого чата Codex: эта передача, AGENTS.md и свежие разделы ROADMAP — источник состояния работы.

Прочитай точечно: верх ROADMAP, раздел RP-04, `docs/AUTOMATIC-MEMORY.md` и `docs/WORLD-GAME.md`. Старые «Следующий шаг» в нижних исторических итерациях ROADMAP/MORNING-CHECKLIST не являются текущим приоритетом. Пользователь ожидает продолжения реализации, а не повторного общего обсуждения дорожной карты.

## Что уже готово

| Этап | Состояние |
| --- | --- |
| RP 211–213 | Возобновляемая очередь анкет, разбор большого исходного лора порциями, проверяемые связи найденных имён с существующими персонажами. |
| UX/RP 214–219 | Раздел «История», управление именами и объединениями, подсказки настроек, напоминание старого чата, одна общая игра лора, квадратные кнопки персонажей, пояснения ручной правки и защита полей. |
| RP 220 | Обычные завершённые ответы автоматически сохраняют пригодные факты и людей/дополнения, если сопровождение включено. Спорное уходит в сохраняемую очередь. **Ноль дополнительных модельных запросов** в текущем inline-пути. |
| FIX 221 | Большой экспорт: фото один раз в таблице, JSON частями, потоковое чтение records/photos. Мир v2 / backup v5; старые файлы поддерживаются. Без сжатия пикселей и квоты 200 МБ. |
| UX 222 | Поиск эмоций/действий при назначении изображений: часть RU/EN/custom названия, сохранение скрытого выбора, сброс ×, безопасные Enter/Escape. |

Актуальная установка: `downloads/DeepRole-Edge-emotion-search-20261012.zip`; канонические Chrome/Firefox/source ZIP находятся там же. Код, тесты и документы также переносятся Git. `.output`, `node_modules`, временные тестовые профили и `private-assets` не переносятся; локальные вспомогательные скрипты из прежнего компьютера не обязательны для продолжения.

## Решения пользователя, которые надо сохранить

- **Один лор — одна общая игра.** Новый чат подключается к последним персонажам/отношениям/характеристикам/памяти. Записывает актуальный чат; поздний ответ другого чата не получает право перезаписать игру.
- Авторский лор, возраст, ручной текст, исходные фото и защищённые поля сохраняются. Новые сведения идут через проверенные игровые overlays/события, не через переписывание всего канона.
- Имена/объединения следуют за общей игрой лора; исходные анкеты нужны истории и отмене. Более раннее решение «только текущий чат» заменено общей игрой RP218.
- **Возврат в старый чат и настоящий откат отложены пользователем.** Текущий RP218 может возобновить старый чат после напоминания, используя последние общие значения. Переделку на отдельное явное действие и откат сюжета сейчас не начинать: план сохранён в ROADMAP.
- Не включать скрыто новые платные/дополнительные запросы существующим пользователям. Не отправлять фотографии модели памяти и не запускать генерацию изображений при сопровождении.
- Интерфейс нужен обычному пользователю: обычные факты сохраняются без постоянных подтверждений, существенные сомнения объясняются коротко и отдельно. RU/EN, узкие панели, клавиатура и доступность обязательны.

## Исторические критерии пакетной части RP-04

**Сделай возобновляемый разбор небольшой партии новых подтверждённых сцен**, чтобы пропуски текущего inline-пути можно было дозаполнить без дублей, повторной полной подготовки персонажей и перезаписывания лора. Интервал **10–15 выбранных игровых ходов — начальный ориентир**, а не обещание отправлять весь лор с такой частотой. Учитывай объём, смену сцены и досрочную потребность отдельно.

1. Точечно проверь существующие durable receipts, исходные revision/event IDs, selected-line projection и service/job coordinators. Опиши границу нового слоя в ROADMAP; сохраняй рабочий inline 220.
2. Считай только новые завершённые игровые ходы актуальной выбранной линии. Исключи палочки, service/OOC, partial/failed, повтор/reload, отклонённые и невыбранные варианты. Привяжи курсор и состав партии к game/branch/revision/selection; смена варианта не должна сохранять чужую память.
3. Храни задание/курсор/статус/идемпотентность в существующем локальном хранилище и сейфе. Сбой или reload не повторяет уже принятый результат. Обработанная точка продвигается после проверенного сохранения; незавершённое можно продолжить или отменить. Импортированные audit записи не дают права автоматически запускать native работу.
4. Партия ограничивает **запрос**, не удаляет исходную историю. Используй доказуемые исходники и точные ссылки/цитаты, различай события, обещания, планы, секреты, мнения и задачи. Невыбранный вариант или обещание не превращается в произошедшее событие.
5. Используй текущие проверки повторов/конфликтов, protectedProfileFields и общую review queue. Рутинные пригодные факты следуют выбранной политике; существенное/неясное требует проверки. Служебный ответ не становится произвольной командой базе. Точная цитата не равна гарантии смысловой правильности.
6. Если глубокий разбор требует отдельного запроса DeepSeek, дай **отдельное понятное включение с объяснением частоты/расхода**, паузой и отключением. Существующее включение inline 220, обещающее ноль дополнительных запросов, не является разрешением скрытно начать такие партии. Не занимай неотправленный черновик и не запускай параллельную генерацию; используй имеющийся протокол служебной работы и проверяй актуальность после ожидания.
7. Проверь source proofs, права текущего writer, policy revision, ручные изменения, vault и выбранную линию при старте и финальном commit. Поздний ответ не воскресит отменённый факт и не перепишет ручную правку. Продолжение в новом чате наследует состояние обработки общей игры, не обнуляет его.
8. Минимальный видимый UX: включено/пауза, ожидающие сцены/готовый разбор, причина остановки и явный повтор при сбое. Не требуй открытия панели после каждого хода. Старую непроверенную переписку **до исходной точки** не анализируй автоматически: полный backfill остаётся отдельным явным действием.

### Критерии сдачи следующего этапа

- Партия новых сцен даёт пригодную память без повторов; сто синтетических ходов/reload не создают дубли.
- Повтор, partial/OOC, alternative/regenerate, пауза, прерванная работа, два чата/две вкладки, смена лора, поздняя ручная правка и блокировка сейфа проверены.
- Планы не сохраняются как завершённые события; конфликт/защита идут в review. Отмена выбранной сцены снимает её зависимую память.
- Отмена/ошибка сохраняет прежнюю память и черновик. Новая партия не отправляет фото или запрос провайдеру изображений.
- Full backup/restore и продолжение в новый чат сохраняют receipts/курсор, но не запускают импортированную служебную работу сами.
- Есть целевые unit и реальный синтетический browser flow, RU/EN 320/900, клавиатура/Axe, typecheck, сборки и ZIP. Живую модель/личный аккаунт отмечай отдельно от автотестов.

После этого продолжать смысловую проверку конфликтов и общий список незавершённых задач RP-04, затем общий релевантный бюджет RP-05. Маскировки/сложные идентичности RP-03 и полное дозаполнение старой переписки ещё открыты. Не объявлять весь «бесконечный ролплей» завершённым.

## Где продолжать в коде

- `src/core/story-automation.ts`, `src/storage/story-automation.ts`: policy, проверки фактов/людей, bounded inline planner.
- `src/core/story-automation-review.ts`, `src/storage/story-automation-review.ts`: сохраняемая проверка и late resolution исходных proposals.
- `src/core/story-dispatch-capture.ts`, `src/storage/story-dispatch-capture.ts`: принятые dispatch proofs и замороженные разрешения.
- `src/storage/story-game.ts`, `src/storage/world-game.ts`, `src/storage/story-history.ts`, `src/storage/story-effect-replay.ts`: выбранная история, writer, seeds и повторное применение.
- `src/adapters/*coordinator.ts`, `src/storage/service-*`, `src/core/service-*`: существующая служебная работа. Сначала найди подходящий coordinator по символам, не создавай второй транспорт вслепую.
- `src/entrypoints/shared/StoryAutomationPanel.tsx`, `StoryAutomationInbox.tsx`, `StoryWorkspace.tsx`: интерфейс сопровождения.
- `tests/story-automation.test.ts`, `tests/e2e/story-automation*.spec.ts`, `tests/world-game.test.ts`: исходная regression база.

## Проверки на момент передачи

Финальный общий прогон перед push: **3116 unit pass / 0 fail / 5 ранее отложенных todo**, TypeScript и diff без ошибок. FIX221 ранее дал полный unit **3106 pass / 5 todo**, затем **42 целевых**; UX222 — **26 целевых unit**, **8 новых GUI + 22 library/shared-emotion GUI**. В Edge проверен экспорт/импорт синтетических **24 персонажей / 40 фото / 280 MiB**, SHA-256 каждого оригинала совпал; отдельно установленная синтетическая MV3 восстановила v5. RP220 normal POST проверен на изолированной Edge MV3 без дополнительных запросов.

**Полный E2E не объявлен зелёным и не был прогнан целиком в этих итерациях.** Некоторые прежние getByLabel после добавления защиты анкеты теперь неоднозначны с checkbox: используй роль textbox/combobox вместо ослабления проверки. Старые подсказки перенесены в SettingsHelp. Исправленные целевые сценарии проходят. Личный аккаунт/живая модель/installed Firefox не проверены. Build large-chunk warning остаётся открытым RP-08.

### Команды и переносимость

После обычной установки зависимостей по lockfile:

```powershell
npm ci
npm run typecheck
npm test -- --maxWorkers=2
npm run test:e2e -- tests/e2e/story-automation.spec.ts --workers=2
npm run zip
npm run zip:firefox -- --sources
```

Браузерные тесты выполняй последовательно между отдельными Playwright запусками: они используют один сервер/каталог результатов. Конфигурация Chromium использует установленный Edge; Firefox должен быть доступен Playwright. Отсутствующий браузер не скрывай как успешную проверку. LeanCtx/Node пути зависят от компьютера: используй доступный runtime/MCP/CLI, не копируй прежние абсолютные пути без проверки.

После изменений обнови ROADMAP и эту передачу, пересобери обе `.output` папки и Chrome/Firefox/source ZIP, сверяй содержимое и отсутствие личных данных. Dated archives — исторические; актуальные canonical downloads должны соответствовать текущим сборкам. Пересборка или git pull **не перезагружает установленную копию Edge**: заменяются файлы именно в загруженной браузером папке, затем обновляются расширение и DeepSeek.
