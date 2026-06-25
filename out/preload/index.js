"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  config: {
    read: () => electron.ipcRenderer.invoke("config:read"),
    write: (data) => electron.ipcRenderer.invoke("config:write", data),
    export: (data) => electron.ipcRenderer.invoke("config:export", data),
    import: () => electron.ipcRenderer.invoke("config:import")
  },
  schedule: {
    list: () => electron.ipcRenderer.invoke("schedule:list"),
    read: (id) => electron.ipcRenderer.invoke("schedule:read", id),
    write: (id, data) => electron.ipcRenderer.invoke("schedule:write", id, data),
    delete: (id) => electron.ipcRenderer.invoke("schedule:delete", id)
  },
  export: {
    html: (filename, html) => electron.ipcRenderer.invoke("export:html", filename, html),
    pdf: (filename, html) => electron.ipcRenderer.invoke("export:pdf", filename, html)
  }
});
