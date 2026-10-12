import { expect, test, type Page } from "@playwright/test";
import type { NativeStoryExchange } from "../../src/core/story-exchange";

async function openRepository(page: Page, dbName: string) {
  await page.goto("/tests/fixtures/deepseek.html");
  await page.addScriptTag({ url: "/tests/fixtures/portrait-storage.js" });
  await page.evaluate(async dbName => {
    const dbUrl = "/src/storage/database.ts", repoUrl = "/src/storage/repository.ts", ingestUrl = "/src/storage/story-exchange.ts", timelineUrl = "/src/storage/story-history.ts";
    const { DeepRoleDatabase } = await import(dbUrl), { DeepRoleRepository } = await import(repoUrl), { observeNativeStoryExchange } = await import(ingestUrl), { readStoryTimeline } = await import(timelineUrl);
    const db = new DeepRoleDatabase(dbName), repo = new DeepRoleRepository(db);
    (window as any).exchangeFixture = { db, repo, observeNativeStoryExchange, readStoryTimeline };
  }, dbName);
}
async function observe(page: Page, branchId: string, input: NativeStoryExchange) {
  return page.evaluate(({ branchId, input }) => {
    const f = (window as any).exchangeFixture;
    return f.observeNativeStoryExchange(branchId, input, f.repo);
  }, { branchId, input });
}

for (const locale of ["ru", "en"] as const) test(`atomic native exchange survives two real tabs and reload in ${locale}`, async ({ page, context }) => {
  const dbName = "story-exchange-e2e-" + crypto.randomUUID(); let sibling: Page | null = null;
  await openRepository(page, dbName);
  try {
    const seed: { branchId: string; input: NativeStoryExchange; originals: string; hasLocks: boolean } = await page.evaluate(async locale => {
      const fixtureUrl = "/tests/fixtures/story-worlds.ts", historyUrl = "/src/storage/story-history.ts", requestsUrl = "/src/storage/story-requests.ts", digestUrl = "/src/core/story-exchange.ts";
      const { storyWorld } = await import(fixtureUrl), { ensureLegacyStory } = await import(historyUrl), { prepareStoryRequest, settleStoryRequest } = await import(requestsUrl), { nativeStorySampleDigest } = await import(digestUrl);
      const f = (window as any).exchangeFixture, fixture = storyWorld(locale); await f.repo.mergeRecords(fixture.records);
      const originals = JSON.stringify(await f.repo.rawRecords()), branch = await ensureLegacyStory({ worldId: fixture.world.id, bindingId: fixture.binding.id }, f.repo), id = "request-" + crypto.randomUUID();
      await prepareStoryRequest(branch.id, { id, purpose: "user-turn", bindingId: fixture.binding.id, identity: { chatId: fixture.binding.chatId, nativeParentKey: null }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" }, f.repo);
      await settleStoryRequest(id, { status: "accepted", httpStatus: 200 }, f.repo);
      const user = { identity: { role: "user" as const, nativeMessageKey: '["message","1"]', nativeParentKey: null }, completion: "complete" as const, content: locale === "ru" ? "Продолжай." : "Continue." };
      const assistant = { identity: { role: "assistant" as const, nativeMessageKey: '["message","2"]', nativeParentKey: '["message","1"]' }, completion: "complete" as const, content: locale === "ru" ? "Мира передала ключ мастеру." : "Mira delivered the key to the maker." };
      const input: NativeStoryExchange = { requestId: id, chatId: fixture.binding.chatId, metadata: structuredClone([assistant.identity, user.identity]), link: { requestId: id, chatId: fixture.binding.chatId, nativeParentKey: null, userMessageKey: user.identity.nativeMessageKey, assistantMessageKey: assistant.identity.nativeMessageKey },
        terminal: { requestId: id, nativeMessageKey: assistant.identity.nativeMessageKey, completion: "complete", sampleDigest: (await nativeStorySampleDigest(assistant))! }, user, assistant };
      return { branchId: branch.id, input, originals, hasLocks: !!navigator.locks };
    }, locale);
    expect(seed.hasLocks).toBe(true); // This scenario exercises browser-wide Web Locks, not the unit fallback.
    const unknown = await observe(page, seed.branchId, { ...seed.input, terminal: null }); expect(unknown).toMatchObject({ status: "paused", issue: { code: "lifecycle-unknown" } });
    sibling = await context.newPage(); await openRepository(sibling, dbName);
    const results = await Promise.all([observe(page, seed.branchId, seed.input), observe(sibling, seed.branchId, seed.input)]);
    expect(results.map(row => row.status).sort()).toEqual(["already-recorded", "recorded"]); expect({ ...results[0], status: "same" }).toEqual({ ...results[1], status: "same" });
    const changed = structuredClone(seed.input); changed.assistant!.content += " Unrelated later text.";
    expect(await observe(page, seed.branchId, changed)).toMatchObject({ status: "paused", issue: { code: "stale-sample" } });
    const state = await page.evaluate(async branchId => {
      const f = (window as any).exchangeFixture, timeline = await f.readStoryTimeline(branchId, f.repo);
      return { originals: JSON.stringify((await f.repo.rawRecords()).filter((row: any) => row.kind !== "story")), revisions: timeline.revisions.length, events: timeline.events.length, head: timeline.branch.headRevisionId, projection: timeline.projection };
    }, seed.branchId);
    expect(state).toEqual({ originals: seed.originals, revisions: 2, events: 0, head: null, projection: null });
    await page.evaluate(() => (window as any).exchangeFixture.db.close()); await openRepository(page, dbName);
    expect(await observe(page, seed.branchId, seed.input)).toEqual({ ...results[0], status: "already-recorded" });
  } finally {
    if (sibling) { await sibling.evaluate(() => (window as any).exchangeFixture?.db.close()); await sibling.close(); }
    await page.evaluate(async () => { const f = (window as any).exchangeFixture; if (f) await f.db.delete(); });
  }
});
