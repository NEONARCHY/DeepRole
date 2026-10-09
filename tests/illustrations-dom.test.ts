import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-generation";
import { illustrationSceneText, IllustrationsPresenter } from "../src/adapters/illustrations-dom";

const roots = vi.hoisted(() => new Map<HTMLElement, { render: ReturnType<typeof vi.fn>; unmount: ReturnType<typeof vi.fn> }>());
vi.mock("react-dom/client", () => ({ createRoot: (mount: HTMLElement) => {
  const root = { render: vi.fn(), unmount: vi.fn() }; roots.set(mount, root); return root;
} }));
let presenter: IllustrationsPresenter;
type Context = Parameters<IllustrationsPresenter["sync"]>[0];
const context = (extra: Partial<Context> = {}): Context => ({
  enabled: true, generating: false, worldId: "world", chatId: "chat", chatUrl: "https://chat.deepseek.com/a/chat/s/chat",
  records: [], attempts: [], entities: [], settings: DEFAULT_IMAGE_SETTINGS, locale: "en",
  actions: { onCreate: vi.fn(), onRepeat: vi.fn(), onDownload: vi.fn(), onRemove: vi.fn() }, ...extra,
});
const host = () => document.querySelector<HTMLElement>("[data-deeprole-illustrations]");
const currentRoot = () => roots.get(host()!.shadowRoot!.querySelector<HTMLElement>(".dr-root")!)!;
const setup = (story = '<div class="ds-assistant-message-main-content"><p>Final story.</p></div>') => {
  document.body.innerHTML = `<main><article data-role="assistant" data-message-id="reply">${story}</article></main>`;
  return document.querySelector<HTMLElement>("article")!;
};
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); presenter = new IllustrationsPresenter(document); });
afterEach(() => { presenter.clear(); roots.clear(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("illustration completion and placement", () => {
  it("never mounts an action during thinking, prose or hidden choices; mounts only after completion", () => {
    const row = setup('<span>Thinking for 2 seconds</span><div class="ds-think-content">Private thoughts.</div>');
    presenter.sync(context({ generating: true })); expect(host()).toBeNull();
    // Stopping during thinking alone is not a completed narrative either.
    presenter.sync(context()); expect(host()).toBeNull();
    const final = document.createElement("div"); final.className = "ds-assistant-message-main-content"; final.textContent = "Story begins."; row.append(final);
    presenter.sync(context({ generating: true })); expect(host()).toBeNull();
    final.textContent += '<deeprole_choices>{"version":1}';
    presenter.sync(context({ generating: true })); expect(host()).toBeNull();
    final.textContent += "</deeprole_choices>";
    presenter.sync(context({ generating: true })); expect(host()).toBeNull();
    presenter.sync(context()); expect(host()?.parentElement).toBe(row); expect(row.lastElementChild).toBe(host());
    expect(currentRoot().render.mock.calls.at(-1)![0].props.sceneText).toBe("Story begins.");
  });

  it("repairs placement even when only native nodes move and the rendering signature is unchanged", () => {
    const row = setup(); presenter.sync(context()); const original = host()!, root = currentRoot();
    const toolbar = document.createElement("button"); toolbar.textContent = "Copy"; row.append(toolbar);
    const choices = document.createElement("div"); choices.dataset.deeproleChoicesHost = "true"; row.after(choices);
    presenter.sync(context());
    expect(host()).toBe(original); expect(row.lastChild).toBe(original); expect(row.nextElementSibling).toBe(choices);
    expect(root.render).toHaveBeenCalledTimes(1);
    const mutations: MutationRecord[] = [], observer = new MutationObserver(changes => mutations.push(...changes));
    observer.observe(row, { childList: true, subtree: true }); presenter.sync(context());
    expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  });

  it("refreshes the scene for a reused native message ID without changing stored illustrations", () => {
    const row = setup(); presenter.sync(context()); const root = currentRoot();
    row.querySelector("p")!.textContent = "New ending after regeneration.";
    presenter.sync(context()); expect(root.render.mock.calls.at(-1)![0].props.sceneText).toBe("New ending after regeneration.");
  });

  it("removes a premature action during regeneration but keeps the older completed turn", () => {
    setup(); presenter.sync(context()); const premature = host()!, root = currentRoot();
    presenter.sync(context({ generating: true })); expect(host()).toBeNull(); expect(root.unmount).toHaveBeenCalledOnce();
    presenter.sync(context());
    const next = document.createElement("article"); next.dataset.role = "assistant"; next.dataset.messageId = "next"; next.innerHTML = '<div class="ds-think-content">Thinking</div>';
    document.querySelector("main")!.append(next); presenter.sync(context({ generating: true }));
    expect(document.querySelectorAll("[data-deeprole-illustrations]")).toHaveLength(1); expect(next.querySelector("[data-deeprole-illustrations]")).toBeNull(); expect(premature.isConnected).toBe(false);
  });

  it("keeps an existing image job and its React state while a service answer is streaming", () => {
    const row = setup(), target = { worldId: "world", chatId: "chat", chatUrl: context().chatUrl, messageKey: JSON.stringify(["message", "reply"]) };
    const attempt = { ...target, id: "attempt", status: "preparing" as const, createdAt: 1, updatedAt: 1 };
    presenter.sync(context({ attempts: [attempt] })); const original = host()!, root = currentRoot();
    presenter.sync(context({ generating: true, attempts: [attempt] })); expect(host()).toBe(original); expect(root.unmount).not.toHaveBeenCalled();
    const command = document.createElement("article"); command.dataset.role = "user"; command.dataset.messageId = "service"; command.textContent = "[DeepRole Service]\n[DeepRole Image Plan]";
    const reply = document.createElement("article"); reply.dataset.role = "assistant"; reply.dataset.messageId = "plan"; reply.textContent = '{"scene":"An observatory at dusk","characters":[]}';
    row.after(command, reply); presenter.sync(context({ attempts: [attempt] }));
    expect(host()).toBe(original); expect(reply.querySelector("[data-deeprole-illustrations]")).toBeNull();
  });

  it("extracts the completed story without thinking, controls, hidden transport or image UI", () => {
    const row = setup('<button>Thinking for 2 seconds</button><div class="ds-think-content">Private reasoning</div><div class="ds-assistant-message-main-content"><p>The telescope turns.</p><span data-deeprole-characters-summary>Characters updated</span><pre>&lt;deeprole_choices&gt;{"version":1}&lt;/deeprole_choices&gt;</pre><button>Copy</button></div><div data-deeprole-illustrations>Image UI</div>');
    const before = row.innerHTML; expect(illustrationSceneText(row)).toBe("The telescope turns."); expect(row.innerHTML).toBe(before);
  });
});
