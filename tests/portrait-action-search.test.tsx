import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { searchPortraitActions } from "../src/core/portrait-action-search";
import { PortraitLibrary } from "../src/entrypoints/shared/PortraitLibrary";
import { EMPTY_CHARACTER } from "../src/core/characters";

afterEach(cleanup);
const image="data:image/png;base64,YQ==";
const actions=["neutral","happy","sad","Смеётся тихо","Обнимает"];

it.each(["Рад","HAP"," happy "])("finds standard actions by localized name or key: %s",query=>{
  expect(searchPortraitActions(actions,query)).toEqual(["happy"]);
});
it("finds custom partial names regardless of case, spacing, word order or ё/е",()=>{
  expect(searchPortraitActions(actions,"  ТИХО   смеется ")).toEqual(["Смеётся тихо"]);
  expect(searchPortraitActions(actions,"обни")).toEqual(["Обнимает"]);
  expect(searchPortraitActions(actions,"walking")).toEqual([]);
  expect(searchPortraitActions(actions,"радость happy")).toEqual([]);
  expect(searchPortraitActions(actions," ")).toEqual(actions);
});
it.each(["ru","en"] as const)("filtering never changes photos, selected action or hidden extra choices: %s",locale=>{
  const change=vi.fn(),choose=vi.fn();
  function Harness(){
    const [action,setAction]=useState("neutral"),[sheet,setSheet]=useState({...EMPTY_CHARACTER,portraitLibrary:[image]});
    return <PortraitLibrary locale={locale} sheet={sheet} actions={actions} action={action} onAction={value=>{choose(value);setAction(value);}} onChange={value=>{change(value);setSheet(value as typeof sheet);}} onBusy={vi.fn()} />;
  }
  render(<Harness/>);
  const library=screen.getByRole("region",{name:locale==="ru"?"Библиотека изображений":"Image library"}),find=within(library);
  fireEvent.click(find.getByRole("button",{name:locale==="ru"?"Выбрать изображение 1":"Select image 1"}));
  fireEvent.click(find.getByText(locale==="ru"?"Ещё действия для этих картинок":"More actions for these images"));
  fireEvent.click(find.getByRole("checkbox",{name:locale==="ru"?"Радость":"Happy"}));
  const input=find.getByRole("searchbox",{name:locale==="ru"?"Найти эмоцию или действие":"Find an emotion or action"});
  fireEvent.change(input,{target:{value:" ОБНИ "}});
  expect(find.getAllByRole("checkbox")).toHaveLength(1);
  expect(find.getByRole("combobox")).toHaveValue("neutral");
  expect(find.getByRole("combobox")).toHaveTextContent(locale==="ru"?"уже выбрано":"already selected");
  expect(find.getByText(new RegExp("^"+(locale==="ru"?"К назначению":"Assigning to")))).toHaveTextContent(locale==="ru"?"Спокойствие, Радость":"Calm, Happy");
  fireEvent.click(find.getByRole("checkbox",{name:"Обнимает"}));
  fireEvent.change(input,{target:{value:"ничего123"}});
  expect(find.getByText(locale==="ru"?"Ничего не найдено":"No matches")).toBeVisible();
  expect(choose).not.toHaveBeenCalled();expect(change).not.toHaveBeenCalled();
  expect(find.getByRole("button",{name:locale==="ru"?"Выбрать изображение 1":"Select image 1"})).toHaveAttribute("aria-pressed","true");
  fireEvent.click(find.getByRole("button",{name:locale==="ru"?"Сбросить поиск эмоций":"Clear emotion search"}));
  expect(input).toHaveFocus();expect(input).toHaveValue("");
  expect(find.getByRole("checkbox",{name:locale==="ru"?"Радость":"Happy"})).toBeChecked();
  expect(find.getByRole("checkbox",{name:"Обнимает"})).toBeChecked();
  fireEvent.click(find.getByRole("button",{name:locale==="ru"?"Назначить действия":"Assign to action"}));
  expect(change).toHaveBeenCalledOnce();expect(change.mock.calls[0]![0].sprites).toEqual({neutral:[image],happy:[image],"Обнимает":[image]});
});
it("Enter and a nonempty Escape are handled inside search rather than the enclosing form/editor",()=>{
  const outer=vi.fn();
  render(<div onKeyDown={outer}><PortraitLibrary locale="ru" sheet={{...EMPTY_CHARACTER}} actions={actions} action="happy" onAction={vi.fn()} onChange={vi.fn()} onBusy={vi.fn()}/></div>);
  const input=screen.getByRole("searchbox");
  fireEvent.change(input,{target:{value:"рад"}});expect(fireEvent.keyDown(input,{key:"Enter"})).toBe(false);expect(outer).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(input,{key:"Escape"})).toBe(false);expect(input).toHaveValue("");expect(outer).not.toHaveBeenCalled();
  fireEvent.keyDown(input,{key:"Escape"});expect(outer).toHaveBeenCalledOnce();
});
