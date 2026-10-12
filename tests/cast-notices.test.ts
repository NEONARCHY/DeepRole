import {expect,it} from "vitest";
import {castNotices} from "../src/core/cast-notices";
import {castDraft} from "./fixtures/cast-data";
const draft = (warnings:string[]) => ({...castDraft("x"),warnings});
it("removes only progress resolved by a received character, including aliases",()=>{
 const d=draft(["Мира ещё не подготовлена; она остаётся на следующий батч.","Нора ещё не подготовлена; она остаётся на следующий батч."]);
 d.characters[1]!.aliases.push("Мира");
 expect(castNotices(d).review).toEqual([d.warnings[1]]);
});
it("filters prepared-person progress in English and outside-this-batch Russian",()=>{
 const d=draft(["Mira is not yet prepared.","Mira has not been prepared yet; she will be prepared in the next batch.","Мира ещё не подготовлена и остаётся вне этого батча."]);
 d.characters[1]!.aliases.push("Мира");expect(castNotices(d)).toEqual({review:[],notes:[]});
});
it("does not hide uncertainty or mixed messages about a received character",()=>{
 const d=draft(["Mira is not yet prepared because her identity is unclear.","Mira is not yet prepared. Conflicting ages need review.","Mira's age is ambiguous."]);
 expect(castNotices(d).review).toEqual(d.warnings);
});
it("deduplicates the user's repair reminders without conflating opposite events",()=>{
 const d=draft(["Ремонт ворот запланирован, но не выполнен.","Ремонт ворот только запланирован и не выполнен.","Ремонт ворот выполнен, но не запланирован.","Ремонт крыши запланирован, но не выполнен."]);
 expect(castNotices(d)).toEqual({review:[d.warnings[2]],notes:[d.warnings[0],d.warnings[3]]});
});
it("separates context notes and preserves unrecognized remarks",()=>{
 const d=draft(["Романтических отношений в лоре нет.","No birth year was given.","Романтических отношений в лоре нет. Но источники противоречат друг другу."]);
 expect(castNotices(d)).toEqual({review:d.warnings.slice(1),notes:[d.warnings[0]]});
});
it("deduplicates English repair notes and punctuation/case without changing stored output",()=>{
 const d=draft(["Gate repair is planned but not completed.","The gate repair is only planned and not done.","Unknown detail.","UNKNOWN detail!"]);
 const before=structuredClone(d);expect(castNotices(d)).toEqual({review:[d.warnings[2]],notes:[d.warnings[0]]});expect(d).toEqual(before);
});
it("does not use partial names to resolve somebody else's progress",()=>{
 const d=draft(["Mira Jane is not yet prepared."]);expect(castNotices(d).review).toEqual(d.warnings);
});
it("keeps the screenshot's location explanation separate without hiding appended uncertainty",()=>{
 const note="Нора в последней сцене находится в деревне, а не у ворот маяка; она включена в present как участница текущего состояния истории, но не той же локации.";
 const d=draft([note,note+" Возраст противоречив."]);
 expect(castNotices(d)).toEqual({notes:[note],review:[d.warnings[1]]});
});
