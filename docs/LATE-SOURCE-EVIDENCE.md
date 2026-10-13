# RP242: позднее подтверждение источника / Late source evidence

## Пример для игрока

DeepRole уже увидел законченный ответ «Нора обещала Мире принести инструменты» и сохранил подтверждённый вами факт. Подтверждение того, какой именно запрос получил этот ответ, пришло позже.

Поздняя квитанция теперь не превращает прежнюю реплику пользователя в новую редакцию. Сцена, принятые факты и выбранная версия остаются прежними. Повторное чтение после задержки не создаёт вторую сцену. Если связь с персонажем тогда была неизвестна, она не назначается заново по сегодняшнему имени; сам факт и точная цитата остаются доступны.

Если две попытки имеют одну реплику пользователя, но разные ответы, DeepRole использует точную пару сообщений. Если две квитанции одновременно заявляют одну и ту же пару, личность остаётся неизвестной — даже если списки имён совпали. Порядок записей не решает, кому принадлежит обещание.

«Неизвестная связь» не означает удаление памяти. Модель получает сохранённый факт и источник, с указанием отсутствия подтверждённого ID. Новые явно доказанные сцены продолжают сохранять связи по исходным ID. Автоматического восстановления всех прежних ID и дополнительного запроса DeepSeek нет.

## Что проверено

- Семь исходных регрессионных сценариев падали до исправления: другая попытка с тем же user key, два одинаковых/разных roster claims, два поздних статуса и два согласованных, но неверных native parent receipts.
- Дополнительно: точная whole-body проверка, чат/мир/binding/parent, неполные сообщения, отменённая/неподтверждённая отправка, FETCH fallback, restored/OOC/no-context данные, второй ход после первой сцены, реальное редактирование, две исторические версии пользователя и полная копия.
- 38 новых unit/storage cases; целевая группа из пяти файлов — 100 успешных проверок. Общий набор и браузерная проверка записаны в текущем разделе ROADMAP.md.

## Technical boundary

story-dispatch-match.ts matches completed native user samples by exact full wire body, binding/world/chat/native parent, accepted delivery and user key. Assistant matching requires the exact user/assistant pair and a unique claim. The sole scoped fetch candidate retains legacy parsing but grants no source-role proof. A whole-body match alone does not select history, approve events or grant images. A new paid image also requires that same uniquely matched capture alongside the existing permission checks.

The game writer reuses a matching selected user revision before other observations. An unchanged previously stored raw body may remain raw after late confirmation, so hidden-prefix stripping cannot silently create a new user/assistant version. Genuine changed native bodies still create revisions. Completed source revisions and accepted memory are not retrospectively rebound by a later receipt.

Graph validation also checks the receipt's native parent against the previous assistant revision or the baseline's native anchor. A linked user source must contain either the exact original draft or the exact confirmed full wire body. Historical restored proof remains valid; restored captures cannot authorize a new local role binding or a paid image.

No new stored fields, schema/grammar versions, current-name migration, lore rewrite, model call or UI controls are introduced. Literal snapshots/quotes and the existing common request budget are retained. Correct native evidence and local delivery still do not guarantee the live model's interpretation. Repairing old unbound ownership requires separate explicit evidence handling; arbitrary pronouns, broad semantic retrieval and episode summaries remain open RP-05 work.
