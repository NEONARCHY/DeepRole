# Черновик и размер описания иллюстрации

При создании иллюстрации не нужно отправлять или стирать черновик основного чата. DeepSeek готовит кадр в отдельном служебном окне. Запрос селфи, который действительно пишет в основной чат, сохраняет защиту черновика.

Для Venice расширение читает лимит из каталога выбранного подключения. Если к кадру приложены референсы, учитывается edit-модель; для картинки без референсов — generate-модель. Сам DeepSeek получает бюджет полного описания: в него входят стиль, выбранные внешности, участники и пояснения к референсам. Совпадение ID двух режимов не означает одинаковых лимитов.

Если описание слишком длинное, DeepRole пробует более короткие собственные служебные пояснения. Сохранённые анкеты и выбранные текстовые сведения не переписываются. Перед генерацией проверяется весь итоговый текст, а не только сцена или ответ JSON. Если он всё ещё не помещается, запрос на генерацию не отправляется. В подробностях видны модель, длина и предел; сам текст, ключ и изображения скрыты.

Например, модель с пределом1500 не получит готовое описание длиной1700. Можно выбрать подключение с большим пределом или вручную сократить отдельные описания для изображений/стиль. Расширение не будет молча обрезать внешность или удалять участников ради1500.

«Попробовать ещё раз» у ранее отправленного запроса сохраняет его старую модель, текст, seed, параметры и картинки. После смены подключения используйте «Создать иллюстрацию», чтобы подготовить новый кадр. Автоматических повторов платной генерации нет.

Каталог проверяется при подготовке и перед отправкой; это дополнительные запросы метаданных, а не повторные генерации. Если чтение известного каталога завершилось ошибкой, она показывается до генерации. OpenAI-совместимый адаптер сейчас не сообщает модельный лимит: он остаётся неизвестным, общий локальный предел12000 сохраняется. Лимиты Venice задаются [полем promptCharacterLimit для конкретной модели](https://docs.venice.ai/api-reference/endpoint/image/multi-edit).

Проверки используют синтетические истории и подставной API. Поведение живой модели и пользовательской установленной копии проверяется отдельно. После обновления архива перезагрузите расширение и вкладку DeepSeek.

## English

Illustration preparation now leaves the main composer draft untouched and uses its isolated service chat. Native in-chat selfie/service actions keep their draft protection. Venice catalog limits guide planning and are checked against the complete assembled prompt and the actually used generate/edit model before image generation. Only application-authored explanatory boilerplate can become shorter; canonical profiles, selected source values, cast and reference ownership remain unchanged. Oversized protected values stop locally with safe numeric diagnostics, not blind truncation or another generation attempt. Existing manual replay preserves its frozen model/prompt/parameters/images. OpenAI-compatible per-model limits remain unknown. Catalog reads add metadata requests; failures stop before image generation. Live-provider behavior is separate from synthetic tests.
