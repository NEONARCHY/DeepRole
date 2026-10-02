import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/fixtures/deepseek.html");
  await page.waitForFunction(() => "deepRoleTest" in window);
  await page.evaluate(() => history.replaceState({}, "", "/chat/s/mock-story"));
});

test("reads the chat, updates the composer and sends without a confirmation dialog", async ({ page }) => {
  const state = await page.evaluate(() => {
    const api = (window as any).deepRoleTest;
    const adapter = new api.DeepSeekDomAdapter();
    const changed = adapter.setDraft("Continue toward the observatory");
    const draft = adapter.getDraft();
    const messages = adapter.getRecentMessages(4);
    const sent = adapter.submitDraft();
    return { changed, draft, messages, sent, chatId: adapter.getChatId() };
  });
  expect(state).toMatchObject({ changed: true, sent: true, chatId: "mock-story", draft: "Continue toward the observatory" });
  expect(state.messages).toContain("Mira entered the old observatory.");
  await expect(page.locator("body")).toHaveAttribute("data-sent", "true");
});

test("survives client-side navigation between chats", async ({ page }) => {
  const ids = await page.evaluate(() => {
    const Adapter = (window as any).deepRoleTest.DeepSeekDomAdapter;
    const adapter = new Adapter();
    const before = adapter.getChatId();
    history.pushState({}, "", "/chat/s/next-story");
    return [before, adapter.getChatId()];
  });
  expect(ids).toEqual(["mock-story", "next-story"]);
});

test("counts repeated and one-character replies once per turn, not once per text", async ({ page }) => {
  const result = await page.evaluate(() => {
    document.querySelectorAll("[data-message-id]").forEach((element) => element.remove());
    const conversation = document.createElement("section");
    for (const [index, text] of ["Continue", "Continue", "?", "Да"].entries()) {
      const article = document.createElement("article"); article.dataset.messageId = "repeat-" + index;
      const nested = document.createElement("div"); nested.className = "message-content"; nested.textContent = text;
      article.append(nested); conversation.append(article);
    }
    document.body.append(conversation);
    const adapter = new (window as any).deepRoleTest.DeepSeekDomAdapter();
    return { count: adapter.getMessageCount(), recent: adapter.getRecentMessages(3) };
  });
  expect(result.count).toBe(4);
  expect(result.recent).toEqual(["Continue", "?", "Да"]);
});

test("anchors the context indicator below the current chat title", async ({ page }) => {
  const position = await page.evaluate(() => {
    const Adapter = (window as any).deepRoleTest.DeepSeekDomAdapter;
    return new Adapter().getChatTitleAnchor();
  });
  const title = await page.getByTestId("chat-title").boundingBox();
  expect(position).not.toBeNull();
  expect(position?.x).toBe(Math.round(title?.x ?? 0));
  expect(position?.y).toBeGreaterThan(title?.y ?? 0);
});

test("supports DeepSeek's div-based send control", async ({ page }) => {
  const result = await page.evaluate(() => {
    const form = document.querySelector("form")!;
    const nativeButton = form.querySelector("button")!;
    const control = document.createElement("div");
    control.setAttribute("role", "button");
    control.className = "ds-button ds-button--primary";
    control.textContent = "Send";
    control.addEventListener("click", () => { document.body.dataset.roleButtonSent = "true"; });
    nativeButton.replaceWith(control);

    const Adapter = (window as any).deepRoleTest.DeepSeekDomAdapter;
    const adapter = new Adapter();
    adapter.setDraft("Continue");
    return adapter.submitDraft();
  });

  expect(result).toBe(true);
  await expect(page.locator("body")).toHaveAttribute("data-role-button-sent", "true");
});

test("supports selected text, memory suggestions and a handoff result", async ({ page }) => {
  const result = await page.evaluate(() => {
    const source = document.querySelector("#selection-source")!;
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const parse = (window as any).deepRoleTest.parseServiceData;
    return {
      selected: selection.toString(),
      suggestions: parse('<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Compass","content":"Mira owns a silver compass","keywords":["compass"]}]}</deeprole_data>'),
      handoff: parse('<deeprole_data>{"type":"handoff","title":"Observatory","summary":"Mira is inside the sealed observatory."}</deeprole_data>'),
    };
  });
  expect(result.selected).toContain("silver compass");
  expect(result.suggestions.items).toHaveLength(1);
  expect(result.handoff).toMatchObject({ type: "handoff", title: "Observatory" });
});

test("leaves an ordinary message untouched when the request format changes", async ({ page }) => {
  const result = await page.evaluate(() => {
    const inject = (window as any).deepRoleTest.injectIntoJsonBody;
    const body = JSON.stringify({ future: { text: "This must still be sent" } });
    return inject(body, "<deeprole_context>memory</deeprole_context>");
  });
  expect(result.changed).toBe(false);
  expect(JSON.parse(result.body).future.text).toBe("This must still be sent");
});

for (const language of ["en", "ru"] as const) {
  test(`service replies stay request-specific and ordinary quotes remain visible (${language})`, async ({ page }) => {
    const result = await page.evaluate((language) => {
      const api = (window as any).deepRoleTest;
      const conversation = document.createElement("section");
      const texts = [
        '[DeepRole Service]\n[Request ID: previous]\nAnalyze',
        '<deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>',
        language === "ru" ? 'Что значит <deeprole_data> в примере?' : 'What does <deeprole_data> mean in this example?',
        '[DeepRole Service]\n[Request ID: current]\nAnalyze',
        `<deeprole_data>${JSON.stringify({ type: "handoff", title: language === "ru" ? "Ворота" : "Gate", summary: language === "ru" ? "Мира у ворот." : "Mira is at the gate." })}</deeprole_data>`,
      ];
      for (const [index, text] of texts.entries()) {
        const article = document.createElement("article"); article.dataset.messageId = "correlated-" + index;
        const content = document.createElement("div"); content.textContent = text; article.append(content); conversation.append(article);
      }
      document.querySelector("main")!.append(conversation);
      conversation.replaceChildren(...Array.from(conversation.children, (element) => element.cloneNode(true)));
      const replies = api.findServiceResponseElements("current");
      return { count: replies.length, parsed: api.parseServiceData(replies[0].textContent) };
    }, language);
    expect(result).toMatchObject({ count: 1, parsed: { type: "handoff", title: language === "ru" ? "Ворота" : "Gate" } });
    await expect(page.locator("[data-message-id='correlated-2']")).toBeVisible();
    for (const index of [0, 1, 3, 4]) await expect(page.locator(`[data-message-id='correlated-${index}']`)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });
}
