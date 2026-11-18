import { expect, it } from "vitest";
import { playedAttendanceGoal } from "../src/core/story-attendance-goal";
import type { StoryFact } from "../src/core/story-update";

const people = ["Mira","Timur","Nora"].map(name=>({id:name,name,aliases:[]}));
const source = (content:string,roleRoster=people) => ({id:content,content,roleRoster,worldId:"concert"});
const plan:StoryFact = {kind:"plan",text:"Mira wants to attend the festival of lights.",quote:"Mira wants to attend the festival of lights."};
const event = (text:string):StoryFact => ({kind:"event",text,quote:text});
const play = (line:string,prose=line,goals=[plan],roster=people) =>
  playedAttendanceGoal(event(line),source(prose,roster),goals,f=>source(f.quote));

it("recognizes a played visit from a normal paragraph, with its own actor and original goal",()=>{
  const line = "Timur took Mira to the festival of lights.";
  expect(play(line,"The gates opened. "+line+" Nora stayed behind.")).toMatchObject({plan,task:{status:"completed"}});
});
it.each([
 "Timur bought tickets to the festival of lights.", "Nora went to the festival of lights.",
 "Mira did not attend the festival of lights.", "Mira plans to attend the festival of lights.",
 "Timur took Mira to the festival of lanterns.", "Mira went to the festival of lights again, in her dream.",
 "A week has passed.", "She went to the festival of lights."
])("keeps the goal open for %s",line=>expect(play(line)).toBeUndefined());
it("keeps reported, ambiguous, conditional and differently scoped claims separate",()=>{
  const line = "Mira attended the festival of lights.";
  expect(play(line,"Nora said: "+line)).toBeUndefined();
  expect(play(line,line,[plan],[...people,{id:"second",name:"Mira",aliases:[]}])).toBeUndefined();
  expect(play(line,line,[plan,{...plan,task:{key:"other",title:plan.text,status:"open"}}])).toBeUndefined();
  expect(play(line,line,[{...plan,text:plan.text,quote:"If the weather clears, "+plan.text}])).toBeUndefined();
  expect(playedAttendanceGoal(event(line),source(line),[plan],()=>undefined)).toBeUndefined();
  expect(playedAttendanceGoal(event(line),source(line),[plan],()=>source(plan.text,[{id:"someone-else",name:"Mira",aliases:[]}]))).toBeUndefined();
});
