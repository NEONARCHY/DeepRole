import type {StoryFact} from "./story-update";
import {normalizeText,uniqueTokens,tokenize} from "./text";
import {storyObjectForms} from './story-object-forms';

// Finite, single first-person action syntax only, not language understanding,
// performed-event evidence, pronoun resolution or proof of consent/fulfillment.
const quoted=/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u;
const unsafeWords=/^(?:не|нет|никогда|нельзя|если|когда|потому|хочу|пытаюсь|планирую|думаю|считаю|могу|буду|он|она|они|его|ее|их|ей|ему|ней|ним|мой|моя|мое|мою|мои|свой|свою|своя|наш|наша|твой|твоя|и|или|но|после|перед|пока|потом|затем|чтобы|тогда|без|not|no|never|if|when|because|want|try|plan|think|would|could|will|can|cannot|do|don|he|she|they|her|his|their|them|him|my|our|your|its|and|or|but|after|before|unless|until|while|then|without|instead)$/u;
const gesture=/^(?:я (?:(?:молча|спокойно) )?(?:киваю|улыбаюсь|жду|пожимаю плечами)|i (?:(?:am|m) )?(?:(?:quietly|silently) )?(?:nod|nodding|smile|smiling|shrug|shrugging|wait|waiting))(?: (.*))?$/u;
const objectAction=/^(?:я (?:(?:осторожно|медленно|тихо) )?(?:открываю|закрываю|беру|достаю|кладу|осматриваю|проверяю|читаю|поднимаю|опускаю|нажимаю|поворачиваю|трогаю|касаюсь|чиню|ремонтирую|восстанавливаю|отвязываю|развязываю|подключаю|отключаю|передвигаю|двигаю)|i (?:(?:am|m) )?(?:(?:carefully|slowly|quietly) )?(?:open|opening|close|closing|take|taking|pick up|picking up|put down|putting down|look at|looking at|inspect|inspecting|examine|examining|check|checking|read|reading|lift|lifting|lower|lowering|press|pressing|turn|turning|touch|touching|repair|repairing|fix|fixing|mend|mending|untie|untying|connect|connecting|disconnect|disconnecting|move|moving)) (.+)$/u;
const articles=new Set(['a','an','the']);
export const isUnsafeStoryActionWord=(word:string)=>unsafeWords.test(word);

export function storyActionBalance(query:string,names:Iterable<string>=[]) {
 let raw=query.trim();if(!raw||raw.length>240||quoted.test(raw))return;
 const wrapper=/^(\*{1,2})([^*]+)\1$/u.exec(raw);if(wrapper)raw=wrapper[2]!.trim();
 if(/[\r\n?,;:()[\]{}<>`*\/\\=+@]/u.test(raw)||/[.!]./u.test(raw))return;
 const known=[...new Set([...names].map(normalizeText).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b));
 const pattern=known.length?new RegExp(`(^| )(?:${known.join('|')})(?= |$)`,'gu'):undefined;
 const mask=(value:string)=>{const text=normalizeText(value);return pattern?(' '+text+' ').replace(pattern,'$1#').trim():text;};
 const normalized=mask(raw);if(normalized.split(' ').some(word=>unsafeWords.test(word)))return;
 const simple=gesture.exec(normalized);
 if(simple){const target=simple[1]??'';if(!target||/^(?:(?:to|at|к) )?#$/u.test(target))return {kind:'context' as const};return;}
 const action=objectAction.exec(normalized),object=action?.[1];
 if(!object||object.includes('#'))return;
 const words=object.split(' ').filter(word=>!articles.has(word));
 if(!words.length||words.length>6||words.some(word=>!/^\p{L}[\p{L}\p{N}_]*$/u.test(word)))return;
 const terms=[...uniqueTokens(words.join(' '))];if(!terms.length)return;
 // Request-local only. No persisted query selection, guessed entity links or
 // sourceQuote/key/status/value tokens masquerading as object evidence.
 const forms=storyObjectForms(words);
 const cache=new WeakMap<StoryFact,{text:string;title:string;tokens:Set<string>[];formFields:string[]}>();
  return {kind:'object' as const,object:words.join(' '),terms,orderedTerms:tokenize(words.join(' ')),matches(fact:StoryFact){
  const text=fact.text,title=fact.task?.title??'';let entry=cache.get(fact);
  if(!entry||entry.text!==text||entry.title!==title){entry={text,title,tokens:[uniqueTokens(mask(text)),uniqueTokens(mask(title))],formFields:forms?[text,title].flatMap(field=>field.split(/[.!?;,\r\n:]+/u).map(mask)):[]};cache.set(fact,entry);}
  // Do not synthesize one qualified object across two unrelated fields.
  return entry.tokens.some(field=>terms.every(term=>field.has(term)))||!!forms&&entry.formFields.some(forms);
 }};
}
