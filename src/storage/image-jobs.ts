import { imageProvider } from "../adapters/image";
import { ImageApiError, boundedBody, type ImagePermissionCheck } from "../adapters/image/transport";
import { browser } from "wxt/browser";
import { dataImageBlob, normalizeImage, MAX_IMAGE_RESPONSE_BYTES } from "../adapters/image/image-codec";
import { MAX_IMAGE_SCENE_CHARACTERS, ADULT_CONTENT_LEVEL, imageKey, object, validImageSeed, validImageProviderConfig, validCharacterImagePrompt, type CharacterImagePrompt, type ImageProviderConfig, type Illustration, type ImageProvider } from "../core/image-generation";
import type { ImageJobInput, ImageTarget } from "../core/image-messages";
import { validImageAspect } from "../core/image-generation";
import { validImageReplay, planImageInput, validImagePlanReview, type ImagePlanReview, type ImageReplay, type ImageScenePlan } from "../core/image-plan";
import { imageReviewContextKey, sameImagePlanCast, validImageReferenceChoices, validImageReferenceOverrides, type ImageReferenceOverrides } from "../core/image-references";
import { startImageAttempt, imageAttempt, patchImageAttempt } from "./image-attempts";
import { imageReferences, buildImagePrompt } from "../core/image-prompt";
import { claimSelfie, finishSelfie, selfieIllustrationId } from "./selfie-images";
import { imageErrorKey } from "../core/image-i18n";
import { imageFailureDetails, validImageDiagnostic } from "../core/image-diagnostics";
import { createId } from "../core/id";
import type { SceneEntity } from "../core/types";
import { getImageSettings } from "./image-settings";
import { getProviderKey } from "./image-keys";
import { hasImagePermission } from "./image-permissions";
import { saveIllustration } from "./illustrations";
import { repository, type DeepRoleRepository } from "./repository";
import { getVaultConfig, getSessionKey, getSettings } from "./settings";
import { encryptJsonWithKey, decryptJsonWithKey, importKey, decodeSalt } from "./crypto";
import type { EncryptedEnvelope } from "../core/types";
type DownloadTicket = { request?: ImageReplay; attemptId?: string; illustrationId?: string; input: ImageJobInput; url: string; headers: import("../core/image-generation").ImageResponseHeaders; contentLevel: import("../core/image-generation").ImageContentLevel; modelId: string; createdAt: number };
function redactMetadata(value: unknown, key: string): unknown { if (typeof value === "string") return value.replaceAll(key, "[redacted]"); if (Array.isArray(value)) return value.map(item => redactMetadata(item, key)); if (object(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name.replaceAll(key, "[redacted]"), redactMetadata(item, key)])); return value; }
export function validImageTarget(v: unknown): v is ImageTarget {
  return object(v) && imageKey(v.worldId) && imageKey(v.chatId) && typeof v.chatUrl === "string" && v.chatUrl.length <= 2048 && typeof v.messageKey === "string" && v.messageKey.length > 0 && v.messageKey.length <= 1000;
}
export function validImageJob(v: unknown): v is ImageJobInput {
  return validImageTarget(v) && object(v) && imageKey(v.providerId) && (v.entityId === undefined || imageKey(v.entityId))
    && typeof v.prompt === "string" && !!v.prompt.trim() && v.prompt.length <= 12_000 && validImageSeed(v.seed)
    && Array.isArray(v.referenceKeys) && v.referenceKeys.length <= 128 && v.referenceKeys.every(imageKey) && (v.references !== undefined || new Set(v.referenceKeys).size === v.referenceKeys.length)
    && (v.referenceChoices === undefined || validImageReferenceChoices(v.referenceChoices))
    && (v.aspectRatio === undefined || validImageAspect(v.aspectRatio))
    && (v.entityIds === undefined || Array.isArray(v.entityIds) && v.entityIds.length <= MAX_IMAGE_SCENE_CHARACTERS && v.entityIds.every(imageKey))
    && (v.references === undefined || Array.isArray(v.references) && v.references.length <= 128 && v.references.every(r => object(r) && imageKey(r.entityId) && imageKey(r.key)) && new Set(v.references.map(r => JSON.stringify(r))).size === v.references.length);
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
      if (error instanceof ImageApiError) throw new ImageApiError(error.code, Object.fromEntries(Object.entries(error.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")])), undefined, undefined, error.diagnostic ? redactMetadata(error.diagnostic, key) as typeof error.diagnostic : undefined);
      throw new ImageApiError("failed");
    }
  }
  async run(input: ImageJobInput, illustrationId?: string, options: { replay?: ImageReplay; review?: ImagePlanReview; attemptId?: string; onPrepared?(request: ImageReplay): Promise<void> } = {}): Promise<Illustration> {
    if (!validImageJob(input) || illustrationId !== undefined && !imageKey(illustrationId)) throw new ImageApiError("invalid");
    const lock = JSON.stringify([input.worldId, input.chatId, input.messageKey]);
    if (this.active.has(lock)) throw new ImageApiError("busy"); this.active.add(lock);
    try {
      const settings = await getImageSettings(), currentConfig = settings.profiles.find(p => p.id === input.providerId);
      if (!settings.enabled || !currentConfig?.enabled) throw new ImageApiError("disabled");
      if (options.replay && (!validImageReplay(options.replay) || currentConfig.baseUrl !== options.replay.config.baseUrl || currentConfig.kind !== options.replay.config.kind || JSON.stringify(input) !== JSON.stringify(options.replay.input))) throw new ImageApiError("changed");
      const config = options.replay?.config ?? currentConfig, contentLevel = options.replay?.contentLevel ?? settings.contentLevel;
      if (contentLevel === ADULT_CONTENT_LEVEL && settings.adultConfirmed !== true) throw new ImageApiError("adultOnly");
      if (!config.modelId || input.referenceKeys.length && !(config.editModelId || config.modelId)) throw new ImageApiError("missingModel");
      if (input.referenceKeys.length > config.maxReferences) throw new ImageApiError("invalid");
      const key = await getProviderKey(config.id); if (!key) throw new ImageApiError("missingKey");
      if (await this.repo.isLocked()) throw new ImageApiError("changed");
      const records = await this.repo.rawRecords();
      if (options.review && imageReviewContextKey(options.review.plan, input.worldId, records.filter(r => r.kind === "entity").map(r => r.data as SceneEntity), settings) !== options.review.contextKey) throw new ImageApiError("changed");
      if (!records.some(r => r.kind === "world" && r.id === input.worldId)) throw new ImageApiError("changed");
      const entity = input.entityId ? records.find(r => r.kind === "entity" && r.id === input.entityId)?.data as SceneEntity | undefined : undefined;
      if (input.entityId && entity?.worldId !== input.worldId) throw new ImageApiError("changed");
      const images: string[] = options.replay ? [...options.replay.images] : [];
      if (!options.replay) for (const reference of input.references ?? input.referenceKeys.map(key => ({ entityId: input.entityId, key }))) {
        const person = records.find(r => r.kind === "entity" && r.id === reference.entityId)?.data as SceneEntity | undefined;
        if (person?.worldId !== input.worldId) throw new ImageApiError("changed");
        const image = imageReferences(person.characterSheet).find(r => r.key === reference.key)?.image;
        if (!image) throw new ImageApiError("changed"); images.push(await normalizeImage(dataImageBlob(image), true));
      }
      const aspectRatio = input.aspectRatio ?? "16:9";
      const frozen: ImageReplay = options.replay ?? { input: structuredClone({ ...input, aspectRatio }), config: structuredClone(config), images, contentLevel };
      if (!validImageReplay(frozen)) throw new ImageApiError("invalid");
      if (options.attemptId) await patchImageAttempt(this.repo, input, options.attemptId, { status: "generating", request: frozen, error: undefined, diagnostic: undefined, headers: undefined, ticketId: undefined }, "preparing");
      await options.onPrepared?.(frozen);
      const provider = this.createProvider(config, key, this.permitted);
      let result;
      try { result = images.length ? await provider.edit({ prompt: input.prompt, images, seed: input.seed, aspectRatio }) : await provider.generate({ prompt: input.prompt, seed: input.seed, aspectRatio }); }
      catch (error) {
        if (!(error instanceof ImageApiError)) throw error;
        const headers = Object.fromEntries(Object.entries(error.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")]));
        if (error.downloadUrl && !error.downloadUrl.includes(key)) {
          const ticketId = crypto.randomUUID();
          const ticket: DownloadTicket = { request: frozen, ...(options.attemptId ? { attemptId: options.attemptId } : {}), ...(illustrationId ? { illustrationId } : {}), input: frozen.input, url: error.downloadUrl, headers, contentLevel, modelId: images.length ? config.editModelId || config.modelId : config.modelId, createdAt: Date.now() };
          const vault = await getVaultConfig(), rawKey = vault.enabled ? await getSessionKey() : null;
          if (vault.enabled && !rawKey) throw new ImageApiError("changed", headers);
          const stored = vault.enabled ? await encryptJsonWithKey(ticket, await importKey(rawKey!), decodeSalt(vault.salt!), vault.iterations!) : ticket;
          await browser.storage.session.set({ ["deeprole_image_download_" + ticketId]: stored });
          throw new ImageApiError("downloadOrigin", headers, new URL(error.downloadUrl).origin, ticketId);
        }
        const diagnostic = error.diagnostic ? redactMetadata(error.diagnostic, key) : undefined;
        throw new ImageApiError(error.code, headers, undefined, undefined, validImageDiagnostic(diagnostic) ? diagnostic : undefined);
      }
      // Credentials are not serialized into records, messages or logging.
      const headers = Object.fromEntries(Object.entries(result.headers).map(([name, value]) => [name, value.replaceAll(key, "[redacted]")]));
      const now = Date.now(); const value: Illustration = { id: illustrationId ?? createId("illustration"), worldId: input.worldId, chatId: input.chatId, messageKey: input.messageKey, ...(input.entityId ? { entityId: input.entityId } : {}), providerId: config.id, modelId: images.length ? config.editModelId || config.modelId : config.modelId, prompt: input.prompt, referenceKeys: input.referenceKeys, ...(input.seed === undefined ? {} : { seed: input.seed }), contentLevel, aspectRatio, request: frozen, image: result.image, headers, createdAt: now, updatedAt: now };
      try { await saveIllustration(value, this.repo, options.attemptId); } catch (error) { throw new ImageApiError(error instanceof Error && error.message === "image-full" ? "full" : "changed", headers); }
      if (options.attemptId) await patchImageAttempt(this.repo, input, options.attemptId, null).catch(() => undefined);
      return value;
    } finally { this.active.delete(lock); }
  }
  async start(target: ImageTarget) {
    if (!validImageTarget(target)) throw new ImageApiError("invalid");
    const settings = await getImageSettings(), config = settings.profiles.find(p => p.id === settings.profileByLevel[settings.contentLevel] && p.enabled);
    if (!settings.enabled || !config) throw new ImageApiError("disabled");
    if (!config.modelId) throw new ImageApiError("missingModel");
    if (!await getProviderKey(config.id)) throw new ImageApiError("missingKey");
    if (!await this.permitted(config.baseUrl)) throw new ImageApiError("permission");
    return startImageAttempt(this.repo, target);
  }
  async fail(target: ImageTarget, id: string, error: unknown, phase?: "plan") {
    // A content-script cleanup must not erase diagnostics already committed by the worker.
    const attempt = await imageAttempt(this.repo, target, id);
    if (attempt.status === "failed") return;
    await patchImageAttempt(this.repo, target, id, { status: "failed", error: imageErrorKey(error), diagnostic: { source: phase === "plan" ? "deepseek" : "deeprole", phase: phase ?? "local" } }, attempt.status);
  }
  async review(target: ImageTarget, id: string, review: ImagePlanReview) {
    const attempt = await imageAttempt(this.repo, target, id);
    if (attempt.status !== "preparing" || attempt.request || !validImagePlanReview(review)) throw new ImageApiError("changed");
    const entities = await this.repo.list<SceneEntity>("entity"), settings = await getImageSettings();
    if (imageReviewContextKey(review.plan, target.worldId, entities, settings) !== review.contextKey) throw new ImageApiError("changed");
    planImageInput(review.plan, target, entities, settings, review.overrides);
    await patchImageAttempt(this.repo, target, id, { status: "review", review, error: undefined, diagnostic: undefined }, "preparing");
  }
  async claimReview(target: ImageTarget, id: string, overrides: ImageReferenceOverrides): Promise<ImagePlanReview> {
    const attempt = await imageAttempt(this.repo, target, id);
    if (attempt.status !== "review" || !attempt.review || !validImageReferenceOverrides(overrides)) throw new ImageApiError("changed");
    const entities = await this.repo.list<SceneEntity>("entity"), settings = await getImageSettings(), review = attempt.review;
    if (imageReviewContextKey(review.plan, target.worldId, entities, settings) !== review.contextKey) throw new ImageApiError("changed");
    planImageInput(review.plan, target, entities, settings, overrides);
    await patchImageAttempt(this.repo, target, id, { status: "preparing", review: { ...review, overrides } }, "review");
    return { ...review, overrides };
  }
  async cancelReview(target: ImageTarget, id: string) {
    const attempt = await imageAttempt(this.repo, target, id);
    if (attempt.status !== "review") throw new ImageApiError("changed");
    await patchImageAttempt(this.repo, target, id, null, "review");
  }
  async render(target: ImageTarget, id: string, plan: ImageScenePlan) {
    const attempt = await imageAttempt(this.repo, target, id);
    if (attempt.status !== "preparing") throw new ImageApiError("changed");
    try {
      const entities = await this.repo.list<SceneEntity>("entity"), settings = await getImageSettings();
      if (settings.reviewBeforeGeneration && !attempt.review) throw new ImageApiError("changed");
      if (attempt.review && (imageReviewContextKey(attempt.review.plan, target.worldId, entities, settings) !== attempt.review.contextKey || !sameImagePlanCast(attempt.review.plan, plan))) throw new ImageApiError("changed");
      const input = planImageInput(plan, target, entities, settings, attempt.review?.overrides);
      return await this.run(input, id, { attemptId: id, review: attempt.review });
    } catch (error) {
      await patchImageAttempt(this.repo, target, id, { status: "failed", error: imageErrorKey(error), ...imageFailureDetails(error), ticketId: error instanceof ImageApiError ? error.ticketId : undefined }).catch(() => undefined); throw error instanceof ImageApiError ? error : new ImageApiError(imageErrorKey(error));
    }
  }
  async repeat(target: ImageTarget, id: string, failedAttempt = false) {
    if (!validImageTarget(target) || !imageKey(id)) throw new ImageApiError("invalid");
    const attempt = failedAttempt ? await imageAttempt(this.repo, target, id) : undefined;
    const original = failedAttempt ? undefined : await this.repo.get<Illustration>("illustration", id);
    const frozen = attempt?.request ?? original?.request;
    if (!frozen || !validImageReplay(frozen) || frozen.input.worldId !== target.worldId || frozen.input.chatId !== target.chatId || frozen.input.messageKey !== target.messageKey) throw new ImageApiError("expired");
    if (attempt && attempt.status !== "failed") throw new ImageApiError("busy");
    if (attempt?.ticketId) throw new ImageApiError("downloadOrigin");
    const job = attempt ?? await this.start(target);
    if (attempt) await patchImageAttempt(this.repo, target, job.id, { status: "preparing", error: undefined, diagnostic: undefined, headers: undefined, ticketId: undefined }, "failed");
    try {
      return await this.run(frozen.input, original?.id.startsWith("selfie:") ? original.id : job.id, { replay: frozen, attemptId: job.id });
    } catch (error) {
      await patchImageAttempt(this.repo, target, job.id, { status: "failed", error: imageErrorKey(error), ...imageFailureDetails(error), ticketId: error instanceof ImageApiError ? error.ticketId : undefined }).catch(() => undefined); throw error;
    }
  }
  async selfie(target: ImageTarget, entityId: string, turnKey: string, retry = false): Promise<Illustration> {
    if (!validImageTarget(target) || !imageKey(entityId) || !imageKey(turnKey)) throw new ImageApiError("invalid");
    const behavior = await getSettings(), world = await this.repo.get<import("../core/types").WorldProfile>("world", target.worldId);
    if (!behavior.characterSheetsEnabled) throw new ImageApiError("disabled");
    const { photo, existing } = await claimSelfie(this.repo, target, entityId, turnKey, retry, behavior.relationshipsEnabled !== false && world?.relationshipsEnabled !== false);
    if (existing) return existing;
    try {
      const settings = await getImageSettings(), entity = await this.repo.get<SceneEntity>("entity", entityId);
      if (entity?.worldId !== target.worldId) throw new ImageApiError("changed");
      const saved = entity.characterSheet?.imageGeneration;
      const profile: CharacterImagePrompt = { canonical: entity.characterSheet?.appearance || photo.generation?.appearance || "", sceneDelta: "", prefix: "", suffix: "", format: "prose", ...saved };
      if (!profile.canonical.trim()) profile.canonical = entity.characterSheet?.appearance || photo.generation?.appearance || "";
      const referencePolicy = profile.referencePolicy ?? "auto";
      const wantsAlternate = referencePolicy === "suggestive" || referencePolicy === "auto" && photo.generation?.reference === "suggestive";
      const referenceKey = wantsAlternate && settings.contentLevel !== "off" ? profile.suggestiveReferenceKey || profile.referenceKey : profile.referenceKey;
      const available = imageReferences(entity.characterSheet);
      const selected = available.find(r => r.key === referenceKey) ?? available.find(r => r.key === profile.referenceKey);
      const referenceKeys = selected ? [selected.key] : [];
      if (!referenceKeys.length && !profile.canonical.trim()) throw new ImageApiError("missingAppearance");
      const providerId = settings.profileByLevel[settings.contentLevel];
      if (!providerId) throw new ImageApiError("missingModel");
      const look = wantsAlternate && settings.contentLevel !== "off" && selected?.key === profile.suggestiveReferenceKey ? profile.suggestiveReferenceContext : profile.referenceContext;
      const prompt = buildImagePrompt(profile, settings, ["Selfie photograph, portrait 9:16. " + photo.generation!.scene, selected && look].filter(Boolean).join("\n"));
      const input = photo.generation?.request?.input ?? { ...target, entityId, providerId, referenceKeys, prompt, aspectRatio: "9:16" as const, ...(profile.seed === undefined ? {} : { seed: profile.seed }) };
      const result = await this.run(input, selfieIllustrationId(photo), { replay: photo.generation?.request, onPrepared: request => finishSelfie(this.repo, target, photo, { request }) });
      await finishSelfie(this.repo, target, photo, { status: "ready", illustrationId: result.id, request: undefined, error: undefined, ticketId: undefined });
      return result;
    } catch (error) {
      await finishSelfie(this.repo, target, photo, { status: "failed", error: imageErrorKey(error), ticketId: error instanceof ImageApiError ? error.ticketId : undefined }).catch(() => undefined);
      throw error;
    }
  }
  async ticket(ticketId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new ImageApiError("expired");
    const stored = (await browser.storage.session.get("deeprole_image_download_" + ticketId))["deeprole_image_download_" + ticketId] as DownloadTicket | EncryptedEnvelope | undefined;
    let value: DownloadTicket | undefined;
    if (stored && "format" in stored) { const rawKey = await getSessionKey(); if (!rawKey) throw new ImageApiError("changed"); value = await decryptJsonWithKey<DownloadTicket>(stored, await importKey(rawKey)); }
    else value = stored;
    if (!value || value.createdAt + 15 * 60_000 < Date.now() || !validImageJob(value.input) || value.request !== undefined && (!validImageReplay(value.request) || JSON.stringify(value.request.input) !== JSON.stringify(value.input)) || value.illustrationId !== undefined && !imageKey(value.illustrationId)) { await browser.storage.session.remove("deeprole_image_download_" + ticketId); throw new ImageApiError("expired"); }
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
      const image = await normalizeImage(blob, false, ticket.input.aspectRatio), now = Date.now(), input = ticket.input;
      const illustration: Illustration = { id: ticket.illustrationId ?? createId("illustration"), worldId: input.worldId, chatId: input.chatId, messageKey: input.messageKey, ...(input.entityId ? { entityId: input.entityId } : {}), providerId: input.providerId, modelId: ticket.modelId, prompt: input.prompt, referenceKeys: input.referenceKeys, ...(input.seed === undefined ? {} : { seed: input.seed }), contentLevel: ticket.contentLevel, ...(ticket.request ? { request: ticket.request } : {}), aspectRatio: input.aspectRatio, image, headers: ticket.headers, createdAt: now, updatedAt: now };
      await saveIllustration(illustration, this.repo, ticket.attemptId); if (ticket.attemptId) await patchImageAttempt(this.repo, input, ticket.attemptId, null).catch(() => undefined); await browser.storage.session.remove("deeprole_image_download_" + ticketId); return illustration;
    } catch (error) { if (error instanceof ImageApiError) throw error; throw new ImageApiError(controller.signal.aborted ? "timeout" : error instanceof Error && error.message === "image-too-large" ? "imageTooLarge" : "failed"); }
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
