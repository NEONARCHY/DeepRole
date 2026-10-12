import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { castParts, castSources } from "../src/core/cast-initialization";

describe("portable live cast test world", () => {
  it("imports separately, keeps all three adults in the source, and never starts automatically", () => {
    const file = readFileSync("tests/fixtures/cast-live-world.json", "utf8");
    const pack = parseWorldPackage(file);
    expect(pack.records).toHaveLength(1);
    const cloned = cloneWorldPackage(pack);
    expect(cloned[0]!.id).not.toBe(pack.records[0]!.id);
    expect(cloned[0]!.data).toMatchObject({ autoPrepareCharacters: false });
    const sources = castSources(cloned, cloned[0]!.id);
    expect(sources).toHaveLength(1);
    for (const person of ["Леон, 28 лет", "Мира, 29 лет", "Нора, 31 год"]) expect(sources[0]!.text).toContain(person);
    expect(castParts(sources)).toHaveLength(1);
    expect(sources[0]!.text).toContain("Ремонт ворот только запланирован, он ещё не выполнен.");
  });
});
