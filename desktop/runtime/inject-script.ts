import bridge from "../../src/entrypoints/injected";

export async function injectScript() {
  bridge.main();
}
