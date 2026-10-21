import type { Locale } from "./types";

export function storyFeatureGuide(locale: Locale, topic: "recording" | "automation") {
  const ru = locale === "ru";
  const recording = topic === "recording";
  return {
    title: ru ? recording ? "Зачем нужна запись сцен" : "Как работает сопровождение игры" : recording ? "Why record scenes?" : "How game accompaniment works",
    close: ru ? "Понятно" : "Got it",
    current: "",
    intro: ru
      ? recording ? "Запись сцен — журнал сыгранной истории внутри DeepRole. Сопровождение игры использует эту историю, чтобы сохранять новые сведения."
        : "Сопровождение помогает пополнять память по ходу игры: события, обещания и сведения о персонажах приходят вместе с обычными ответами DeepSeek."
      : recording ? "Scene recording keeps a local journal of your played story in DeepRole. Game accompaniment uses that story to save new details."
        : "Accompaniment helps build memory during play: events, promises and character details arrive with normal DeepSeek replies.",
    sections: recording ? [
      { title: ru ? "Что это даёт" : "What it is for", lines: ru ? [
        "Сохраняет завершённые реплики и варианты ответов локально. Можно посмотреть, что произошло и откуда взялись сведения в памяти.",
        "Даёт основу для памяти, дел, сводок и продолжения игры. Одна запись сцен ещё не означает автоматическое принятие всех новых фактов — это задаётся в «Сопровождении игры».",
      ] : [
        "Keeps completed messages and reply variants locally, so you can inspect what happened and where memory details came from.",
        "Provides a basis for memory, tasks, recaps and continuing the game. Recording alone does not automatically accept every new fact; Game accompaniment controls that.",
      ] },
      { title: ru ? "Пример" : "Example", lines: [ru
        ? "Мира обещала вернуть ключ после проверки башни. Запись сохраняет саму сцену; сопровождение может предложить это обещание для памяти и дел."
        : "Mira promises to return a key after a tower inspection. Recording keeps the scene itself; accompaniment can propose the promise for memory and tasks."] },
      { title: ru ? "С чего начнётся и чего не делает" : "Starting point and limits", lines: ru ? [
        "Началом станет ответ, выбранный сейчас в DeepSeek. Дальше записываются новые завершённые сцены. Предыдущая переписка не разбирается автоматически; исходный лор и анкеты сохраняются.",
        "Запись сама не отправляет дополнительных запросов DeepSeek. Она не увеличивает его контекстное окно и не гарантирует, что каждый факт будет найден и использован. Проверить старую историю можно отдельно.",
      ] : [
        "Starts from the reply currently selected in DeepSeek, then records new completed scenes. Earlier chat messages are not analysed automatically; original lore and profiles are kept.",
        "Recording itself sends no extra DeepSeek requests. It does not expand the model’s context window or guarantee recall of every fact. Earlier history can be checked separately.",
      ] },
    ] : [
      { title: ru ? "Что сохраняется" : "What gets saved", lines: ru ? [
        "DeepSeek предлагает сведения из новых сцен. DeepRole проверяет формат, источник и противоречия перед сохранением. Нужная часть сохранённой памяти подбирается к будущим сообщениям.",
        "Например: обещание вернуть ключ может стать незавершённым делом. Позднее сообщение о возврате может обновить его состояние. Модель может пропустить деталь или ошибиться — важные сведения стоит проверять.",
      ] : [
        "DeepSeek proposes details from new scenes. DeepRole checks their format, source and conflicts before saving. Relevant saved memory is selected for future messages.",
        "For example, a promise to return a key can become an open task. A later scene about its return can update the task. The model can miss details or make mistakes; check important information.",
      ] },
      { title: ru ? "Как выбрать режим" : "Choosing a mode", lines: ru ? [
        "«Автоматически»: подходящие сведения сохраняются сами; противоречия, неоднозначные имена и защищённые поля требуют проверки.",
        "«С подтверждением»: вы выбираете, какие предложенные сведения сохранить. «Пауза»: новые дополнения не накапливаются; существующая память остаётся. Текущее состояние сцены обновляется отдельно.",
      ] : [
        "Automatic saves eligible details; conflicts, ambiguous names and protected fields require review.",
        "With confirmation lets you choose which proposals to save. Paused stops new additions while keeping existing memory. Current scene state updates separately.",
      ] },
      { title: ru ? "Связь с записью сцен" : "How it relates to recording", lines: ru ? [
        "«Включить автоматическую память» включает запись сцен и автоматическое сопровождение вместе. «Включить запись сцен» запускает журнал, сохраняя выбранный режим сопровождения.",
        "Работа начинается с текущего момента. Старые сцены не перечитываются сами. Обычно сведения приходят с игровым ответом без дополнительных запросов; отдельная дополнительная проверка памяти может отправлять служебные запросы.",
      ] : [
        "Enable automatic memory turns on scene recording and automatic accompaniment together. Turn on scene recording starts the journal while keeping the chosen accompaniment mode.",
        "Starts from the current moment; earlier scenes are not reread automatically. Normal operation uses game replies without extra requests. Separate additional memory checks may send service requests.",
      ] },
    ],
  };
}
