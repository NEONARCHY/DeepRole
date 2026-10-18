import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseWorldPackage } from "../src/storage/worlds";
import { decodeStoryMemory } from "../src/core/story-memory-transport";

it("ships valid isolated RP-05 live-test worlds", () => {
  // Pin the old synthetic world: cleaning downloads must not break this fixture.
  const source = readFileSync("tests/fixtures/story-rp05-live-world.json", "utf8");
  const pack = parseWorldPackage(source);
  expect(pack.records.filter((record) => record.kind === "world")).toHaveLength(1);
  expect(pack.records.filter((record) => record.kind === "entity")).toHaveLength(5);
  expect(pack.records.filter((record) => record.kind === "entry")).toHaveLength(4);
  expect(pack.records.filter((record) => record.kind === "template")).toHaveLength(1);
  const neutral = parseWorldPackage(readFileSync("tests/fixtures/DeepRole-RP319-test-world-20261018.json", "utf8"));
  expect(neutral.records.filter(record => record.kind === 'world')).toHaveLength(1);
  expect(neutral.records.filter(record => record.kind === 'entity')).toHaveLength(2);
  expect(neutral.records.filter(record => record.kind === 'entry')).toHaveLength(0);
  expect(neutral.records.filter(record => record.kind === 'template')).toHaveLength(1);
  expect(neutral.records.find(record => record.kind === 'world')!.data).not.toHaveProperty('sharedGame');
  const probe = readFileSync('tests/fixtures/DeepRole-RP319-live-probe-20261018.txt', 'utf8');
  const payload = JSON.parse(probe.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.split('\n')[2]!);
  const facts = decodeStoryMemory(payload);
  expect(payload.format).toBe('deeprole-memory-prefixes-v1');
  expect(facts).toHaveLength(8);
  expect(facts[0]!.task?.status).toBe('open');
  expect(facts[1]!.task?.status).toBe('completed');
  expect(facts[4]!.kind).toBe('belief');
  expect(facts.every(fact => !fact.sourceQuote)).toBe(true);
});
