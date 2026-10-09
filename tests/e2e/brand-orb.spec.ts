import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) {
  test(`brand circles stay concentric ${locale} ${width}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/page-widget.html?panels=1&locale=${locale}`);
    await expect(page.locator(".dr-launcher .dr-orb")).toBeVisible();

    // A tight flex row must not squash the reusable mark into an ellipse.
    await page.locator(".dr-root").evaluate(root => {
      // Keep probes outside React's managed tree: responsive reconciliation
      // must not encounter children inserted by a layout-measurement test.
      const fixture = document.createElement("div");
      fixture.className = "dr-root dr-brand-test";
      fixture.style.cssText = "position:fixed;top:120px;left:8px;display:grid;gap:10px;width:max-content";
      for (const selector of [".dr-launcher", ".dr-pill"]) {
        const control = root.querySelector(selector)!.cloneNode(true) as HTMLElement;
        control.style.position = "static";
        fixture.append(control);
      }
      const row = document.createElement("div");
      row.style.cssText = "display:flex;width:36px;gap:8px";
      row.append(root.querySelector(".dr-orb")!.cloneNode(true));
      const label = document.createElement("span");
      label.style.cssText = "width:32px;flex:none";
      label.textContent = "Test";
      row.append(label);
      fixture.append(row);
      document.body.append(fixture);
    });

    for (const zoom of [1, 1.25, 1.5]) {
      // Scale the mark's isolated sample, not the unrelated panel deck. CSS
      // zoom on the whole body is not the browser's page-zoom mechanism.
      await page.locator(".dr-brand-test").evaluate((element, value) => { (element as HTMLElement).style.zoom = String(value); }, zoom);
      const geometry = await page.locator(".dr-brand-test .dr-orb").evaluateAll(orbs => {
        // Materialize the generated dot with its resolved CSS to measure its
        // actual browser layout; pseudo-elements have no bounding-rect API.
        const probes = orbs.map(orb => {
          const dot = document.createElement("i");
          const css = getComputedStyle(orb, "::after");
          for (const property of ["display", "position", "top", "right", "bottom", "left", "width", "height", "margin", "padding", "border", "box-sizing", "transform", "align-self", "justify-self", "grid-area"]) {
            dot.style.setProperty(property, css.getPropertyValue(property));
          }
          return { orb, dot };
        });
        const hide = document.createElement("style");
        hide.textContent = ".dr-brand-test .dr-orb::after{display:none!important}";
        document.head.append(hide);
        const result = probes.map(({ orb, dot }) => {
          orb.append(dot);
          const ring = orb.getBoundingClientRect(), core = dot.getBoundingClientRect();
          dot.remove();
          return { ringWidth: ring.width, ringHeight: ring.height, coreWidth: core.width, coreHeight: core.height, x: core.x + core.width / 2 - ring.x - ring.width / 2, y: core.y + core.height / 2 - ring.y - ring.height / 2 };
        });
        hide.remove();
        return result;
      });
      expect(geometry.length).toBeGreaterThanOrEqual(3);
      for (const circle of geometry) {
        expect(Math.abs(circle.ringWidth - circle.ringHeight)).toBeLessThanOrEqual(.05);
        expect(Math.abs(circle.coreWidth - circle.coreHeight)).toBeLessThanOrEqual(.05);
        expect(circle.coreWidth).toBeGreaterThan(0);
        expect(Math.abs(circle.x)).toBeLessThanOrEqual(.05);
        expect(Math.abs(circle.y)).toBeLessThanOrEqual(.05);
      }
    }
    await page.locator(".dr-brand-test").evaluate(element => element.remove());
    expect(errors).toEqual([]);
    const launcher = page.locator(".dr-launcher");
    await expect(launcher).toBeVisible();
    await launcher.screenshot({ path: info.outputPath("brand-launcher.png"), scale: "device" });
    expect(errors).toEqual([]);
  });
}
