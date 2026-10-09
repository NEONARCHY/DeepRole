import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PortraitUploadSettings } from "../src/entrypoints/shared/PortraitUploadSettings";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { portraitUploadText } from "../src/core/portrait-upload-i18n";
afterEach(cleanup);
it.each(["ru","en"] as const)("validates and saves only after confirmation, preserving unrelated preferences: %s",async locale=>{
  const save=vi.fn(async()=>{}),settings={...DEFAULT_SETTINGS,locale,portraitPreviewSize:240,showDeepSeekReasoning:true};
  render(<PortraitUploadSettings settings={settings} onSettings={save}/>);
  const input=screen.getByRole("spinbutton"),button=screen.getByRole("button",{name:portraitUploadText(locale,"save")});
  fireEvent.change(input,{target:{value:"720.5"}});expect(button).toBeDisabled();expect(screen.getByRole("alert")).toHaveTextContent(portraitUploadText(locale,"invalid"));
  fireEvent.change(input,{target:{value:"720"}});expect(save).not.toHaveBeenCalled();fireEvent.click(button);
  await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({...settings,portraitMaxEdge:720});await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent(portraitUploadText(locale,"saved")));
});
it("presets fill the draft, persistence errors remain visible, and no API is invoked",async()=>{
  render(<PortraitUploadSettings settings={DEFAULT_SETTINGS} onSettings={vi.fn(async()=>{throw Error("storage");})}/>);
  fireEvent.click(screen.getByRole("button",{name:"4096 px"}));expect(screen.getByRole("spinbutton")).toHaveValue(4096);
  fireEvent.click(screen.getByRole("button",{name:portraitUploadText(DEFAULT_SETTINGS.locale,"save")}));
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent(portraitUploadText(DEFAULT_SETTINGS.locale,"failed")));
});
