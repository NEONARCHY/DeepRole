import { browser } from "wxt/browser";
import { DEFAULT_SETTINGS } from "../core/defaults";
import type { DeepRoleSettings, VaultConfig } from "../core/types";

const SETTINGS_KEY = "deeprole_settings";
const VAULT_KEY = "deeprole_vault";
const SESSION_KEY = "deeprole_vault_session_key";

export async function getSettings(): Promise<DeepRoleSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<DeepRoleSettings> | undefined) };
}

export async function saveSettings(settings: DeepRoleSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function updateSettings(patch: Partial<DeepRoleSettings>): Promise<DeepRoleSettings> {
  const settings = { ...(await getSettings()), ...patch };
  await saveSettings(settings);
  return settings;
}

export async function getVaultConfig(): Promise<VaultConfig> {
  const result = await browser.storage.local.get(VAULT_KEY);
  return (result[VAULT_KEY] as VaultConfig | undefined) ?? { enabled: false };
}

export async function saveVaultConfig(config: VaultConfig): Promise<void> {
  await browser.storage.local.set({ [VAULT_KEY]: config });
}

export async function getSessionKey(): Promise<string | null> {
  if (!browser.storage.session) return null;
  const result = await browser.storage.session.get(SESSION_KEY);
  return (result[SESSION_KEY] as string | undefined) ?? null;
}

export async function saveSessionKey(rawKey: string): Promise<void> {
  if (!browser.storage.session) throw new Error("Session storage unavailable");
  await browser.storage.session.set({ [SESSION_KEY]: rawKey });
}

export async function clearSessionKey(): Promise<void> {
  if (browser.storage.session) {
    await browser.storage.session.remove(SESSION_KEY);
  }
}

export const storageKeys = {
  settings: SETTINGS_KEY,
  vault: VAULT_KEY,
  sessionKey: SESSION_KEY,
} as const;
