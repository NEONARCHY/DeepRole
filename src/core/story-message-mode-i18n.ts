import type {Locale} from './types';
const text={
  label:['[Скобки] — вне игры','[Brackets] mean out of character'],
  hint:['Сообщение целиком в [скобках] — вопрос без изменения сцены. Вставки в скобках внутри хода — пояснения, не события. Кавычки, код и ссылки остаются обычным текстом.','A whole [bracketed message] asks without changing the scene. Bracketed notes within a game turn are guidance, not events. Quotes, code and links stay literal.'],
  scope:['Только для этого мира, после «Сохранить». Если пишете игровые действия в [скобках], оставьте выключенным. Старые сообщения не меняются.','Only for this world, after Save. Leave off if you write played actions in [brackets]. Existing messages are not changed.'],
} as const;
export const storyMessageModeText=(locale:Locale,key:keyof typeof text)=>text[key][locale==='ru'?0:1];
