import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-generation";
import { imagePlanInstruction, imagePlanRoster, parseImageScenePlan, planImageInput, validImageReplay } from "../src/core/image-plan";
import { selfieImageKey } from "../src/core/selfies";
import type { SceneEntity } from "../src/core/types";
import { profile, realPng, world } from "./image-fixtures";
import { VeniceNativeProvider } from "../src/adapters/image/venice-native";
import { ImageTransport } from "../src/adapters/image/transport";

afterEach(() => vi.unstubAllGlobals());
const people: SceneEntity[] = Array.from({length: 8}, (_, index) => {
  const image = "data:image/png;base64," + btoa("synthetic-reference-" + index);
  return {id: "person-" + index, name: "Astronomer " + index, worldId: world.id, kind: "character", description: "A fictional adult astronomer.", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1,
    characterSheet: {...EMPTY_CHARACTER, portraitLibrary: [image], imageGeneration: {canonical: "Distinctive blue coat " + index, sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(image)}}};
});
const target = {worldId: world.id, chatId: "group", chatUrl: "https://chat.deepseek.com/a/chat/s/group", messageKey: "group-reply"};
const config = {...profile, maxReferences: 6};
const settings = {...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [config], profileByLevel: {off: config.id}};
const groupPlan = (count: number) => ({scene: "At the observatory, a group discusses an astronomical chart.", characters: people.slice(0, count).map((person, index) => ({id: person.id, reference: "neutral" as const, appearance: "A wool coat under evening light.", action: "Holding chart " + index, position: "Standing at table position " + index, focus: index === 0 ? "primary" as const : "background" as const}))});

it.each([1, 3, 6])("attaches every assigned reference for %s actual participants, in identity order", count => {
  const plan = groupPlan(count), input = planImageInput(plan, target, people, settings);
  expect(input.entityIds).toEqual(people.slice(0, count).map(p => p.id));
  expect(input.references).toEqual(people.slice(0, count).map(p => ({entityId: p.id, key: p.characterSheet!.imageGeneration!.referenceKey})));
  for (let index = 0; index < count; index++) {
    expect(input.prompt).toContain("Holding chart " + index); expect(input.prompt).toContain("Standing at table position " + index);
    expect(input.prompt).toContain("Reference " + (index + 1) + " preserves the identity of Astronomer " + index);
  }
  expect(input.prompt).not.toContain("data:image");
  expect(input.prompt).not.toContain("Astronomer " + count);
});
it("allows a larger cast than six without inventing a provider-specific ceiling", () => {
  const input = planImageInput(groupPlan(8), target, people, {...settings, profiles: [{...config, maxReferences: 8}]});
  expect(input.references).toHaveLength(8); expect(input.entityIds).toHaveLength(8);
  expect(validImageReplay({input, config: {...config, maxReferences: 8}, contentLevel: "off", images: people.map(p => p.characterSheet!.portraitLibrary![0])})).toBe(true);
});
it("prioritizes the interlocutor's reference without erasing background participants", () => {
  const plan = groupPlan(6); plan.characters[0]!.focus = "background"; plan.characters[5]!.focus = "primary";
  const input = planImageInput(plan, target, people, {...settings, profiles: [{...config, maxReferences: 2}]});
  expect(input.references?.map(r => r.entityId)).toEqual(["person-5", "person-0"]);
  expect(input.entityIds).toHaveLength(6);
  expect(input.prompt).toContain("Focus: primary"); expect(input.prompt).toContain("Focus: background");
  expect(input.prompt).toContain("configured reference limit");
  for (const p of people.slice(0, 6)) expect(input.prompt).toContain(p.name);
});
it("a model's none label cannot suppress an existing user-assigned ordinary reference", () => {
  const plan = groupPlan(1); const input = planImageInput({...plan, characters: [{...plan.characters[0]!, reference: "none"}]}, target, people, settings);
  expect(input.references).toHaveLength(1);
});
it("a missing portrait uses text without changing the numbers of the remaining references", () => {
  const cast = people.map((p, i) => i === 1 ? {...p, characterSheet: {...p.characterSheet!, portraitLibrary: []}} : p);
  const input = planImageInput(groupPlan(3), target, cast, settings);
  expect(input.entityIds).toHaveLength(3); expect(input.references?.map(r => r.entityId)).toEqual(["person-0", "person-2"]);
  expect(input.prompt).toContain("Reference 2 preserves the identity of Astronomer 2");
  expect(input.prompt).toContain("no assigned reference image");
});
it("asks for the complete actual cast and spatial/focus details, without disclosing pixels or model IDs", () => {
  const instruction = imagePlanInstruction({completedScene: groupPlan(6).scene, roster: imagePlanRoster(people), referenceBudget: 6});
  expect(instruction).toContain('"action"'); expect(instruction).toContain('"position"'); expect(instruction).toContain('"focus"');
  expect(instruction).toContain("every participant"); expect(instruction).toContain("background blur");
  expect(instruction).not.toContain("up to six"); expect(instruction).not.toContain("synthetic-image-model"); expect(instruction).not.toContain("data:image");
});
it.each([{action: 1}, {position: "x".repeat(241)}, {focus: "invisible"}])("rejects invalid optional per-person field %j", patch => {
  const plan = groupPlan(1); expect(() => parseImageScenePlan(JSON.stringify({...plan, characters: [{...plan.characters[0], ...patch}]}))).toThrow("invalidPlan");
});
it("still accepts saved legacy plans without per-person action or focus", () => {
  const legacy = {scene: groupPlan(1).scene, characters: [{id: people[0]!.id, reference: "neutral" as const, appearance: "A blue coat."}]};
  expect(parseImageScenePlan(JSON.stringify(legacy))).toEqual(legacy);
  expect(planImageInput(legacy, target, people, settings).references).toHaveLength(1);
});
it("sends six data URLs through Venice multi-edit unchanged and reads binary output", async () => {
  const providerConfig = {...config, kind: "venice-native" as const, editModelId: "synthetic-group-model", extraParams: {futureOption: {values: [1, "two", false]}}};
  const fetchMock = vi.fn(async () => new Response(Uint8Array.from(atob(realPng), c => c.charCodeAt(0)), {headers: {"content-type": "image/png"}})); vi.stubGlobal("fetch", fetchMock);
  const images = people.slice(0, 6).map(p => p.characterSheet!.portraitLibrary![0]!);
  const provider = new VeniceNativeProvider(providerConfig, new ImageTransport(providerConfig, "synthetic-private-key", async () => true, async () => "data:image/png;base64," + realPng));
  await provider.edit({prompt: "Six fictional astronomers at a chart table.", images});
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit], body = JSON.parse(init.body as string);
  expect(url).toMatch(/\/image\/multi-edit$/); expect(body.images).toEqual(images); expect(body.futureOption).toEqual(providerConfig.extraParams.futureOption);
  expect(body.modelId).toBe(providerConfig.editModelId); expect(body).not.toHaveProperty("model"); expect(fetchMock).toHaveBeenCalledOnce();
});
it("does not invent a reference limit from Venice's combineImages flag", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({data: [{id: "synthetic-group-model", model_spec: {constraints: {combineImages: true}}}]}), {headers: {"content-type": "application/json"}})));
  const models = await new VeniceNativeProvider(config, new ImageTransport(config, "synthetic-private-key", async () => true)).listModels();
  expect(models[0]?.maxInputImages).toBeUndefined();
});
