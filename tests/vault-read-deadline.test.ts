import {afterEach,expect,it,vi} from "vitest";
import {browser} from "wxt/browser";
import {getVaultConfig,getSessionKey} from "../src/storage/settings";
import {withLibraryLock} from "../src/storage/library-lock";
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()});
it("unanswered vault read rejects instead of assuming an unlocked library",async()=>{
 vi.useFakeTimers();vi.spyOn(browser.storage.local,"get").mockImplementation(()=>new Promise(()=>{}));
 const result=expect(getVaultConfig()).rejects.toThrow("startup-timeout");
 await vi.advanceTimersByTimeAsync(8000);await result;expect(vi.getTimerCount()).toBe(0);
});
it("expired read releases a library lock and ignores late vault configuration",async()=>{
 vi.useFakeTimers();const get=browser.storage.local.get.bind(browser.storage.local);let first=true,finish!:(v:Record<string,unknown>)=>void;
 vi.spyOn(browser.storage.local,"get").mockImplementation(keys=>{
  if(keys==="deeprole_vault"&&first){first=false;return new Promise(resolve=>{finish=resolve})}
  return get(keys);
 });
 const read=expect(withLibraryLock("shared",getVaultConfig)).rejects.toThrow("startup-timeout");
 await vi.advanceTimersByTimeAsync(0);
 let ran=false;const next=withLibraryLock("exclusive",async()=>{const config=await getVaultConfig();ran=true;return config});
 expect(ran).toBe(false);await vi.advanceTimersByTimeAsync(8000);await read;
 await expect(next).resolves.toEqual({enabled:false});
 finish({deeprole_vault:{enabled:true}});await Promise.resolve();
 await expect(getVaultConfig()).resolves.toEqual({enabled:false});expect(vi.getTimerCount()).toBe(0);
});
it("an unanswered session key read rejects, rather than returning a fake key",async()=>{
 vi.useFakeTimers();vi.spyOn(browser.storage.session,"get").mockImplementation(()=>new Promise(()=>{}));
 const result=expect(getSessionKey()).rejects.toThrow("startup-timeout");
 await vi.advanceTimersByTimeAsync(8000);await result;expect(vi.getTimerCount()).toBe(0);
});
it("successful vault and session reads retain their actual values",async()=>{
 vi.useFakeTimers();await browser.storage.local.set({deeprole_vault:{enabled:false}});
 await browser.storage.session.set({deeprole_vault_session_key:"synthetic-session"});
 await expect(getVaultConfig()).resolves.toEqual({enabled:false});await expect(getSessionKey()).resolves.toBe("synthetic-session");
 await Promise.resolve();expect(vi.getTimerCount()).toBe(0);
});
