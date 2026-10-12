import { expect, test } from "@playwright/test";

test("native story identity needs explicit ancestry in both browsers", async ({ page }) => {
  await page.goto("/tests/fixtures/deepseek.html");
  const identities = await page.evaluate(async () => {
    const moduleUrl = "/src/adapters/story-identity-dom.ts";
    const { readNativeStoryIdentity } = await import(moduleUrl);
    document.body.innerHTML = '<main><article data-message-id="1" data-role="user" data-parent-is-root="true">Продолжай</article><article data-message-id="2" data-role="assistant" data-parent-message-id="1">The gate opens.</article><article data-message-id="3" data-role="assistant">Parent unavailable</article><article data-message-id="4" data-role="assistant" data-parent-message-id="1" data-deeprole-service-reply="true">Sorry</article><div data-virtual-list-item-key="5"><article data-role="assistant" data-parent-message-id="1">Virtual position</article></div></main>';
    return [...document.querySelectorAll("article")].map(row => readNativeStoryIdentity(row));
  });
  expect(identities).toEqual([
    { role: "user", nativeMessageKey: '["message","1"]', nativeParentKey: null },
    { role: "assistant", nativeMessageKey: '["message","2"]', nativeParentKey: '["message","1"]' },
    null, null, null,
  ]);
});

test("terminal native samples survive DOM replacement without reasoning or invented completion", async ({ page }) => {
  await page.goto("/tests/fixtures/deepseek.html");
  const samples = await page.evaluate(async () => {
    const moduleUrl = "/src/adapters/story-identity-dom.ts";
    const { readNativeStorySample } = await import(moduleUrl);
    const render = (text: string) => {
      document.body.innerHTML = `<main><div data-virtual-list-item-key="position-9"><article data-message-id="2" data-role="assistant" data-parent-message-id="1"><div class="ds-think-content">Reasoning</div><div class="ds-markdown">${text}</div><button>Copy</button><div data-deeprole-choices-host>Choice</div></article></div></main>`;
      return document.querySelector<HTMLElement>("article")!;
    };
    const first = readNativeStorySample(render("Ключ передан."), "complete");
    const repeat = readNativeStorySample(render("Ключ передан."), "complete");
    const edited = readNativeStorySample(render("Мастер отказался."), "complete");
    const row = render("Незавершённый ответ"), before = row.outerHTML;
    const unknown = readNativeStorySample(row, null), interrupted = readNativeStorySample(row, "interrupted");
    return { first, repeat, edited, unknown, interrupted, untouched: row.outerHTML === before };
  });
  expect(samples.first).toEqual(samples.repeat);
  expect(samples.first).toMatchObject({ content: "Ключ передан.", completion: "complete", identity: { nativeMessageKey: '["message","2"]', nativeParentKey: '["message","1"]' } });
  expect(samples.edited!.identity).toEqual(samples.first!.identity); expect(samples.edited!.content).toBe("Мастер отказался.");
  expect(samples.unknown).toBeNull(); expect(samples.interrupted!.completion).toBe("interrupted"); expect(samples.untouched).toBe(true);
});
