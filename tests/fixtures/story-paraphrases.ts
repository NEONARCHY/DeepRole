import type { StoryFact } from "../../src/core/story-update";

// Fixed, public retrieval benchmark: same scene object, different wording.
// It deliberately includes newer facts about that object which are not the
// requested action. These are retrieval candidates, not semantic truth labels.
export const paraphraseGroups = [
  { id: "repair", ru: "Нора запланировала ремонт ворот.", en: "Nora planned to mend the gate.", ruQueries: ["Починить ворота", "Восстановить ворота"], enQueries: ["Fix the gate", "Repair the gate"], ruOther: "Нора осмотрела ворота.", enOther: "Nora inspected the gate." },
  { id: "return", ru: "Нора обещала возвратить книгу.", en: "Nora promised to give back the book.", ruQueries: ["Вернуть книгу", "Отдать обратно книгу"], enQueries: ["Return the book", "Give the book back"], ruOther: "Нора прочитала книгу.", enOther: "Nora read the book." },
  { id: "conceal", ru: "Нора решила утаить письмо.", en: "Nora decided to conceal the letter.", ruQueries: ["Спрятать письмо", "Скрыть письмо"], enQueries: ["Hide the letter", "Conceal the letter"], ruOther: "Нора подписала письмо.", enOther: "Nora signed the letter." },
  { id: "meeting", ru: "Нора предложила свидание у башни.", en: "Nora proposed a rendezvous at the tower.", ruQueries: ["Встретиться у башни", "Увидеться у башни"], enQueries: ["Meet at the tower", "Meeting at the tower"], ruOther: "Нора осмотрела башню.", enOther: "Nora inspected the tower." },
  { id: "delivery", ru: "Нора обещала принести посылку.", en: "Nora promised to bring the parcel.", ruQueries: ["Доставить посылку", "Доставка посылки"], enQueries: ["Deliver the parcel", "Delivery of the parcel"], ruOther: "Нора описала посылку.", enOther: "Nora described the parcel." },
  { id: "waiting", ru: "Нора будет ожидать поезд.", en: "Nora will await the train.", ruQueries: ["Ждать поезд", "Ожидание поезда"], enQueries: ["Wait for the train", "Waiting for the train"], ruOther: "Нора нарисовала поезд.", enOther: "Nora sketched the train." },
  { id: "departure", ru: "Нора собирается покинуть город.", en: "Nora intends to depart from the city.", ruQueries: ["Уехать из города", "Уйти из города"], enQueries: ["Leave the city", "Departure from the city"], ruOther: "Нора описала город.", enOther: "Nora described the city." },
  { id: "assistance", ru: "Нора обещала помочь с экзаменом.", en: "Nora promised to assist with the exam.", ruQueries: ["Помощь с экзаменом", "Поддержать на экзамене"], enQueries: ["Help with the exam", "Assistance with the exam"], ruOther: "Нора обсудила экзамен.", enOther: "Nora discussed the exam." },
] as const;

const fact = (text: string): StoryFact => ({ kind: "plan", text, quote: text });
export const paraphraseCases = paraphraseGroups.flatMap(group => [
  ...group.ruQueries.map(query => ({ label: group.id + ":ru", query, wanted: fact(group.ru), distractor: fact(group.ruOther) })),
  ...group.enQueries.map(query => ({ label: group.id + ":en", query, wanted: fact(group.en), distractor: fact(group.enOther) })),
  { label: group.id + ":ru-en", query: group.ruQueries[0], wanted: fact(group.en), distractor: fact(group.enOther) },
  { label: group.id + ":en-ru", query: group.enQueries[0], wanted: fact(group.ru), distractor: fact(group.ruOther) },
]);
