import background from "../../src/entrypoints/background";
import { desktop } from "./browser";

const localFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input, location.origin);
  if (url.origin === location.origin) return localFetch(input, options);
  return localFetch("/__desktop/image", {
    method: "POST",
    body: JSON.stringify({
      url: url.href,
      method: options?.method ?? "GET",
      headers: Object.fromEntries(new Headers(options?.headers)),
      body: options?.body,
    }),
    signal: options?.signal,
  });
};
background.main();
void desktop.call("ready");
