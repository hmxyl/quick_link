// Preload: expose a minimal safe bridge to the renderer (contextIsolation on)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quicklink", {
  getAutoLaunch: () => ipcRenderer.invoke("quicklink:get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("quicklink:set-auto-launch", !!enabled),
});
