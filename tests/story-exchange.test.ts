import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/core/id";
import { matchNativeStoryExchange, nativeStorySampleDigest, validNativeStorySample, type NativeStoryExchange, type StoryExchangePauseCode } from "../src/core/story-exchange";
import { storyRow, type StoryRequest, type StoryRevision } from "../src/core/story-records";
import { nativeStoryMessageKey as key, validNativeStoryIdentity } from "../src/core/story-transport";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { observeNativeStoryExchange } from "../src/storage/story-exchange";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation } from "../src/storage/story-history";
import { anchorStoryCheckpoint } from "../src/storage/story-observer";
import { prepareStoryRequest, settleStoryRequest, type StoryRequestPreparation } from "../src/storage/story-requests";
import { selectStoryRevision } from "../src/storage/story-selection";
import { removeWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("story-exchange-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function sample(request: StoryRequestPreparation, userId = "1", assistantId = "2", userParent = request.identity.nativeParentKey): Promise<NativeStoryExchange> {
  const user = { identity: { role: "user" as const, nativeMessageKey: key(userId), nativeParentKey: userParent }, completion: "complete" as const, content: "Продолжай. Continue." };
  const assistant = { identity: { role: "assistant" as const, nativeMessageKey: key(assistantId), nativeParentKey: key(userId) }, completion: "complete" as const, content: "Мира передала ключ. Mira delivered the key." };
  return { requestId: request.id, chatId: request.identity.chatId, metadata: structuredClone([assistant.identity, user.identity]), link: { requestId: request.id, chatId: request.identity.chatId, nativeParentKey: request.identity.nativeParentKey, userMessageKey: key(userId), assistantMessageKey: key(assistantId) },
    terminal: { requestId: request.id, nativeMessageKey: key(assistantId), completion: assistant.completion, sampleDigest: (await nativeStorySampleDigest(assistant))! }, user, assistant };
}
async function setup(accept = true, anchor = false) {
  const fixture = storyWorld("ru"), { db, repo } = empty(); await repo.mergeRecords(fixture.records);
  const branch = await ensureLegacyStory({ worldId: fixture.world.id, bindingId: fixture.binding.id }, repo);
  if (anchor) await anchorStoryCheckpoint(branch.id, { identity: { chatId: fixture.binding.chatId, nativeParentKey: null }, role: null, completion: "complete", expectedSceneRevision: "legacy-scene-a" }, repo);
  const request: StoryRequestPreparation = { id: createId("request"), purpose: "user-turn", bindingId: fixture.binding.id, identity: { chatId: fixture.binding.chatId, nativeParentKey: null }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" };
  await prepareStoryRequest(branch.id, request, repo);
  if (accept) await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, repo);
  return { ...fixture, db, repo, branch, request, input: await sample(request) };
}
async function record(f: Awaited<ReturnType<typeof setup>>) {
  const result = await observeNativeStoryExchange(f.branch.id, f.input, f.repo);
  if (result.status === "paused") throw new Error(result.issue.code);
  return result;
}
async function selected(f: Awaited<ReturnType<typeof setup>>) {
  const first = await record(f);
  const selection = await selectStoryRevision(f.branch.id, { headRevisionId: first.assistantRevisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
  return { first, selection };
}
async function retry(f: Awaited<ReturnType<typeof setup>>) {
  const { first, selection } = await selected(f);
  const request: StoryRequestPreparation = { ...f.request, id: createId("request"), purpose: "assistant-retry", parentRevisionId: first.userRevisionId, identity: { chatId: f.binding.chatId, nativeParentKey: key("1") }, expectedHeadRevisionId: first.assistantRevisionId, expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
  await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
  const input = await sample(request, "1", "2", null); input.user = null;
  return { first, request, input };
}

describe("request-bound native exchange ingestion, internal only", () => {
  it("records a user/reply pair atomically without choosing a branch or changing memory", async () => {
    const f = await setup(), before = await f.repo.rawRecords(); const put = vi.spyOn(f.db.records, "bulkPut");
    const result = await record(f), timeline = await readStoryTimeline(f.branch.id, f.repo);
    expect(result.status).toBe("recorded"); expect(put.mock.calls.some(([rows]) => rows.length === 2)).toBe(true);
    expect(timeline.revisions).toHaveLength(2); expect(timeline.revisions.find(row => row.id === result.assistantRevisionId)?.parentRevisionId).toBe(result.userRevisionId);
    expect(timeline.branch.headRevisionId).toBeNull(); expect(timeline.events).toEqual([]); expect(timeline.projection).toBeNull();
    expect((await f.repo.rawRecords()).filter(row => ![result.userRevisionId, result.assistantRevisionId].includes(row.id))).toEqual(before);
  });
  it("reuses both stable IDs on concurrent delivery and after repeat", async () => {
    const f = await setup();
    const results = await Promise.all([observeNativeStoryExchange(f.branch.id, f.input, f.repo), observeNativeStoryExchange(f.branch.id, f.input, new DeepRoleRepository(f.db))]);
    expect(results.map(row => row.status).sort()).toEqual(["already-recorded", "recorded"]);
    expect({ ...results[0], status: "same" }).toEqual({ ...results[1], status: "same" });
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toEqual({ ...results[0], status: "already-recorded" }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("rolls back both sources if a write fails after its first row, then retries safely", async () => {
    const f = await setup(), before = await f.repo.rawRecords();
    const put = vi.spyOn(f.db.records, "bulkPut").mockImplementationOnce(rows => f.db.records.put(rows[0]!).then(() => { throw new Error("synthetic-write-failure"); }));
    await expect(observeNativeStoryExchange(f.branch.id, f.input, f.repo)).rejects.toThrow("synthetic-write-failure"); expect(await f.repo.rawRecords()).toEqual(before); put.mockRestore();
    expect((await record(f)).status).toBe("recorded");
  });
  it("freezes all input before the asynchronous hash and queued write", async () => {
    const f = await setup(), input = structuredClone(f.input), pending = observeNativeStoryExchange(f.branch.id, input, f.repo);
    input.assistant!.content = "Changed"; input.metadata![0]!.nativeParentKey = key("foreign"); input.link!.assistantMessageKey = key("foreign"); input.terminal!.sampleDigest = "sha256:" + "f".repeat(64);
    const result = await pending; expect(result.status).toBe("recorded");
    expect((await readStoryTimeline(f.branch.id, f.repo)).revisions.find(row => row.role === "assistant")?.content).toBe(f.input.assistant!.content);
  });
  it("does not infer the request association from a unique child or an echoed protocol ID", async () => {
    const f = await setup(); f.input.link = null; f.input.assistant!.content = `<deeprole_characters>{"request":"${f.request.id}"}</deeprole_characters>`;
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toEqual({ status: "paused", issue: { code: "request-link-missing", path: "link" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps two concurrent requests from one parent separate using explicit transport links", async () => {
    const f = await setup(), request = { ...f.request, id: createId("request") };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const second = await sample(request, "3", "4"), metadata = [...f.input.metadata!, ...second.metadata!]; f.input.metadata = metadata; second.metadata = metadata;
    const results = await Promise.all([observeNativeStoryExchange(f.branch.id, f.input, f.repo), observeNativeStoryExchange(f.branch.id, second, f.repo)]);
    expect(results.map(row => row.status)).toEqual(["recorded", "recorded"]);
    const timeline = await readStoryTimeline(f.branch.id, f.repo); expect(timeline.revisions).toHaveLength(4); expect(timeline.branch.headRevisionId).toBeNull();
    expect(timeline.revisions.filter(row => row.requestId === request.id).map(row => row.nativeMessageKey).sort()).toEqual([key("3"), key("4")]);
  });
  const invalid: [string, StoryExchangePauseCode, (input: NativeStoryExchange) => void][] = [
    ["missing-link", "request-link-missing", input => { input.link = null; }],
    ["unknown-lifecycle", "lifecycle-unknown", input => { input.terminal = null; }],
    ["missing-metadata", "native-metadata-unavailable", input => { input.metadata = null; }],
    ["foreign-chat", "chat-mismatch", input => { input.chatId = "foreign-chat"; }],
    ["foreign-receipt", "request-missing", input => { input.requestId = "foreign-request"; }],
    ["link-receipt", "request-link-mismatch", input => { input.link!.requestId = "foreign-request"; }],
    ["link-chat", "request-link-mismatch", input => { input.link!.chatId = "foreign-chat"; }],
    ["link-parent", "request-link-mismatch", input => { input.link!.nativeParentKey = key("foreign-parent"); }],
    ["link-self", "request-link-invalid", input => { input.link!.assistantMessageKey = key("1"); }],
    ["link-virtual", "request-link-invalid", input => { input.link!.assistantMessageKey = '["virtual","2"]'; }],
    ["extra-link-field", "request-link-invalid", input => { (input.link as any).PRIVATE_FIELD = "PRIVATE_SECRET"; }],
    ["missing-native-user", "native-message-missing", input => { input.metadata = input.metadata!.slice(0, 1); }],
    ["missing-native-assistant", "native-message-missing", input => { input.metadata = input.metadata!.slice(1); }],
    ["duplicate-native-id", "native-metadata-invalid", input => { input.metadata!.push(input.metadata![0]!); }],
    ["native-cycle", "native-metadata-invalid", input => { input.metadata![1]!.nativeParentKey = key("2"); }],
    ["unknown-native-role", "native-metadata-invalid", input => { (input.metadata![0] as any).role = ["assistant"]; }],
    ["wrong-user-parent", "request-link-mismatch", input => { input.metadata![1]!.nativeParentKey = key("foreign-parent"); }],
    ["wrong-assistant-parent", "request-link-mismatch", input => { input.metadata![0]!.nativeParentKey = key("foreign-parent"); }],
    ["missing-user-sample", "sample-unavailable", input => { input.user = null; }],
    ["missing-assistant-sample", "sample-unavailable", input => { input.assistant = null; }],
    ["sample-native-key", "sample-identity-mismatch", input => { input.assistant!.identity.nativeMessageKey = key("foreign"); }],
    ["sample-user-role", "sample-identity-mismatch", input => { input.user!.identity.role = "assistant"; }],
    ["blank-sample", "sample-invalid", input => { input.assistant!.content = " "; }],
    ["oversized-sample", "sample-invalid", input => { input.assistant!.content = "x".repeat(250001); }],
    ["service-sample", "sample-invalid", input => { input.assistant!.content = "[DeepRole Service]\nprivate"; }],
    ["mode-sample", "sample-invalid", input => { input.user!.content = "<deeprole_character_mode>mode"; }],
    ["partial-user", "sample-invalid", input => { input.user!.completion = "partial"; }],
    ["unknown-terminal-state", "lifecycle-invalid", input => { (input.terminal as any).completion = "streaming"; }],
    ["terminal-receipt", "lifecycle-mismatch", input => { input.terminal!.requestId = "foreign-request"; }],
    ["terminal-key", "lifecycle-mismatch", input => { input.terminal!.nativeMessageKey = key("foreign"); }],
    ["terminal-state", "lifecycle-mismatch", input => { input.terminal!.completion = "interrupted"; }],
    ["terminal-malformed-hash", "lifecycle-invalid", input => { input.terminal!.sampleDigest = "PRIVATE_HASH"; }],
    ["terminal-stale-hash", "stale-sample", input => { input.terminal!.sampleDigest = "sha256:" + "0".repeat(64); }],
    ["changed-text", "stale-sample", input => { input.assistant!.content += " Later DOM text."; }],
    ["extra-input-field", "invalid-input", input => { (input as any).PRIVATE_FIELD = "PRIVATE_SECRET"; }],
  ];
  it.each(invalid)("pauses %s without recording half of the exchange", async (_label, code, mutate) => {
    const f = await setup(), before = await f.repo.rawRecords(), input = structuredClone(f.input); mutate(input);
    const result = await observeNativeStoryExchange(f.branch.id, input, f.repo);
    expect(result).toMatchObject({ status: "paused", issue: { code } }); expect(await f.repo.rawRecords()).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Мира|Mira/);
    expect(JSON.stringify(result)).not.toContain(f.request.id); expect(JSON.stringify(result)).not.toContain(f.binding.chatId);
    if (result.status === "paused") { expect(Object.keys(result).sort()).toEqual(["issue", "status"]); expect(Object.keys(result.issue).sort()).toEqual(["code", "path"]); }
  });
  it.each(["prepared", "failed"] as const)("does not ingest an %s delivery", async state => {
    const f = await setup(false); if (state === "failed") await settleStoryRequest(f.request.id, { status: "failed", reason: "network", httpStatus: null }, f.repo);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toMatchObject({ status: "paused", issue: { code: "request-unaccepted" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps context-less old receipts unknown instead of silently upgrading them", async () => {
    const f = await setup(); const request = (await f.repo.get<StoryRequest>("story", f.request.id))!; delete request.context; await f.repo.mergeRecords([storyRow(request)]);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toMatchObject({ status: "paused", issue: { code: "context-unknown" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["partial", "interrupted"] as const)("archives explicitly known %s text but never applies it", async completion => {
    const f = await setup(); f.input.assistant!.completion = completion; f.input.terminal!.completion = completion; f.input.terminal!.sampleDigest = (await nativeStorySampleDigest(f.input.assistant))!;
    const first = await record(f); await expect(selectStoryRevision(f.branch.id, { headRevisionId: first.assistantRevisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo)).rejects.toThrow("story-source-incomplete");
    f.input.assistant!.completion = "complete"; f.input.terminal!.completion = "complete"; f.input.terminal!.sampleDigest = (await nativeStorySampleDigest(f.input.assistant))!;
    const complete = await record(f); expect(complete.userRevisionId).toBe(first.userRevisionId); expect(complete.assistantRevisionId).not.toBe(first.assistantRevisionId);
    const sources = (await readStoryTimeline(f.branch.id, f.repo)).revisions; expect(new Set(sources.filter(row => row.role === "assistant").map(row => row.messageId)).size).toBe(1);
  });
  it("observes a retry without fabricating another user, and rejects a terminal from the previous request", async () => {
    const f = await setup(), next = await retry(f), before = await f.repo.rawRecords();
    const stale = { ...next.input, terminal: f.input.terminal };
    expect(await observeNativeStoryExchange(f.branch.id, stale, f.repo)).toMatchObject({ status: "paused", issue: { code: "lifecycle-mismatch" } }); expect(await f.repo.rawRecords()).toEqual(before);
    const result = await observeNativeStoryExchange(f.branch.id, next.input, f.repo); expect(result.status).toBe("recorded");
    if (result.status === "paused") return;
    expect(result.userRevisionId).toBeNull(); expect(result.assistantRevisionId).not.toBe(next.first.assistantRevisionId);
    const timeline = await readStoryTimeline(f.branch.id, f.repo); expect(timeline.revisions.filter(row => row.role === "user")).toHaveLength(1);
    expect(timeline.revisions.find(row => row.id === result.assistantRevisionId)?.parentRevisionId).toBe(next.first.userRevisionId); expect(timeline.branch.headRevisionId).toBe(next.first.assistantRevisionId);
  });
  it("requires a retry's supplied user sample to match the saved exact revision", async () => {
    const f = await setup(), next = await retry(f); next.input.user = f.input.user; next.input.user!.content = "Changed early user";
    expect(await observeNativeStoryExchange(f.branch.id, next.input, f.repo)).toMatchObject({ status: "paused", issue: { code: "source-conflict" } });
    next.input.user = { ...f.input.user!, content: "Продолжай. Continue." }; expect((await observeNativeStoryExchange(f.branch.id, next.input, f.repo)).status).toBe("recorded");
  });
  it("accepts an ordinary next pair with an explicit missing-page boundary to its known local parent", async () => {
    const f = await setup(), { first, selection } = await selected(f);
    const request: StoryRequestPreparation = { ...f.request, id: createId("request"), parentRevisionId: first.assistantRevisionId, identity: { chatId: f.binding.chatId, nativeParentKey: key("2") }, expectedHeadRevisionId: first.assistantRevisionId, expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const result = await observeNativeStoryExchange(f.branch.id, await sample(request, "3", "4"), f.repo); expect(result.status).toBe("recorded");
    if (result.status !== "paused") expect((await readStoryTimeline(f.branch.id, f.repo)).revisions.find(row => row.id === result.userRevisionId)?.parentRevisionId).toBe(first.assistantRevisionId);
  });
  it("does not recycle an ancestor's native ID just because a paginated window hides it", async () => {
    const f = await setup(), { first, selection } = await selected(f);
    const request = { ...f.request, id: createId("request"), parentRevisionId: first.assistantRevisionId, identity: { chatId: f.binding.chatId, nativeParentKey: key("2") }, expectedHeadRevisionId: first.assistantRevisionId, expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, await sample(request, "1", "4"), f.repo)).toMatchObject({ status: "paused", issue: { code: "source-conflict" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("does not rebind a received request to another assistant or silently change its user", async () => {
    const f = await setup(); await record(f); const before = await f.repo.rawRecords();
    expect(await observeNativeStoryExchange(f.branch.id, await sample(f.request, "1", "other"), f.repo)).toMatchObject({ status: "paused", issue: { code: "source-conflict" } });
    f.input.user!.content = "Changed user"; expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toMatchObject({ status: "paused", issue: { code: "source-conflict" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("preserves a source's existing candidates on an identical exchange repeat", async () => {
    const f = await setup(), result = await record(f), revision = (await f.repo.get<StoryRevision>("story", result.assistantRevisionId))!;
    const { messageId: _message, nativeMessageKey: _native, requestId: _request, parentRevisionId: _parent, role: _role, completion: _completion, content: _content, requestProof: _proof, ...scope } = revision;
    await f.repo.mergeRecords([storyRow({ ...scope, type: "event", id: "candidate", revisionId: revision.id, ordinal: 0, disposition: "candidate", label: "Key delivered", quote: f.input.assistant!.content, participantIds: [], changes: [] })]);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toEqual({ ...result, status: "already-recorded" }); expect(await f.repo.rawRecords()).toEqual(before);
    expect((await readStoryTimeline(f.branch.id, f.repo)).events).toHaveLength(1);
  });
  it("keeps an early user edit on a new request separate, even if the site reuses native IDs", async () => {
    const f = await setup(true, true), { first, selection } = await selected(f);
    const request = { ...f.request, id: createId("request"), expectedHeadRevisionId: first.assistantRevisionId, expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const input = await sample(request); input.user!.content = "Take another direction."; input.assistant!.content = "The maker declined the key."; input.terminal!.sampleDigest = (await nativeStorySampleDigest(input.assistant))!;
    const result = await observeNativeStoryExchange(f.branch.id, input, f.repo); expect(result.status).toBe("recorded");
    if (result.status === "paused") return;
    expect(result.userRevisionId).not.toBe(first.userRevisionId); expect(result.assistantRevisionId).not.toBe(first.assistantRevisionId);
    const timeline = await readStoryTimeline(f.branch.id, f.repo); expect(timeline.revisions).toHaveLength(4); expect(timeline.branch.headRevisionId).toBe(first.assistantRevisionId);
    expect(new Set(timeline.revisions.filter(row => row.role === "user").map(row => row.messageId)).size).toBe(1);
  });
  it("archives a late accepted reply without replacing a newer manual state", async () => {
    const f = await setup(); const binding = (await f.repo.get<typeof f.binding>("binding", f.binding.id))!;
    binding.characterScenes![f.world.id]!.revision = "manual-edit"; binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.condition = "Manually corrected."; await f.repo.put("binding", binding);
    const before = await f.repo.get("binding", f.binding.id); const result = await record(f);
    expect(await f.repo.get("binding", f.binding.id)).toEqual(before); expect((await readStoryTimeline(f.branch.id, f.repo)).branch.headRevisionId).toBeNull();
    await expect(selectStoryRevision(f.branch.id, { headRevisionId: result.assistantRevisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo)).rejects.toThrow("story-manual-conflict");
  });
  it("does not upgrade an unproven legacy user parent through a retry", async () => {
    const f = await setup();
    const legacy = { messageId: "legacy-user", nativeMessageKey: key("1"), requestId: null, parentRevisionId: null, role: "user" as const, completion: "complete" as const, content: f.input.user!.content, events: [] };
    await recordStoryObservation(f.branch.id, { ...legacy, id: "legacy-u" }, f.repo);
    const selection = await selectStoryRevision(f.branch.id, { headRevisionId: "legacy-u", expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    const request: StoryRequestPreparation = { ...f.request, id: createId("request"), purpose: "assistant-retry", parentRevisionId: "legacy-u", identity: { chatId: f.binding.chatId, nativeParentKey: key("1") }, expectedHeadRevisionId: "legacy-u", expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, await sample(request, "1", "2", null), f.repo)).toMatchObject({ status: "paused", issue: { code: "parent-unproven" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["ambiguous", "role-conflict"] as const)("pauses on %s legacy native message identity", async problem => {
    const f = await setup();
    for (const id of problem === "ambiguous" ? ["a", "b"] : ["a"]) await recordStoryObservation(f.branch.id, { id, messageId: "legacy-" + id, nativeMessageKey: key("2"), requestId: null, parentRevisionId: null, role: problem === "ambiguous" ? "assistant" : "user", completion: "complete", content: "Old source", events: [] }, f.repo);
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toMatchObject({ status: "paused", issue: { code: problem === "ambiguous" ? "native-message-ambiguous" : "source-conflict" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps durable IDs through encrypted reopen/backup, and cannot enter a locked vault", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic-password"); const first = await record(f);
    f.db.close(); const db = new DeepRoleDatabase(f.db.name); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.unlockVault("synthetic-password");
    expect(await observeNativeStoryExchange(f.branch.id, f.input, repo)).toEqual({ ...first, status: "already-recorded" });
    const target = empty(); await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined, repo))), "replace", target.repo);
    expect(await observeNativeStoryExchange(f.branch.id, f.input, target.repo)).toEqual({ ...first, status: "already-recorded" });
    expect((await db.records.toArray()).filter(row => row.kind === "story").every(row => row.encrypted && !row.data)).toBe(true);
    await repo.lockVault(); await expect(observeNativeStoryExchange(f.branch.id, f.input, repo)).rejects.toBeInstanceOf(VaultLockedError);
  });
  it.each(["archive", "purge"] as const)("does not write to an %s world", async action => {
    const f = await setup(); await removeWorld(f.world.id, f.repo, { deleteLore: action === "purge" });
    const before = await f.repo.rawRecords(); expect(await observeNativeStoryExchange(f.branch.id, f.input, f.repo)).toMatchObject({ status: "paused", issue: { code: "scope-unavailable" } }); expect(await f.repo.rawRecords()).toEqual(before);
  });
});

describe("native sample fingerprints and strict roles", () => {
  it("rejects role coercion, including arrays and objects with a role-like toString", () => {
    for (const role of [["assistant"], { toString() { throw new Error("should never be called"); } }]) expect(validNativeStoryIdentity({ role, nativeMessageKey: key("2"), nativeParentKey: key("1") })).toBe(false);
  });
  it("has canonical key order, and changes when the text, identity, parent or completion changes", async () => {
    const request = { id: "request", identity: { chatId: "chat", nativeParentKey: null } } as StoryRequestPreparation;
    const value = (await sample(request)).assistant!, digest = await nativeStorySampleDigest(value);
    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(await nativeStorySampleDigest({ content: value.content, completion: value.completion, identity: { nativeParentKey: key("1"), nativeMessageKey: key("2"), role: "assistant" } })).toBe(digest);
    for (const changed of [{ ...value, content: value.content + " " }, { ...value, completion: "interrupted" }, { ...value, identity: { ...value.identity, nativeMessageKey: key("3") } }, { ...value, identity: { ...value.identity, nativeParentKey: null } }]) expect(await nativeStorySampleDigest(changed)).not.toBe(digest);
    expect(validNativeStorySample({ ...value, PRIVATE_FIELD: "PRIVATE" })).toBe(false); expect(await nativeStorySampleDigest(null)).toBeNull();
  });
  it("takes a snapshot before async hashing, without modifying the sample", async () => {
    const value = (await sample({ id: "request", identity: { chatId: "chat", nativeParentKey: null } } as StoryRequestPreparation)).assistant!, original = structuredClone(value);
    const pending = nativeStorySampleDigest(value); value.content = "Changed"; expect(await pending).toBe(await nativeStorySampleDigest(original));
  });
  it("returns a content-free pause for malformed top-level input without trusting computed digest", () => {
    for (const input of [null, {}, [], { requestId: "__proto__" }]) expect(matchNativeStoryExchange([], "branch", input as any, "PRIVATE")).toEqual({ status: "paused", issue: { code: "invalid-input", path: "$" } });
  });
});
