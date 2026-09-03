// SaveWiser - preload script
//
// Runs in an isolated context that has Node access but shares the DOM with
// the renderer. Everything the UI needs is exposed here as `window.savewiser`
// -- the renderer itself never gets direct `require`/`ipcRenderer` access.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("savewiser", {
  platform: process.platform,

  runScraper: (options) => ipcRenderer.invoke("scraper:run", options),

  getState: () => ipcRenderer.invoke("store:getAll"),
  patchState: (patch) => ipcRenderer.invoke("store:patch", patch),
  appendExpenseLog: (entry) => ipcRenderer.invoke("store:appendExpenseLog", entry),
  toggleSubscription: (announcementId, subscribed) =>
    ipcRenderer.invoke("store:toggleSubscription", { announcementId, subscribed }),
  pushActivity: (entry) => ipcRenderer.invoke("store:pushActivity", entry),
  setSingpass: (singpass) => ipcRenderer.invoke("store:setSingpass", singpass),

  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
});
