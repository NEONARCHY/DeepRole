export function syntheticHDPng(): string {
  const canvas = document.createElement("canvas"); canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext("2d")!, gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
  gradient.addColorStop(0, "#30445a"); gradient.addColorStop(1, "#10232b"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1080);
  // Enough entropy to exceed the former portrait validator, using synthetic pixels only.
  const grain = ctx.createImageData(640, 360); let seed = 31;
  for (let i = 0; i < grain.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    grain.data[i] = seed & 255; grain.data[i + 1] = seed >>> 8 & 255; grain.data[i + 2] = seed >>> 16 & 255; grain.data[i + 3] = 255;
  }
  ctx.putImageData(grain, 640, 360); ctx.fillStyle = "#c6e5ef"; ctx.font = "48px system-ui"; ctx.fillText("Synthetic observatory · 1920 × 1080", 120, 180);
  return canvas.toDataURL("image/png");
}
