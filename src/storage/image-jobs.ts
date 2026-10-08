import { imageProvider } from "../adapters/image";
import { ImageApiError, boundedBody, type ImagePermissionCheck } from "../adapters/image/transport";
import { browser } from "wxt/browser";
import { dataImageBlob, normalizeImage, MAX_IMAGE_RESPONSE_BYTES } from "../adapters/image/image-codec";
import { ADULT_CONTENT_LEVEL, imageKey, object, validImageSeed, validImageProviderConfig, validCharacterImagePrompt, type CharacterImagePrompt, type ImageProviderConfig, type Illustration, type ImageProvider } from "../core/image-generation";
import type { ImageJobInput, ImageTarget } from "../core/image-messages";
import { imageReferences } from "../core/image-prompt";
import { createId } from "../core/id";
import type { SceneEntity } from "../core/types";
import { getImageSettings } from "./image-settings";
import { getProviderKey } from "./image-keys";
import { hasImagePermission } from "./image-permissions";
import { MAX_WORLD_IMAGE_BYTES, MAX_WORLD_ILLUSTRATIONS, saveIllustration, worldImageUsage } from "./illustrations";
import { repository, type DeepRoleRepository } from "./repository";
import { getVaultConfig, getSessionKey } from "./settings";
import { encryptJsonWithKey, decryptJsonWithKey, importKey, decodeSalt } from "./crypto";
import type { EncryptedEnvelope } from "../core/types";
type DownloadTicket = { input: ImageJobInput; url: string; headers: import("../core/image-generation").ImageResponseHeaders; contentLevel: import("../core/image-generation").ImageContentLevel; modelId: string; createdAt: number };
function redactMetadata(value: unknown, key: string): unknown { if (typeof value === "string") return value.replaceAll(key, "[redacted]"); if (Array.isArray(value)) return value.map(item => redactMetadata(item, key)); if (object(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name.replaceAll(key, "[redacted]"), redactMetadata(item, key)])); return value; }
export function validImageTarget(v: unknown): v is ImageTarget {
  return object(v) && imageKey(v.worldId) && imageKey(v.chatId) && typeof v.chatUrl === "string" && v.chatUrl.length <= 2048 && typeof v.messageKey === "string" && v.messageKey.length > 0 && v.messageKey.length <= 1000;
}
export function validImageJob(v: unknown): v is ImageJobInput {
  return validImageTarget(v) && object(v) && imageKey(v.providerId) && (v.entityId === undefined || imageKey(v.entityId))
    && typeof v.prompt === "string" && !!v.prompt.trim() && v.prompt.length <= 12_000 && validImageSeed(v.seed)
    && Array.isArray(v.referenceKeys) && v.referenceKeys.length <= 128 && v.referenceKeys.every(imageKey) && new Set(v.referenceKeys).size === v.referenceKeys.length;
}
export class ImageJobs {
  private readonly active = new Set<string>();
  constructor(private readonly repo: DeepRoleRepository = repository, private readonly permitted: ImagePermissionCheck = hasImagePermission, private readonly createProvider: (config: ImageProviderConfig, key: string, permitted: ImagePermissionCheck) => ImageProvider = imageProvider) {}
  async models(profile: ImageProviderConfig) {
    if (!validImageProviderConfig(profile)) throw new ImageApiError("invalid");
    if (!profile.enabled) throw new ImageApiError("disabled");
    const key = await getProviderKey(profile.id); if (!key) throw new ImageApiError("missingKey");
    try {
      const models = await this.createProvider(profile, key, this.permitted).listModels();
      // A server-controlled label/header must never echo the credential into page messages.
      return models.filter(model => !model.id.includes(key)).map(model => redactMetadata(model, key) as typeof model);
    } catch (error) {
      if (error instanceof ImageApiError) throw new ImageApiError(error.code, Object.fromEntries(Object.entries(error.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")])));
      throw new ImageApiError("failed");
    }
  }
  async run(input: ImageJobInput): Promise<Illustration> {
    if (!validImageJob(input)) throw new ImageApiError("invalid");
    const lock = JSON.stringify([input.worldId, input.chatId, input.messageKey]);
    if (this.active.has(lock)) throw new ImageApiError("busy"); this.active.add(lock);
    try {
      const settings = await getImageSettings(), config = settings.profiles.find(p => p.id === input.providerId);
      if (!settings.enabled || !config?.enabled) throw new ImageApiError("disabled");
      if (settings.contentLevel === ADULT_CONTENT_LEVEL && settings.adultConfirmed !== true) throw new ImageApiError("adultOnly");
      if (!config.modelId || input.referenceKeys.length && !(config.editModelId || config.modelId)) throw new ImageApiError("missingModel");
      if (input.referenceKeys.length > config.maxReferences) throw new ImageApiError("invalid");
      const key = await getProviderKey(config.id); if (!key) throw new ImageApiError("missingKey");
      if (await this.repo.isLocked()) throw new ImageApiError("changed");
      const records = await this.repo.rawRecords();
      if (!records.some(r => r.kind === "world" && r.id === input.worldId)) throw new ImageApiError("changed");
      const usage = worldImageUsage(records, input.worldId);
      // Reserve worst-case local output size BEFORE charging. Re-check atomically at commit.
      if (usage.illustrations >= MAX_WORLD_ILLUSTRATIONS || usage.bytes + 300_000 > MAX_WORLD_IMAGE_BYTES) throw new ImageApiError("full");
      const entity = input.entityId ? records.find(r => r.kind === "entity" && r.id === input.entityId)?.data as SceneEntity | undefined : undefined;
      if (input.entityId && entity?.worldId !== input.worldId) throw new ImageApiError("changed");
      const references = imageReferences(entity?.characterSheet);
      const images: string[] = [];
      for (const referenceKey of input.referenceKeys) { const image = references.find(r => r.key === referenceKey)?.image; if (!image) throw new ImageApiError("changed"); images.push(await normalizeImage(dataImageBlob(image), true)); }
      const provider = this.createProvider(config, key, this.permitted);
      let result;
      try { result = images.length ? await provider.edit({ prompt: input.prompt, images, seed: input.seed }) : await provider.generate({ prompt: input.prompt, seed: input.seed }); }
      catch (error) {
        if (!(error instanceof ImageApiError)) throw error;
        const headers = Object.fromEntries(Object.entries(error.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")]));
        if (error.downloadUrl && !error.downloadUrl.includes(key)) {
          const ticketId = crypto.randomUUID();
          const ticket: DownloadTicket = { input, url: error.downloadUrl, headers, contentLevel: settings.contentLevel, modelId: images.length ? config.editModelId || config.modelId : config.modelId, createdAt: Date.now() };
          const vault = await getVaultConfig(), rawKey = vault.enabled ? await getSessionKey() : null;
          if (vault.enabled && !rawKey) throw new ImageApiError("changed", headers);
          const stored = vault.enabled ? await encryptJsonWithKey(ticket, await importKey(rawKey!), decodeSalt(vault.salt!), vault.iterations!) : ticket;
          await browser.storage.session.set({ ["deeprole_image_download_" + ticketId]: stored });
          throw new ImageApiError("downloadOrigin", headers, new URL(error.downloadUrl).origin, ticketId);
        }
        throw new ImageApiError(error.code, headers);
      }
      // Credentials are not serialized into records, messages or logging.
      const headers = Object.fromEntries(Object.entries(result.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")]));
      const now = Date.now(); const value: Illustration = { id: createId("illustration"), worldId: input.worldId, chatId: input.chatId, messageKey: input.messageKey, ...(input.entityId ? { entityId: input.entityId } : {}), providerId: config.id, modelId: images.length ? config.editModelId || config.modelId : config.modelId, prompt: input.prompt, referenceKeys: input.referenceKeys, ...(input.seed === undefined ? {} : { seed: input.seed }), contentLevel: settings.contentLevel, image: result.image, headers, createdAt: now, updatedAt: now };
      try { await saveIllustration(value, this.repo); } catch (error) { throw new ImageApiError(error instanceof Error && error.message === "image-full" ? "full" : "changed", headers); }
      return value;
    } finally { this.active.delete(lock); }
  }
  async ticket(ticketId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new ImageApiError("expired");
    const stored = (await browser.storage.session.get("deeprole_image_download_" + ticketId))["deeprole_image_download_" + ticketId] as DownloadTicket | EncryptedEnvelope | undefined;
    let value: DownloadTicket | undefined;
    if (stored && "format" in stored) { const rawKey = await getSessionKey(); if (!rawKey) throw new ImageApiError("changed"); value = await decryptJsonWithKey<DownloadTicket>(stored, await importKey(rawKey)); }
    else value = stored;
    if (!value || value.createdAt + 15 * 60_000 < Date.now() || !validImageJob(value.input)) { await browser.storage.session.remove("deeprole_image_download_" + ticketId); throw new ImageApiError("expired"); }
    return value;
  }
  async download(ticketId: string) {
    const ticket = await this.ticket(ticketId), settings = await getImageSettings();
    if (!settings.enabled || !settings.profiles.some(p => p.id === ticket.input.providerId && p.enabled)) throw new ImageApiError("disabled");
    if (await this.repo.isLocked()) throw new ImageApiError("changed");
    if (!await this.permitted(ticket.url)) throw new ImageApiError("permission");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120_000);
    try {
      // This GET downloads a finished result. It never calls a generation endpoint or uses a key.
      const response = await fetch(ticket.url, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal });
      if (!response.ok || Number(response.headers.get("content-length")) > MAX_IMAGE_RESPONSE_BYTES) throw new ImageApiError("expired");
      const bytes = await boundedBody(response, MAX_IMAGE_RESPONSE_BYTES, controller.signal);
      const blob = new Blob([bytes], { type: response.headers.get("content-type")?.split(";")[0] ?? "" });
      const image = await normalizeImage(blob), now = Date.now(), input = ticket.input;
      const illustration: Illustration = { id: createId("illustration"), worldId: input.worldId, chatId: input.chatId, messageKey: input.messageKey, ...(input.entityId ? { entityId: input.entityId } : {}), providerId: input.providerId, modelId: ticket.modelId, prompt: input.prompt, referenceKeys: input.referenceKeys, ...(input.seed === undefined ? {} : { seed: input.seed }), contentLevel: ticket.contentLevel, image, headers: ticket.headers, createdAt: now, updatedAt: now };
      await saveIllustration(illustration, this.repo); await browser.storage.session.remove("deeprole_image_download_" + ticketId); return illustration;
    } catch (error) { if (error instanceof ImageApiError) throw error; throw new ImageApiError(controller.signal.aborted ? "timeout" : "failed"); }
    finally { clearTimeout(timer); }
  }
  async remove(target: ImageTarget, id: string) {
    if (!validImageTarget(target) || !imageKey(id)) throw new ImageApiError("invalid");
    await this.repo.updateRecords(records => { const value = records.find(r => r.kind === "illustration" && r.id === id)?.data as Illustration | undefined;
      if (!value || value.worldId !== target.worldId || value.chatId !== target.chatId || value.messageKey !== target.messageKey) throw new ImageApiError("changed");
      return { records: [], removed: [{ kind: "illustration", id }], result: undefined };
    });
  }
  async saveProfile(target: ImageTarget, entityId: string, profile: CharacterImagePrompt, expected: CharacterImagePrompt | null) {
    if (!validImageTarget(target) || !imageKey(entityId) || !validCharacterImagePrompt(profile)) throw new ImageApiError("invalid");
    await this.repo.updateRecords(records => {
      const entity = records.find(r => r.kind === "entity" && r.id === entityId)?.data as SceneEntity | undefined;
      if (entity?.worldId !== target.worldId || !entity.characterSheet || JSON.stringify(entity.characterSheet.imageGeneration ?? null) !== JSON.stringify(expected)) throw new ImageApiError("changed");
      return { records: [{ kind: "entity", id: entity.id, data: { ...entity, characterSheet: { ...entity.characterSheet, imageGeneration: profile }, updatedAt: Date.now() } }], removed: [], result: undefined };
    });
  }
}
