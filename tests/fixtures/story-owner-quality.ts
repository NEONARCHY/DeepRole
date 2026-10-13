import type { OwnerRole } from "../../src/core/story-source-roles";

// Fixed RP241 query corpus. Each question targets person-1; names of recipients
// deliberately recur in the competing facts. Keep negatives when extending it.
export const ownerQueries: { query: string; role: OwnerRole; ru: boolean }[] = [
  ...[
    "Что обещала Нора?", "Что Нора обещала?", "Что Нора обещала Мире?",
    "Напомни, что Нора обещала Мире.", "Напомни мне, что обещала Нора.",
    "Пожалуйста, напомни, что Нора обещала сделать.", "Расскажи, что обещала Нора раньше.",
    "Какие обещания у Норы?", "Обещания Норы", "Покажи обещания Норы.",
    "What did Nora promise?", "What did Nora promise Mira?", "Remind me what Nora promised Mira.",
    "Please tell me what did Nora promise to Mira?", "List Nora's promises.", "What are Nora’s commitments?",
    "Remind me of Nora's promises.", "Promises of Nora",
  ].map(query => ({ query, role: "promisor" as const, ru: /[а-я]/iu.test(query) })),
  ...[
    "Что Нора планирует?", "Что планировала Нора?", "Напомни, что Нора планирует сделать.",
    "Какие планы у Норы?", "Какие у Норы планы?", "Планы Норы", "Перечисли намерения Норы.",
    "What did Nora plan?", "What is Nora planning?", "Tell me what Nora plans to do.",
    "What are Nora's plans?", "Show me the intentions of Nora.",
  ].map(query => ({ query, role: "planner" as const, ru: /[а-я]/iu.test(query) })),
  ...[
    "Что Нора думает?", "Что считала Нора?", "Напомни, что Нора думает о Мире.",
    "Каково мнение Норы?", "В чем убеждение Норы?", "Мнения Норы",
    "What did Nora believe?", "What did Nora think?", "Tell me what Nora thinks about Mira.",
    "What is Nora's opinion?", "Beliefs of Nora", "Show me Nora's beliefs.",
  ].map(query => ({ query, role: "believer" as const, ru: /[а-я]/iu.test(query) })),
];
export const unknownOwnerQueries = [
  "Что она обещала?", "Какие у нее планы?", "Мнения её", "What did she promise?", "Her plans",
  "What did they think?", "Their beliefs", "Что обещала Нора и Мира?", "Какие планы у Норы и Миры?",
  "What did Nora and Mira promise?", "Nora's and Mira's promises", "What did Nora or Mira promise?",
  "Напомни, что Нора обещала и что Мира планирует.", "What did Nora promise and plan?",
  "Что Нора не обещала?", "Что Нора никогда не обещала?", "What did Nora not promise?",
  "What did Nora never promise?", "Если Нора обещала, что сделает Мира?", "If Nora promised, what happens?",
  "Nora promised to Mira.", "Нора обещала Мире", "Tell me about Nora", "Расскажи о Норе",
  "What did Mira say Nora promised?", "Что Нора сказала об обещании Миры?",
  "Напомни, кому Нора обещала", "Кто обещал Норе?", "Promises to Nora", "Plans for Nora",
  "Что обещала мать Норы?", "What did Nora's sister promise?", "Планы матери Норы",
  "Нора: «Что обещала Мира?»", "Nora said: “What did Mira promise?”", "«Что Нора обещала?»",
  "Что Норе обещала Мира?", "What did someone promise Nora?", "Какие у незнакомца планы?",
  "Что обещала Мира Норе и что обещала Нора Мире?", "Что думает Нора или Мира?", "Promise Nora to wait.",
  "Что обещала Нора и её брат?", "Что обещала Нора и привезла Мира?",
  "What did __person0__ promise to Nora?", "What did @person0@ promise to Nora?",
];
export const sourceQuality = [
  { quote: "Nora promised to help Mira if the road opens.", role: "promisor", owner: 1 },
  { quote: "Nora plans to help Mira.", role: "planner", owner: 1 },
  { quote: "Nora believes Mira repaired the clock.", role: "believer", owner: 1 },
  { quote: "Нора сказала Мире: «Я обещаю ждать».", role: "promisor", owner: 3 },
  { quote: "Мира сказала Норе: «Я обещаю помочь».", role: "promisor", owner: 4 },
  { quote: "Nora told Mira: “I plan to leave.”", role: "planner", owner: 1 },
  { quote: "Nora said Mira promised to help.", role: "promisor", owner: null },
  { quote: "Nora told Mira: “Mira promised to help.”", role: "promisor", owner: null },
  { quote: "Nora: “I promise,” wrote Mira in the letter.", role: "promisor", owner: null },
  { quote: "If Nora promised, Mira would wait.", role: "promisor", owner: null },
  { quote: "Nora did not promise to help.", role: "promisor", owner: null },
  { quote: "Нора не обещала помогать.", role: "promisor", owner: null },
  { quote: "She promised to help Nora.", role: "promisor", owner: null },
  { quote: "Nora and Mira promised to wait.", role: "promisor", owner: null },
  { quote: "Nora promised? Mira did.", role: "promisor", owner: null },
  { quote: "Nora promised to wait. Mira promised to help.", role: "promisor", owner: null },
  { quote: "Мире обещала помочь Нора.", role: "promisor", owner: null },
  { quote: "Nora's sister believes the road is open.", role: "believer", owner: null },
] as const;
