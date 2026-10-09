// Test-only browser storage facade; production uses extension storage.local.
if (!window.chrome?.runtime?.id) {
  const area = {
    async get(keys) { const all = JSON.parse(localStorage.getItem("portrait-fixture-settings") || "{}"); if (!keys) return all; return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in all).map(key => [key, all[key]])); },
    async set(values) { const all = await this.get(); localStorage.setItem("portrait-fixture-settings", JSON.stringify({ ...all, ...values })); },
    async remove(keys) { const all = await this.get(); for (const key of Array.isArray(keys) ? keys : [keys]) delete all[key]; localStorage.setItem("portrait-fixture-settings", JSON.stringify(all)); },
  };
  window.chrome = { runtime: { id: "portrait-fixture" }, storage: { local: area, onChanged: { addListener() {}, removeListener() {} } } };
}
