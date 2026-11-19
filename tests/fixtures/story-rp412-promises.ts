import type { Bilingual, Plot } from "./story-rp404-corpus";

export interface PromiseCase {
  plot: Plot;
  discussion: Bilingual;
  cues: [Bilingual, Bilingual];
}

// In either language, only the most recent dialogue varies between probes.
export const draft: Bilingual = ["Напомни, кому это обещали?", "Remind me, who was that promised to?"];
export const stories: PromiseCase[] = [
  {
    plot: {
      id: "wardrobe", title: ["Костюмерная", "Wardrobe"], cast: [["Нора", "Nora"], ["Павел", "Pavel"], ["Ева", "Eva"]],
      shifts: [["Пересчитали коробки на стеллаже", "The boxes on the shelf were counted"], ["Проветрили примерочную", "The fitting room was aired"]],
      beats: [
        { id: "velvet", act: 0, kind: "promise", task: [["Бархатная лента для Евы", "Velvet ribbon for Eva"], "open"],
          prose: ["Нора обещала Еве бархатную ленту после премьеры.", "Nora promised Eva the velvet ribbon after the premiere."] },
        { id: "silk", act: 2, kind: "promise", task: [["Шёлковая лента для хора", "Silk ribbon for the choir"], "open"],
          prose: ["Павел обещал хору шёлковую ленту после примерки.", "Pavel promised the choir the silk ribbon after the fitting."] },
        { id: "needles", act: 6, kind: "promise", prose: ["Ева обещала вернуть иглы портному в четверг.", "Eva promised to return the needles to the tailor on Thursday."] },
        { id: "delivery", act: 7, kind: "event", prose: ["Курьер доставил в театр пустые коробки.", "A courier delivered empty boxes to the theatre."] },
      ],
    },
    discussion: ["Мы обсудили две ленты для костюмов: бархатную и шёлковую.", "We discussed two costume ribbons, the velvet ribbon and the silk ribbon."],
    cues: [["Я имею в виду бархатную ленту.", "I mean the velvet ribbon."], ["Я имею в виду шёлковую ленту.", "I mean the silk ribbon."]],
  },
  {
    plot: {
      id: "workshop", title: ["Часовая мастерская", "Clock workshop"], cast: [["Анна", "Anna"], ["Мирон", "Miron"], ["Зоя", "Zoe"]],
      shifts: [["В мастерской протёрли верстак", "The workshop bench was cleaned"], ["В журнал внесли показания термометра", "The thermometer reading went in the log"]],
      beats: [
        { id: "dial", act: 0, kind: "promise", task: [["Циферблат для музея", "Dial for the museum"], "open"],
          prose: ["Анна обещала музею эмалевый циферблат после оценки.", "Anna promised the museum the enamel dial after the appraisal."] },
        { id: "spring", act: 3, kind: "promise", task: [["Пружина для Зои", "Spring for Zoe"], "open"],
          prose: ["Мирон обещал Зое заводную пружину после испытания часов.", "Miron promised Zoe the mainspring after testing the clock."] },
        { id: "lamp", act: 5, kind: "promise", prose: ["Зоя обещала отнести лампу соседу в субботу.", "Zoe promised to take the lamp to her neighbour on Saturday."] },
        { id: "payment", act: 7, kind: "event", prose: ["За ремонт настенных часов пришла оплата.", "Payment arrived for the wall clock repair."] },
      ],
    },
    discussion: ["Мы говорили о двух деталях для часов: циферблате и пружине.", "We were talking about two clock parts, the dial and the mainspring."],
    cues: [["Речь про деталь из эмали.", "I mean the enamel part."], ["Меня интересует заводная пружина.", "I am asking about the mainspring."]],
  },
];
