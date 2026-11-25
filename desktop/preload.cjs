const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("deepRoleDesktop", {
  call: (method, ...args) => ipcRenderer.invoke("deeprole:call", method, args),
  listen: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("deeprole:event", listener);
    return () => ipcRenderer.removeListener("deeprole:event", listener);
  },
});
