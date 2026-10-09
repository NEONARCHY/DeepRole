import type { Locale } from "./types";
const copy = {
  ru: {
    compressTitle: "Сжать изображения?", compressHint: "Выбор применяется только к этой загрузке. Прежние изображения не меняются.", original: "Без сжатия", originalHint: "Оригинальные файлы без потери качества и изменения размера.", configured: "Высокое качество", configuredHint: "Уменьшение до длинной стороны из настроек. Маленькие оригиналы сохраняются без изменений.", compact: "Меньше места", compactHint: "WebP, длинная сторона до 1280 px с учётом настроек. Возможна потеря мелких деталей.", cancel: "Отмена", referencePreview: "Размер превью референсов",
    title: "Качество загруженных изображений", edge: "Длинная сторона · пиксели", save: "Сохранить качество", saved: "Сохранено. Применится к новым загрузкам.", failed: "Не удалось сохранить настройку. Попробуйте ещё раз.",
    hint: "По умолчанию 1920 px вместо прежних 384. Пропорции сохраняются, маленькие исходники не растягиваются. Подходящий оригинал сохраняется без пересжатия; большие изображения уменьшаются с высоким качеством. Уже загруженные картинки не меняются — для новых деталей загрузите исходники заново.",
    budget: "Библиотека хранится на устройстве. DeepRole не ограничивает число изображений и общий размер коллекции. Доступный объём зависит от свободного места и возможностей браузера.",
    invalid: "Укажите целое число от 256 до 4096.", tooLarge: "Изображение слишком тяжёлое для выбранного качества. Уменьшите длинную сторону в Настройки → Оформление или подготовьте более лёгкий файл. Прежние картинки сохранены.",
    preview: "Размер превью", previewHint: "Увеличьте миниатюры, чтобы различать лица и эмоции. Просмотр открывает полную картинку и не меняет выбор.", view: "Просмотр", previewFailed: "Размер превью не удалось запомнить; сейчас он изменён только в открытой библиотеке.",
  },
  en: {
    compressTitle: "Compress images?", compressHint: "Applies only to this upload. Existing images stay unchanged.", original: "Keep originals", originalHint: "Original files with no quality loss or resizing.", configured: "High quality", configuredHint: "Resize to the long edge in settings. Smaller originals stay unchanged.", compact: "Save space", compactHint: "WebP, up to 1280 px on the long edge, respecting settings. Fine detail may be lost.", cancel: "Cancel", referencePreview: "Reference preview size",
    title: "Uploaded image quality", edge: "Long edge · pixels", save: "Save image quality", saved: "Saved. Applies to new uploads.", failed: "Could not save the setting. Try again.",
    hint: "1920 px by default instead of the former 384. Aspect ratio is preserved and small sources are never upscaled. A fitting original is kept without recompression; larger images are resized at high quality. Existing pictures stay unchanged — upload their originals again for more detail.",
    budget: "The library stays on your device. DeepRole places no limit on the number of images or the total collection size. Available capacity depends on disk space and the browser.",
    invalid: "Enter a whole number from 256 to 4096.", tooLarge: "This image is too large at the selected quality. Lower the long edge in Settings → Appearance or prepare a smaller file. Existing pictures are unchanged.",
    preview: "Preview size", previewHint: "Enlarge thumbnails to see faces and emotions. View opens the full picture without changing your selection.", view: "View", previewFailed: "Could not remember the preview size; it is changed only in the current library.",
  },
} as const;
export const portraitUploadText = (locale: Locale, key: keyof typeof copy.en) => copy[locale][key];
export const portraitUploadError = (locale: Locale, error: unknown, fallback: string) => error instanceof Error && error.message === "image-too-large" ? portraitUploadText(locale, "tooLarge") : fallback;
