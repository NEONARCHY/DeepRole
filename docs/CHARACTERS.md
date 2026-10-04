# Персонажи и портреты

## Включить за минуту

1. Подключите мир к открытому чату.
2. Карточки включены по умолчанию. Если раньше отключали их, включите **Настройки → Приложение → Персонажи → Карточки персонажей**.
3. Под индикаторами контекста появится компактный список имён, ролей и настроений, без изображений. В **«В сцене»** видны герой и присутствующие участники, в **«Все»** — весь список с поиском. Имя открывает анкету, **+** добавляет персонажа. Кнопка раскрытия рядом с **+** открывает по центру галерею всех персонажей с портретами; карандаш открывает редактор в этом же окне. Сохранение оставляет редактор открытым. Кнопка «К персонажам» возвращает в галерею, поиск остаётся прежним.
4. В своей карточке отметьте **Мой главный герой**. Плавающие портреты по умолчанию располагаются по сторонам вариантов: герой слева, собеседники справа. Если места достаточно, говорящие стоят рядом в одном размере, а присутствующие, но молчащие персонажи — рядом с ними на 15% меньше; между портретами 6 пикселей, нижние края выровнены. При смене собеседника меняется и порядок. На тесном экране портреты перестраиваются, не перекрывая варианты. Они остаются на месте во время следующего ответа и обновляют настроение после него.
5. Продолжайте обычный разговор. После ответа DeepSeek автоматически обновляет настроение, состояние, ближайшую цель, отношения и показатели, если прислал корректные изменения. Если обновления нет, сохраняются прежние значения — расширение не придумывает их самостоятельно.

После импорта обычных записей список персонажей может быть пустым: DeepSeek заполнит его со следующим ответом, либо добавьте карточку кнопкой **+**. Сам импорт не запускает генерацию. Карточки разрешают автоматически сохранять состояние персонажей из ответов; их можно отключить. Обычное **«Обновить лор»** по-прежнему требует вашего подтверждения.

### Better Deepseek (BDS), карточки и старый ответ

[Better Deepseek (BDS)](https://github.com/EdgeTypE/better-deepseek) переносит названия, текст и режимы записей. Его JSON не содержит отдельных анкет и портретов DeepRole, даже если записи подробно описывают персонажей. Сейчас импорт не выделяет всех персонажей из текста автоматически. DeepSeek может создать карточки участников после новой реплики с подключённым миром, если вернёт корректное обновление; либо добавьте их вручную. Это не гарантия создания всех персонажей из длинного лора одним ответом.

Новый импорт создаёт отдельный экземпляр мира с новым внутренним ID. Проверка **не сравнивает сюжет или имя файла**: старое обновление должно принадлежать выбранному миру, этому чату и актуальной версии карточек. У нового ответа проверяется связь с действительно отправленной репликой расширения. Поэтому предупреждение касается только обновления карточек из старого ответа, а не правильности вашей истории или потери памяти. Не переназначайте старые данные на новый мир наугад; продолжите историю с выбранным миром.

Портреты загружаются в анкеты и хранятся в вашей библиотеке, не в коде расширения. **Экспорт мира DeepRole** переносит анкеты и их изображения. **Полная резервная копия** дополнительно сохраняет привязки чатов, состояния сцены и расстановку. Файл Better Deepseek (BDS) не заменяет такую копию. Библиотеки разных браузеров независимы.

Если участники сцены ещё неизвестны, показываются все персонажи с коротким пояснением. Фильтр меняет только экран, не память и не состав отправляемого контекста. При переходе в другой чат или мир снова открывается «В сцене», прежний поиск очищается.

У каждого браузера своя локальная библиотека. Один и тот же чат DeepSeek в Brave и браузере Codex не означает общую память DeepRole. Повторный импорт файла создаёт отдельную копию мира: ответ для прежней копии не переносится в новую. Продолжите чат с выбранным миром, чтобы DeepSeek вернул обновление именно для него.

В новых обычных репликах мир и чат определяет само расширение перед отправкой. DeepSeek возвращает метку этой реплики и имена персонажей, а не выбирает копию мира. Поэтому старые названия и служебные поля в истории не перенаправляют обновление в другую библиотеку. Если вы действительно сменили мир или вручную изменили карточки во время ответа, запоздалое обновление не применяется. Ответы, полученные до установки новой версии или отправленные другим браузером, автоматически не переносятся: нужна следующая обычная реплика из текущего браузера. Изображения между браузерами этим механизмом не переносятся.

## Одна картинка для нескольких эмоций

Названия встроенных эмоций переведены только для удобства: **Радость · happy** — одна и та же эмоция с ключом `happy`. В настройках видны ключи; DeepSeek выбирает их из разрешённого списка. Свои названия можно писать на русском или английском, но автоперевода и автоматического объединения синонимов нет. `смех` и `laughing` — разные ключи. `screaming/shouting/scarry` или названия через запятую считаются одной записью, а не списком синонимов.

Чтобы несколько эмоций показывали одну картинку:

1. Добавьте названия в настройки **по одному в строке**.
2. Откройте **Библиотеку изображений** в карточке, выделите картинку или несколько вариаций.
3. Выберите основную эмоцию, раскройте **«Ещё эмоции для этих картинок»** и отметьте остальные.
4. Нажмите **«Назначить эмоции»**, затем **«Сохранить персонажа»**.

Любая из выбранных эмоций получит те же изображения. Назначение добавляет их к существующим вариациям, не заменяет старые. Если в одном наборе станет больше 12, всё назначение отклонится без частичных изменений. Это не постоянная связь наборов: последующие добавления назначайте тем же эмоциям снова. У каждой эмоции свой цикл вариаций. Правильный выбор настроения зависит от ответа DeepSeek; расширение не распознаёт эмоции по картинке.

После сохранения редактор остаётся открытым и показывает **«Сохранено»**. Можно сразу загрузить следующую картинку и сохранить ещё раз. Окно, выбранная эмоция и раскрытая библиотека не сбрасываются. **«Закрыть»** или **«К персонажам»** закрывают редактор отдельно. Неизменённые поля сохраняют свежие обновления сцены, а конкурирующие правки того же поля не перезаписываются молча.

## Что сохраняется

Можно отметить **Мой главный герой** и загрузить портреты до одного нажатия **Сохранить персонажа**. Если за это время сцена обновится, портреты сохранятся, а свежие поля, которые вы не редактировали, останутся актуальными. Если одно и то же поле или набор изображений одной эмоции изменены одновременно в двух местах, появится предупреждение; несохранённые правки останутся в открытой форме.

**Анкета мира** — имя, внешность, характер, цели, справка и портреты. Она общая для чатов, использующих этот мир. Эти поля редактируете вы; очередной ответ не перезаписывает существующую анкету. DeepSeek может создать нового персонажа с коротким описанием, если он действительно появился в истории. Персонажи видны также среди профилей и на карте.

**Сейчас в этом чате** — настроение, состояние, ближайшая цель, отношения, до шести показателей и присутствие в сцене. Эти данные сохраняются между посещениями, но не переносятся в другой чат. Неизвестные значения остаются пустыми: приложение не вычисляет «очки отношений» само.

Под портретом видны первые два заполненных показателя в порядке анкеты, например «Энергия: Отдохнула». Все шесть можно посмотреть и изменить по нажатию на портрет. Если показателей нет, пустые шкалы не появляются. Это уже сохранённые данные сцены, а не отдельный анализ: новых запросов или токенов не требуется. Они отражают ответ модели или вашу правку, не независимую проверку событий.

Ручные правки вступают в силу после **Сохранить персонажа**. Сохранённая анкета активного персонажа попадёт в следующий запрос. Исходный импортированный текст не переписывается и доступен в карточке отдельно. В инструкции модели новые поля имеют приоритет над прежним описанием — это указание модели, а не гарантия её ответа.

## Кто в сцене и кто разговаривает с героем

**В сцене** означает, что персонаж находится здесь. Его портрет остаётся виден, даже если он молчит или общается с другим персонажем. **Собеседник героя** означает, что он обращается к вашему главному герою. Можно отметить нескольких людей одновременно: у каждого будет подпись «Обращается к герою» и обычный размер портрета. Присутствующие молчащие участники показываются немного меньше, если автоматическая группа помещается у вариантов. Заданные вручную позиции и размеры сохраняются.

Например, Леон заговорил с охранником, а Мира осталась рядом: все трое сохраняют портреты. Если Мира и Леон вместе обращаются к герою, оба отмечаются собеседниками. Если никто не обращается к герою, участники всё равно видны, но без этой отметки.

Исправить список можно в анкете → **Сейчас в этом чате** → **Сохранить персонажа**. Выбор собеседника также включает «В сцене». Снятие отметки собеседника не убирает персонажа из сцены и не снимает отметки с остальных. Главный герой не может быть своим собеседником. Следующий ответ DeepSeek обновляет список по истории; это не постоянное закрепление. Повторное открытие уже учтённого ответа не отменяет вашу правку.

## Расставить портреты

Портреты рядом с вариантами — отдельные элементы, без общего фона с кнопками выбора. Если они помещаются по бокам, от вариантов до портретов остаётся 24 px. При отправке новой реплики они не исчезают: прежняя сцена видна во время генерации, затем состояние обновляется по готовому ответу.

- Перетащите **имя с ручкой ⠿**, чтобы переместить портрет в любое место экрана, в том числе за границы колонки чата.
- Потяните **нижний правый угол**, чтобы изменить размер. Изображение всегда остаётся **3:4**; ширина — от 96 до 360 px. В узком окне оно временно уменьшается, не теряя сохранённого размера.
- Нажмите **изображение**, чтобы открыть анкету, эмоции и все показатели.
- **Сбросить расстановку** возвращает обычное расположение в текущем чате. Общий сброс доступен в **Настройки → Приложение → Персонажи**.

Расположение сохраняется автоматически после отпускания мыши — отдельно для каждого чата и мира. Оно привязано к персонажу и экрану, не к месту в списке: после перемещения портрет остаётся на выбранном месте при прокрутке. Перенос не меняет память и не отправляет сообщения DeepSeek. Ошибка сохранения возвращает предыдущую позицию. На ручке работают стрелки; Shift увеличивает шаг, Esc отменяет перетаскивание. Стрелки на угловой кнопке меняют размер. Портреты можно наложить друг на друга или на варианты; если это мешает, переместите их или сбросьте расстановку. Старые расстановки читаются без удаления; первое новое перемещение сохраняет экранную позицию.

## Портреты и эмоции

### Загрузить пачку и назначить эмоции позже

В карточке персонажа откройте **Портреты и эмоции → Библиотека изображений → Загрузить в библиотеку**. Выберите сразу несколько файлов. Они появятся в разделе **Без эмоции** — заранее распределять их не нужно.

Нажмите нужные миниатюры, выберите эмоцию внизу и нажмите **Назначить эмоции**. Для другой эмоции можно выбрать другие картинки или повторно использовать те же из вкладки **Все**. Чтобы оставить распределение на потом, просто нажмите **Сохранить персонажа**: неназначенные картинки тоже сохранятся. Без этой кнопки изменения остаются черновиком.

Библиотека отдельная у каждого персонажа. Она переносится с экспортом мира и полной копией. Картинки не отправляются DeepSeek. До 256 неназначенных изображений на персонажа; до 12 вариаций на эмоцию. Общий лимит изображений расширения — 25 МБ после обработки. Удаление вариации из эмоции оставляет картинку в библиотеке; окончательно убрать неназначенную картинку можно корзиной в библиотеке.

### Несколько изображений для одной эмоции

1. Выберите эмоцию в карточке персонажа и нажмите **Добавить изображения**. Можно выбрать сразу несколько файлов. До **12 разных изображений на одну эмоцию**, PNG/JPG/WebP до 5 МБ каждый.
2. Миниатюра переключает предпросмотр, корзина под ней удаляет только эту вариацию. Повторная загрузка добавляет изображения, а не заменяет предыдущие. Нажмите **Сохранить персонажа**.
3. После принятого обновления сцены DeepRole выбирает следующий портрет из перемешанного набора. Внутри круга повторов нет; после всех изображений начинается новый круг, без одинаковых картинок подряд на границе кругов. У каждой эмоции свой круг. Один портрет остаётся неизменным.

Открытие галереи, перемещение, обновление страницы и повторный просмотр ответа не переключают вариацию. При смене настроения используется набор новой эмоции, а при его отсутствии — набор neutral. Порядок сохраняется отдельно для каждого чата. Все вариации входят в экспорт мира и полную копию; текущий шаг круга — только в полную копию вместе с состоянием чата. Старые файлы с одним изображением продолжают работать.

### Перемещение и сворачивание панелей

Панели контекста, выбора мира, персонажей и блок управления держат между собой зазор минимум 1 пиксель, включая кнопки при наведении. Кнопки расположены сбоку от своей панели и не занимают отдельную строку между карточками. При перетаскивании панель занимает ближайшее свободное место. Старые перекрытия исправляются при показе; разворачивание панели и изменение размера окна тоже учитываются. Если экран слишком мал, панели собираются в прокручиваемую колонку; свободное перемещение возвращается, когда места достаточно. Плавающие портреты персонажей остаются независимыми.

Список персонажей по умолчанию уже. Потяните за саму панель контекста чата, памяти, персонажей, вариантов или мира, чтобы переместить её; отдельной ручки больше нет. Обычный короткий клик по кнопке внутри панели по-прежнему выполняет её действие. Маленькая кнопка **−** появляется при наведении на эту панель; на сенсорном экране она видна постоянно. Общая ручка над панелями видна всегда. Включите **Вместе**, чтобы перетаскивание любой панели перемещало всю группу; выключите для независимого перемещения. С клавиатуры выделите панель и используйте стрелки.

Свёрнутые панели собираются в один ряд значков. Нажмите значок, чтобы вернуть панель. Стрелка сброса возвращает начальную расстановку и разворачивает всё. Позиции и сворачивание сохраняются в этом браузере; на лор и токены не влияют. Ручки перемещения и изменения размера **портретов** появляются при наведении или клавиатурном фокусе; на сенсорном экране доступны постоянно.

В карточке откройте **Портреты и эмоции**, выберите **«Эмоцию портрета»** и загрузите PNG, JPG или WebP до 5 МБ. Для обычного состояния используйте **Спокойствие / neutral**. Редактор сначала показывает портрет для текущего настроения. Переключение предпросмотра не меняет настроение и не требует сохранения; само настроение меняется выше, в разделе «Сейчас в этом чате».

Если нужной картинки нет или браузер не может её открыть, показывается обычный портрет, затем — выбранный мужской, женский или нейтральный силуэт. Сохранённые изображения при этом не удаляются; новое изображение можно загрузить в ту же эмоцию.

Под индикаторами — компактные имена и статусы. Крупные портреты доступны в центральной галерее и плавающем слое рядом с вариантами. В галерее нажмите карандаш, в плавающем слое — изображение, чтобы изменить анкету.

В **Настройки → Приложение → Персонажи** можно сохранить свой список эмоций: одна в строке, до 32 вместе с `neutral`. Если в чате выбран мир, список сохраняется для этого мира. Без выбранного мира меняется общий список для миров без собственного списка. Новые названия передаются DeepSeek с последующим сообщением. Удаление эмоции из списка не удаляет ваши картинки; их можно убрать в карточке. Карточка хранит до 64 наборов эмоций, включая неактивные. DeepSeek получает только активный список из настроек, без изображений.

Изображения хранятся локально. При загрузке уменьшаются до 384 px по большей стороне и сжимаются. DeepSeek получает название эмоции, **но не картинку**. Автоматического рисования новых изображений во время чата нет: переключаются только ваши готовые варианты.

## Токены и надёжность

- Отдельных фоновых запросов нет. К обычной реплике добавляется инструкция; в конце обычного ответа DeepSeek возвращает небольшой блок изменений.
- В запросе — список имён, до шести актуальных анкет и компактное состояние остальных присутствующих, без повторения их анкет. Собеседники имеют приоритет. Байты картинок, размеры и координаты не передаются. Расход текста учитывается в индикаторе контекста и уменьшает оставшийся бюджет подбора памяти.
- Длинные анкеты всё равно стоят токенов. Пишите факты коротко; для больших справок используйте обычные записи лора. При превышении бюджета приложение предупреждает, а не обрезает сохранённый текст.
- Принимается только завершённый блок последнего ответа с подходящими миром, чатом и версией. Запоздалый ответ не затирает ручную правку. Повторно открытый ответ не применяется второй раз.
- Если DeepSeek пропустил блок или нарушил формат, карточки остаются прежними и показывается короткий статус. Новая скрытая генерация не запускается. При ошибке сохранения доступна явная повторная попытка.
- Автообновление ограничено 40 персонажами мира, 12 участниками сцены и шестью показателями на карточку. До 32 активных эмоций и до 12 изображений на каждую; общий лимит встроенных изображений — около 25 МБ в текстовом представлении.
- Кнопка **Экспорт** открывает выбор: **Этот мир** переносит лор, анкеты, портреты и список эмоций; **Полная резервная копия** дополнительно переносит все миры, настройки, состояния чатов и расстановку портретов. При импорте мира его эмоции подключаются автоматически, не заменяя настройки других миров. Локальный сейф шифрует эти данные вместе с остальной библиотекой.

Технический блок в ответе сворачивается в короткий статус: сам сюжет и размышления не скрываются. Приложение не может гарантировать, что DeepSeek всегда соблюдёт формат или правильно поймёт события. Любое состояние можно исправить вручную.

## Проверка реализации

Автотесты покрывают парсер, атомарное сохранение, конфликты, изоляцию чатов, резервные копии, сейф, изображения, клавиатуру и RU/EN-интерфейс на узком экране. Сквозной тест загружает production-расширение в отдельный профиль Edge и проверяет настоящий исходящий запрос на макете DeepSeek. В живом аккаунте отдельно проверены создание карточки, ручное сохранение, смена эмоции и портрета после нейтрального ответа, сохранность после обновления страницы. Проверены браузер Codex и Brave с независимыми библиотеками. Это не гарантия соблюдения формата во всех ответах модели; подробности и ограничения — в ROADMAP.

## English quick start

### Shared images and emotion names

Built-in labels are translated for display: **Happy · happy** always uses the key `happy`. Settings and the model use these exact keys. Custom names may be written in any language, but are not automatically translated or treated as synonyms. `смех` and `laughing` are separate keys. Commas and `/` do not create aliases.

Add each emotion on its own line in settings. In a character’s **Image library**, select images, choose the main emotion, open **More emotions for these images**, and check additional names. Click **Assign to emotion**, then **Save character**. Each selected emotion receives the same images, added to its existing set. Exceeding 12 variations in any set rejects the whole assignment without partial changes. This is a shared assignment, not a permanent link: select the same emotions again for later additions. Each emotion has its own variation cycle. DeepSeek still has to choose an allowed emotion in its response.

Saving keeps the editor open and shows **Saved**. You can add more portraits and save again without resetting the selected emotion or library. Use **Close** or **Back to characters** separately. Fields you did not edit retain newer scene updates; conflicting edits to the same field are not silently overwritten.

### Upload now, assign emotions later

Open a character sheet → **Portraits and emotions → Image library → Upload to library**. Select multiple files at once. They appear under **Unassigned**, so you can organize them later.

Select thumbnails, choose an emotion below, then click **Assign to emotion**. Switch to **All** to reuse an already assigned image for another emotion. Click **Save character** to keep the library, even if you have not assigned any emotions yet. Until then, changes are only a draft.

Each character has a separate library. World exports and full backups include it; images are never sent to DeepSeek. Limits: 256 unassigned images per character, 12 variations per emotion, and 25 MB of processed image data across the extension. Removing an emotion variation keeps its image in the library. Use the library’s trash button to delete an unassigned image.

Context, character, world and control panels keep at least a 1 px gap, including their hover controls. The controls sit beside each panel rather than in a separate row between cards. Dragging finds the nearest free space; old overlaps, restored panels and viewport changes are handled too. On very small screens they use a scrollable column until there is enough space for free positioning. Floating character portraits remain independent.

You can select **My protagonist** and upload emotion portraits before pressing **Save character** once. If a scene update arrives while editing, portraits still save and fields you left untouched keep their latest values. Competing changes to the same field or the same emotion’s image set show a warning; unsaved edits remain in the open form.

### Multiple images per emotion

In a character sheet, choose **Portrait emotion → Add images**, select one or several PNG/JPG/WebP files (up to 5 MB each), then **Save character**. Each emotion accepts up to **12 different images**. Thumbnails preview variations without changing the mood; each trash button removes just that image. Uploading again adds to the set instead of replacing it.

Each accepted scene update advances a shuffled cycle without repeating an image until all have been used. A new round avoids repeating the last image immediately. Each emotion has its own cycle; missing emotion images use the neutral set. Opening the gallery, dragging, refreshing and rereading the same reply do not advance it. The saved cycle belongs to the chat, not to the shared world profile. World exports and full backups include every image; full backups also include the current chat cycle. Older single-image files still work. Total library image data is limited to about 25 MB.

### Panel controls and automatic states

Drag the context, memory, characters, reply-choice or world panel itself to move it; there is no separate handle on each panel. A short click on a control inside still performs its normal action. The **−** button appears on its panel’s hover, and stays available on touch devices. The top group handle is always visible. Enable **Together** to drag the whole group from any panel, or disable it for independent movement. Focus a panel and use the arrow keys for keyboard movement. Minimized panels snap into one row of icons; select an icon to restore it. The reset arrow restores the default layout and expands all panels. Layout is saved in this browser and does not affect lore or tokens. Portrait drag and resize handles appear on hover or keyboard focus; touch devices keep them available.

Mood, condition, current goal, relationships and stats already update automatically when DeepSeek includes valid changes in its completed reply. Missing or invalid updates leave previous values unchanged. These are the model's interpretation of the scene, not independently measured scores. Shared profile fields are not overwritten. Save manual edits to include them in the next message.

**Export** now opens one dialog: **This world** includes lore, profiles, portraits and the world's emotion list; **Full backup** includes every world, settings and saved chat states. Imported world emotions are available automatically without replacing other worlds' settings. In **Settings → App → Characters**, changes apply to the connected world; with no world selected, they change the shared fallback list. Older world files remain compatible.

Sheets are enabled by default. Connect a world and continue chatting, or use **+** to create a sheet yourself. If previously disabled, enable **Settings → App → Characters → Character sheets**. **In scene** shows your protagonist and current participants; **All** has the complete roster and name/alias search. The compact list below the context indicators contains names, roles and moods, not images. Select a name to edit. The expand button beside **+** opens a centered portrait gallery of every character; use the pencil to edit within the same window. Saving keeps the editor open. Use Back to characters to return to the gallery without clearing its search. If participants aren’t known yet, everyone is shown with a short note. Filters affect the display only and reset when you switch chats or worlds. Mark **My protagonist** for the left floating portrait; the current interlocutor starts on the right.

**In the scene** means physically present; their portrait stays visible even when they talk to someone else. **Talking to the protagonist** can be checked for several people at once. Save the sheet to apply the selection to this chat. Speakers appear together at equal size to the right of the choices when space allows; quieter bystanders are about 15% smaller, with 6 px between portraits and aligned lower edges. Changing the speaker changes the leading portrait. Tight viewports reflow the group rather than covering the choices; manually placed portraits keep their own positions and sizes. Unchecking one speaker leaves the others unchanged and does not make them leave. The protagonist cannot be their own speaker. The next completed reply may change the list. Reopening an already consumed reply does not undo your edit.

All scene participants have separate floating portraits, outside the reply options’ background. Portraits stay visible in their current positions while DeepSeek generates the next reply; their states update after the reply. The default gap from the choices is 24 px where side placement fits. Drag the **name handle** anywhere on screen, including outside the chat column; resize from the **lower-right corner**, or select the **image** to open the sheet. Images stay 3:4. Moving portraits never creates a gap between the reply and its options. Positions and sizes are saved separately for each chat and world; moving them never changes memory or sends a request. Saved positions stay pinned while scrolling and fit inside a resized viewport. **Reset layout** restores the current chat; **Settings → App → Characters** offers an all-chat reset. Arrow keys move the focused handle or resize the focused corner; Shift gives larger steps, Esc cancels dragging. Legacy layouts remain readable; the next move stores a viewport position.

The portrait editor starts on the current mood. **Portrait emotion** previews an image without changing the character’s mood or requiring a save. Change the actual mood under **Now in this chat**. A missing or unreadable image falls back to the default portrait, then a silhouette; stored images are not deleted.

Shared profiles belong to the world; automatically updated states belong only to the current chat. Existing profiles are not overwritten by model replies. The first two filled stats appear below the portraits, in sheet order; open a portrait to see or edit all six. Unknown values stay empty. This uses saved scene data with no extra requests or tokens, not an independent check of the story. Images stay local; the model receives only allowed emotion names. You can configure up to 32 active emotions, including neutral. Sheets can retain up to 64 image sets, including retired emotions; removing a name from the active list does not delete its portraits. Upload portraits in each sheet and edit the emotion list in Settings. A missing or invalid update leaves saved states unchanged. Full backups include states and images; world exports exclude chat states. See ROADMAP for automated and live-account verification status.
