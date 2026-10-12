import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {MemoryStatus} from "../src/entrypoints/shared/MemoryStatus";
import type {ContextSelection,Locale} from "../src/core/types";
afterEach(cleanup);
for(const locale of ["ru","en"] as Locale[])it(`game facts without lore entries are ready memory ${locale}`,()=>{
 const selection:ContextSelection={entries:[],estimatedTokens:300,omittedCount:0,contextReport:{limit:2000,total:300,required:200,selected:{lore:0,profiles:0,facts:1,continuation:0},omitted:{lore:0,profiles:0,facts:0,continuation:0}}};
 render(<MemoryStatus locale={locale} connected selection={selection} available={0} onAdd={()=>{}}/>);
 expect(screen.getByText(locale==="ru"?"Память готова":"Memory is ready")).toBeVisible();
 expect(screen.queryByRole("button",{name:locale==="ru"?"Добавьте первый факт":"Add your first fact"})).toBeNull();
});
it("technical protocol alone is not advertised as remembered lore",()=>{
 const selection:ContextSelection={entries:[],estimatedTokens:200,omittedCount:0,contextReport:{limit:2000,total:200,required:200,selected:{lore:0,profiles:0,facts:0,continuation:0},omitted:{lore:0,profiles:0,facts:0,continuation:0}}};
 render(<MemoryStatus locale="ru" connected selection={selection} available={0} onAdd={()=>{}}/>);
 expect(screen.getByRole("button",{name:"Добавьте первый факт"})).toBeVisible();
});
