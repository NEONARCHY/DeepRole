export async function createShadowRootUi(_context: unknown, options: {
  name: string;
  onMount: (container: HTMLElement) => HTMLElement;
  onRemove: () => void;
}) {
  const host = document.createElement(options.name);
  host.dataset.deeproleDesktop = "true";
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  for (const stylesheet of document.querySelectorAll('link[rel="stylesheet"], style')) {
    shadow.append(stylesheet.cloneNode(true));
  }
  const integrated = document.createElement("style");
  integrated.textContent = ".dr-launcher { display: none !important; }";
  shadow.append(integrated, container);
  return {
    mount() {
      document.documentElement.append(host);
      options.onMount(container);
    },
    remove() {
      options.onRemove();
      host.remove();
    },
  };
}
