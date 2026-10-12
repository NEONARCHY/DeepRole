import type { Locale } from "./types";
import type { ServiceValidationIssue } from "./service-validation";
const messages = {
 quote: ["Цитата должна дословно совпадать с текстом источника.", "The quote must match the source text exactly."],
 source: ["Цитата должна ссылаться на источник из переданных данных.", "The quote must reference a supplied source."],
 roster: ["Участник сцены должен ссылаться на ключ подготовленного персонажа, не на имя или ID источника.", "A scene participant must reference a prepared character key, not a name or source ID."],
 milestone: ["Событие должно ссылаться на событие именно этого персонажа.", "A completed milestone must belong to this character."],
 request: ["Ответ должен относиться к текущему запросу.", "The reply must belong to the current request."],
 json: ["Ответ должен содержать полный корректный JSON.", "The reply must contain complete, valid JSON."],
 unique: ["Значения не должны повторяться.", "Values must not repeat."],
 hero: ["Главный герой может быть только один.", "There can be at most one protagonist."],
 partner: ["Участник должен присутствовать в сцене и не быть главным героем.", "The participant must be present in the scene and must not be the protagonist."],
 boolean: ["Нужно значение «да» или «нет», не текст или число.", "A boolean value is required, not text or a number."],
 object: ["Нужна структура полей, не текст или число.", "A structured object is required, not text or a number."],
 string: ["Текст должен соответствовать указанной длине и условиям заполнения.", "Text must meet the stated length and content requirements."],
 array: ["Список должен соответствовать указанному размеру и условиям заполнения.", "The list must meet the stated size and content requirements."],
 integer: ["Нужно целое число в указанном диапазоне.", "An integer within the stated range is required."],
 format: ["Значение должно соответствовать указанному правилу формата.", "The value must match the stated format rule."],
 missingFacts: ["DeepSeek не нашёл достаточно сведений в переданных источниках. Поле не изменено.", "DeepSeek did not find enough information in the supplied sources. The field is unchanged."],
 conflict: ["DeepSeek сообщил о противоречии в источниках. Поле не изменено.", "DeepSeek reported conflicting sources. The field is unchanged."],
 field: ["Ответ должен относиться к выбранному полю.", "The reply must belong to the requested field."],
 supporting: ["Для найденных сведений нужна хотя бы одна точная цитата.", "Found information requires at least one exact supporting quote."],
 protocol: ["Готовый текст не должен содержать служебные ID или метки протокола.", "The field text must not contain internal IDs or protocol markers."],
 plain: ["Нужен готовый текст поля, без JSON, служебных меток или заглушки.", "A ready-to-paste field value is required, without JSON, protocol markers or a placeholder."],
 replaced: ["Получен заменённый ответ, а не пригодный текст поля.", "A replaced reply was received, not usable field text."],
 length: ["Текст должен содержать не более {max} знаков.", "The text must contain no more than {max} characters."],
 nonempty: ["Нужен непустой итоговый текст.", "Nonempty final text is required."],
 scene: ["Описание кадра должно содержать от 12 до 1 200 знаков.", "The scene description must contain 12–1,200 characters."],
} as const;
export function serviceValidationRuleText(locale: Locale, rule: ServiceValidationIssue["rule"]): string {
 if (rule.startsWith("text length <=")) return messages.length[locale === "ru" ? 0 : 1].replace("{max}", new Intl.NumberFormat(locale).format(Number(rule.slice("text length <=".length))));
 let key: keyof typeof messages = "format";
 if (rule === "facts required in supplied sources") key = "missingFacts";
 else if (rule === "unresolved source conflict") key = "conflict";
 else if (rule === "must match requested field") key = "field";
 else if (rule === "at least one supporting quote") key = "supporting";
 else if (rule === "no protocol identifiers in field text") key = "protocol";
 else if (rule === "plain field text without protocol or placeholder") key = "plain";
 else if (rule === "not a replaced reply") key = "replaced";
 else if (rule === "nonempty final text") key = "nonempty";
 else if (rule === "scene text 12..1200") key = "scene";
 else if (rule === "exact substring of source text") key = "quote";
 else if (rule === "ID must exist in supplied sources") key = "source";
 else if (rule.startsWith("key from this batch")) key = "roster";
 else if (/milestones/iu.test(rule) && /(?:ID|IDs)/u.test(rule)) key = "milestone";
 else if (rule === "must match current request ID") key = "request";
 else if (["complete valid JSON object", "complete final batch envelope"].includes(rule)) key = "json";
 else if (rule.includes("unique") || rule === "must not repeat an earlier batch") key = "unique";
 else if (rule === "at most one protagonist") key = "hero";
 else if (["key must also be present", "must not be protagonist"].includes(rule)) key = "partner";
 else if (rule.startsWith("boolean")) key = "boolean";
 else if (rule.startsWith("object")) key = "object";
 else if (rule.startsWith("integer")) key = "integer";
 else if (/string/iu.test(rule)) key = "string";
 else if (/array|profiles/iu.test(rule)) key = "array";
 return messages[key][locale === "ru" ? 0 : 1];
}
