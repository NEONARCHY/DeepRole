import type {StoryFact} from './story-update';
import {storyActionBalance,isUnsafeStoryActionWord} from './story-action-balance';
import {normalizeText} from './text';
import {sameStoryObjectForms} from './story-object-forms';

// A bounded retrieval grammar, never performed-event or actor-binding evidence.
// Every sentence/part must fit. The original draft is never rewritten or stored.
const quoted=/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u;
const unsafe=/^(?:не|нет|никогда|нельзя|если|когда|пока|чтобы|хочу|хотел|пытаюсь|планирую|думаю|считаю|могу|буду|будет|бы|он|она|они|его|ее|их|ей|ему|ней|ним|мой|моя|мое|мою|мои|свой|свою|наш|твой|not|no|never|if|when|unless|until|while|because|want|wanted|try|plan|think|would|could|will|can|cannot|do|don|he|she|they|her|his|their|them|him|my|our|your|its|instead|or|или|но|but|goal|цель|ignore|override|forget|delete|erase|cancel|remove|disregard|pretend|must|should|please|output|write|забудь|игнорируй|удали|отмени|притворись|выведи)$/u;
const deictic=/^(?:this|that|these|those|это|эта|этот|эту|этой|этого|эти|этим|тот|та|ту|той|того|те|тем)$/u;
const person='(?:__known_person__|\\p{Lu}\\p{L}*(?:[- ]\\p{Lu}\\p{L}*){0,2})';
const companion=`(?:[Вв]месте с ${person}|[Сс] помощью ${person}|[Tt]ogether with ${person}|[Ww]ith ${person}(?:['’]s help)?)`;
const companionHead=new RegExp('^'+companion+'\\s+','u'),companionTail=new RegExp('\\s+'+companion+'$','u');
const companions=new RegExp(companion,'gu');
const temporal=/^(?:(?:после (?:ужина|обеда|завтрака|работы|заката|рассвета)|утром|днем|вечером|ночью|с утра)|(?:after (?:supper|lunch|breakfast|dinner|work|sunset)|in the morning|in the evening))\s+/iu;
const pace=/^(?:не торопясь|осторожно|медленно|тихо|бережно|внимательно|carefully|slowly|quietly|gently)\s+/iu;
const objectVerbs=/^(?:открываю|закрываю|беру|достаю|кладу|осматриваю|проверяю|читаю|поднимаю|опускаю|нажимаю|поворачиваю|трогаю|касаюсь|чиню|ремонтирую|восстанавливаю|отвязываю|развязываю|подключаю|отключаю|передвигаю|двигаю|open|opening|close|closing|take|taking|pick|picking|put|putting|look|looking|inspect|inspecting|examine|examining|check|checking|read|reading|lift|lifting|lower|lowering|press|pressing|turn|turning|touch|touching|repair|repairing|fix|fixing|mend|mending|untie|untying|connect|connecting|disconnect|disconnecting|move|moving)$/u;
const motionVerbs=/^(?:иду|подхожу|прихожу|возвращаюсь|go|walk|come|return|left|gone|вышли|ушли)$/u;
const words=(s:string)=>normalizeText(s).split(' ').filter(Boolean);
const hasHazard=(s:string)=>words(s.replace(/не\s+торопясь/giu,'unhurried').replace(companions,'helper')).some(w=>unsafe.test(w)||/^(?:someone|somebody|anyone|anybody|nobody|else)$/u.test(w));
const nounPhrase=(s:string)=>{const w=words(s);return w.length>0&&w.length<=4&&!w.some(v=>objectVerbs.test(v)||motionVerbs.test(v)||isUnsafeStoryActionWord(v)||deictic.test(v)||/^(?:я|мы|i|we|a|an|the)$/u.test(v)||/^[\p{L}]+(?:аю|яю|ую|юсь|ешь|ете)$/u.test(v))&&!s.includes('__');};
function motion(s:string){
 const raw=s.replace(temporal,'').replace(/^(?:я|i)\s+/iu,'').trim();
 const match=/^(?:(?:возвращаюсь|подхожу|иду|прихожу) (?:к|в|на|из)|(?:return|come|go|walk)(?: back| over)? (?:to|into)) (.+)$/iu.exec(raw);
 return !!match&&nounPhrase(match[1]!.replace(/^(?:the|a|an)\s+/iu,''));
}
function stage(s:string){
 if(motion(s))return true;
 const w=words(s);if(!w.length||w.length>24||s.includes('__')||w.some(v=>objectVerbs.test(v)||/^(?:я|мы|i|we)$/u.test(v)||/^[а-я]+(?:аю|яю|ую|юсь|ешь|ете)$/u.test(v)))return false;
 // Ambient clauses must have a finite context predicate; arbitrary preceding
 // user actions, instructions and a partly valid prefix are not discarded.
 const clauses=s.split(/\s*,\s*|\s+(?:and|и)\s+/iu).map(normalizeText);
 return clauses.every(c=>/\b(?:is|are|was|were|have gone|has gone)\b|(?:^| )(?:стало|стала|стал|стали|закончился|закончилась|завершился|завершилась|вышли|ушли)(?: |$)/u.test(c));
}
function clause(raw:string,names:string[]){
 let text=raw.trim().replace(/^(?:я|i(?: am|['’]m)?)\s+/iu,'');
 text=text.replace(companionHead,'').replace(pace,'').replace(companionHead,'').replace(companionTail,'');
 if(text.includes('__'))return;
 // One bounded location adjunct may follow the object. It must be a whole
 // noun phrase, never a second action, condition, ownership or quoted command.
 const location=/\s+(?:у|в|на|к|за|под|возле|beneath|behind|towards|beside|by|on|at)\s+(.+)$/iu.exec(text);
 if(location){
  const tail=location[1]!.replace(/^(?:the|a|an)\s+/iu,'');if(!nounPhrase(tail))return;
  text=text.slice(0,location.index);
 }
 for(const subject of ['Я ','I ']){const action=storyActionBalance(subject+text,names);if(action?.kind==='object')return action;}
}
export function storyNarrativeActions(query:string,names:Iterable<string>=[]):{matches:(fact:StoryFact)=>boolean;terms:string[]}[]|undefined{
 let raw=query.trim();if(!raw||raw.length>1200||quoted.test(raw)||/[\r\n!?;:()[\]{}<>`\/\\=+@]/u.test(raw))return;
 const wrapper=/^(\*{1,2})([^*]+)\1$/u.exec(raw);if(wrapper)raw=wrapper[2]!.trim();if(raw.includes('*'))return;
 if(!/\.\s+\S/u.test(raw))return;
 const known=[...new Set(names)];
 // Protect roster names before delimiters. Companion text only identifies a
 // grammatical adjunct; no person ID/alias/role is inferred from its spelling.
 for(const name of [...known].sort((a,b)=>b.length-a.length))if(name.trim()){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  raw=raw.replace(new RegExp('(?<![\\p{L}\\p{N}_])'+escaped+'(?![\\p{L}\\p{N}_])','giu'),'__known_person__');
 }
 if(hasHazard(raw))return;
 const sentences=raw.replace(/\.$/u,'').split(/\.\s+/u);if(sentences.length<2||sentences.length>4||sentences.some(s=>!s.trim()||s.includes('.')))return;
 if(!sentences.slice(0,-1).every(stage))return;
 const body=sentences.at(-1)!,check=body.replace(companions,'helper');
 if(words(check).some(w=>deictic.test(w)))return;
 const parts=body.split(/\s*,\s*(?:(?:и(?: затем)?|затем|потом|and(?: then)?|then)\s+)?|\s+(?:и(?: затем)?|затем|потом|and(?: then)?|then)\s+/iu);
 if(parts.length>1&&motion(parts[0]!))parts.shift();
 if(parts.length<2||parts.length>3||parts.some(p=>!p.trim()))return;
 const actions=parts.map(p=>clause(p,known));if(actions.some(a=>!a)||new Set(actions.map(a=>a!.orderedTerms.join(' '))).size!==actions.length)return;
 if(actions.some((a,i)=>actions.slice(0,i).some(b=>sameStoryObjectForms(a!.object,b!.object))))return;
 return actions.map(a=>({matches:a!.matches,terms:a!.orderedTerms}));
}
