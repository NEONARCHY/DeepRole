import type { Locale } from "../../src/core/types";
import type { StoryFact } from "../../src/core/story-update";
import type { StorySourceRoles } from "../../src/core/story-source-roles";
import type { GameContextInput } from "../../src/core/game-context";
import { roleSeed } from "../../src/core/story-role-binding";
import { storyWorld } from "./story-worlds";

/** Fixed mixed scene, independent of the encoder. Quotes/roles are explicit
 * input evidence; no gold condition or task status is inferred by production. */
export function transportWorld(locale:Locale) {
  const f=storyWorld(locale,2),ru=locale==="ru",s=(a:string,b:string)=>ru?a:b;
  f.entities[0]!.name=s("Нора","Nora");f.entities[1]!.name=s("Мира","Mira");
  f.world.storyAutomation={mode:"automatic",revision:"transport-policy"};
  const n={id:f.entities[0]!.id,name:f.entities[0]!.name},m={id:f.entities[1]!.id,name:f.entities[1]!.name};
  const texts=[
    s("Нора обещает починить ворота только после открытия дороги.","Nora promises to mend the gate only after the road opens."),
    s("Мира планирует перейти мост только после разрешения охраны.","Mira plans to cross the bridge only after the guards give permission."),
    s("Нора подтвердила: письмо доставлено, но получатель ещё не прочитал его.","Nora confirmed: the letter was delivered, but the recipient has not read it yet."),
    s("Нора сейчас в библиотеке у северной стены, где она ждёт Миру и не собирается уходить до её возвращения.","Nora is currently in the library by the north wall, waiting for Mira, and she does not intend to leave until Mira returns."),
    s("Нора закончила читать книгу о старой крепости, но не закончила ремонт ворот и не отказалась от обещания Мире.","Nora finished reading the book about the old fortress, but she has not finished mending the gate or cancelled her promise to Mira."),
    s("Нора знает код входа в крепость, но этот код не даёт разрешения входить в личные комнаты и не открывает подвал.","Nora knows the fortress entry code, but that code does not permit entry to private rooms or open the cellar."),
    s("Нора считает, что мост безопасен, но Мира не проверяла его, и это остаётся мнением, а не установленным фактом.","Nora believes the bridge is safe, but Mira has not checked it; this remains a belief rather than an established fact."),
    s("Нора раскрыла тайну: запасное письмо осталось в закрытом шкафу; Мира не получила его, и это не то письмо, которое доставлено.","Nora disclosed the secret: the spare letter remains in the locked cupboard; Mira has not received it, and it is not the delivered letter."),
  ];
  const quote=texts.join("\n"),scene="revision_0d725f24-9320-4bd3-a31a-ae997ec83600",sources=[scene,"later-selected-turn"];
  const facts:StoryFact[]=texts.map((text,i)=>({kind:(["promise","plan","event","event","event","event","belief","secret"] as const)[i]!,text,quote,
    ...(i<3?{task:{key:["gate","bridge","letter"][i]!,title:text,status:i===2?"completed" as const:"open" as const}}:{}),
    ...(i>=3&&i<=6?{claim:{key:["place","reading","entry-code","bridge-belief"][i-3]!,value:text,scope:"state" as const,lifetime:i>=5?"persistent" as const:"scene" as const,...(i===4?{transition:"progress" as const,status:"ended" as const}:{})}}:{})}));
  const roles:StorySourceRoles[]=facts.map((_,i)=>i===1?{speaker:m,planner:m,recipient:n}:i===0?{speaker:n,promisor:n,recipient:m}:i===6?{speaker:n,believer:n,recipient:m}:{speaker:n,recipient:m});
  const seeds=facts.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:scene,quote,roles:roles[i]!}));
  const input:GameContextInput={draft:s("Нора, ворота, мост и письмо — что мы знаем?","Nora, gate, bridge and letter — what do we know?"),recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:20000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"transport-branch",facts,sheetsEnabled:false,roleSeeds:seeds,episodeSources:sources}};
  return {facts,seeds,sources,roles,input,quote,base:f};
}
