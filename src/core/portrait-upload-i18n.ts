import type { Locale } from "./types";
const copy = {
  ru: {
    title: "Качество загруженных изображений", edge: "Длинная сторона · пиксели", save: "Сохранить качество", saved: "Сохранено. Применится к новым загрузкам.", failed: "Не удалось сохранить настройку. Попробуйте ещё раз.",
    hint: "По умолчанию 1920 px вместо прежних 384. Пропорции сохраняются, маленькие исходники не растягиваются. Подходящий оригинал сохраняется без пересжатия; большие изображения уменьшаются с высоким качеством. Уже загруженные картинки не меняются — для новых деталей загрузите исходники заново.",
    budget: "Чёткие изображения занимают больше места. Прежние лимиты сохраняются: 50 МБ на все загруженные портреты и 50 МБ изображений на мир. Старые картинки не удаляются и не ухудшаются автоматически.",
    invalid: "Укажите целое число от 256 до 4096.", tooLarge: "Изображение слишком тяжёлое для выбранного качества. Уменьшите длинную сторону в Настройки → Оформление или подготовьте более лёгкий файл. Прежние картинки сохранены.",
    preview: "Размер превью", previewHint: "Увеличьте миниатюры, чтобы различать лица и эмоции. Просмотр открывает полную картинку и не меняет выбор.", view: "Просмотр", previewFailed: "Размер превью не удалось запомнить; сейчас он изменён только в открытой библиотеке.",
  },
  en: {
    title: "Uploaded image quality", edge: "Long edge · pixels", save: "Save image quality", saved: "Saved. Applies to new uploads.", failed: "Could not save the setting. Try again.",
    hint: "1920 px by default instead of the former 384. Aspect ratio is preserved and small sources are never upscaled. A fitting original is kept without recompression; larger images are resized at high quality. Existing pictures stay unchanged — upload their originals again for more detail.",
    budget: "Sharper images use more storage. Existing limits remain: 50 MB across uploaded portraits, and 50 MB of images per world. Existing pictures are never deleted or reduced automatically.",
    invalid: "Enter a whole number from 256 to 4096.", tooLarge: "This image is too large at the selected quality. Lower the long edge in Settings → Appearance or prepare a smaller file. Existing pictures are unchanged.",
    preview: "Preview size", previewHint: "Enlarge thumbnails to see faces and emotions. View opens the full picture without changing your selection.", view: "View", previewFailed: "Could not remember the preview size; it is changed only in the current library.",
  },
} as const;
export const portraitUploadText = (locale: Locale, key: keyof typeof copy.en) => copy[locale][key];
export const portraitUploadError = (locale: Locale, error: unknown, fallback: string) => error instanceof Error && error.message === "image-too-large" ? portraitUploadText(locale, "tooLarge") : fallback;
