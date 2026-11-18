export const recoveryCopy = {
  ru: {
    title: "Проверка DeepRole", hint: "Если связи нет, нажмите ↻ у DeepRole на странице расширений и обновите DeepSeek. Расширение удалять не нужно.",
    checking: "Проверяем связь…", ready: "Фоновая часть отвечает", failed: "Фоновая часть не отвечает. Попробуйте перезапуск.",
    check: "Проверить ещё раз",
    mismatch: "Открыты разные сборки DeepRole. Скопируйте черновики из открытых чатов. Затем перезагрузите расширение и обновите вкладки DeepSeek.",
    reload: "Перезагрузить DeepRole",
    backgroundBuild: "Сборка фоновой части",
    library: "Открыть библиотеку", build: "Сборка",
  },
  en: {
    title: "Check DeepRole", hint: "If disconnected, click ↻ next to DeepRole on the extensions page, then refresh DeepSeek. Do not uninstall the extension.",
    checking: "Checking connection…", ready: "The background service responds", failed: "The background service is not responding. Try restarting.",
    check: "Check again",
    mismatch: "Two different builds of DeepRole are running. Copy any drafts from your open chats. Then reload the extension and refresh your DeepSeek tabs.",
    reload: "Reload DeepRole",
    backgroundBuild: "Background build",
    library: "Open library", build: "Build",
  },
} as const;
