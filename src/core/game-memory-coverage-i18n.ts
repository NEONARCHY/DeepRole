import type {Locale} from "./types";
const ru={
 budgetTitle:"Не вся важная память поместилась",
 budgetBody:"Полный найденный набор превышает лимит памяти для следующего сообщения. Используется прежний подбор: часть важных сведений может не попасть в запрос.",
 requiredTitle:"Обязательная память превышает лимит",
 requiredBody:"Закреплённый лор, правила или защищённые данные уже больше установленного лимита. Они сохранены целиком, но места для остальной памяти может не хватить.",
 action:"Проверьте лимит памяти и объём закреплённых данных в настройках. Сохранённая история не удалена.",
 details:"Подробнее о памяти",title:"Полнота найденного важного набора",
 complete:"Найденный важный набор подготовлен целиком",
 budget:"Полный важный набор не поместился; используется прежний подбор",
 source:"Источник части сведений не подтверждён. Полнота подбора неизвестна.",
 query:"Доступные сведения подготовлены, но полнота подбора для этой формулировки не подтверждена. Проверяйте смысл по исходным записям.",
 capacity:"Найденный набор превышает защитный предел одной передачи. Полнота прежнего подбора не подтверждена.",
 notApplicable:"Проверка полного важного набора для этого сообщения не выполнялась.",
 preview:"Это подготовка к следующему сообщению, не подтверждение отправки или использования памяти DeepSeek. Проверяется найденный набор для поддержанной формулировки, а не вся история.",
};
const en:Record<keyof typeof ru,string>={
 budgetTitle:"Some important memory did not fit",
 budgetBody:"The complete identified set exceeds the memory budget for your next message. The previous selection is used: some important details may be missing from the request.",
 requiredTitle:"Required memory exceeds the budget",
 requiredBody:"Pinned lore, rules or protected data already exceed the configured budget. They remain intact, but there may be too little space for other memory.",
 action:"Check the memory budget and pinned data in settings. Your saved history has not been deleted.",
 details:"Memory details",title:"Coverage of the identified important set",
 complete:"The identified important set is prepared in full",
 budget:"The complete important set did not fit; the previous selection is used",
 source:"Some sources could not be verified. Selection completeness is unknown.",
 query:"Available records are prepared, but selection completeness is unverified for this wording. Check their meaning against the original records.",
 capacity:"The identified set exceeds the safety bound for one transfer. Completeness of the previous selection is unverified.",
 notApplicable:"The complete important set was not checked for this message.",
 preview:"This prepares your next message; it does not confirm delivery or DeepSeek using the memory. The check covers the identified set for supported wording, not your entire history.",
};
export const gameMemoryCoverageText=(locale:Locale)=>locale==="ru"?ru:en;
