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
    pdf: (filename, html) => electron.ipcRenderer.invoke("export:pdf", filename, html),
    excel: (filename, headers, rows) => electron.ipcRenderer.invoke("export:excel", filename, headers, rows),
    template: (payload) => electron.ipcRenderer.invoke("export:template", payload)
  },
  importTable: {
    pick: () => electron.ipcRenderer.invoke("import:pickTable")
  },
  storage: {
    info: () => electron.ipcRenderer.invoke("storage:info"),
    open: () => electron.ipcRenderer.invoke("storage:open"),
    choose: () => electron.ipcRenderer.invoke("storage:choose")
  },
  diary: {
    fetch: (req) => electron.ipcRenderer.invoke("diary:fetch", req),
    onProgress: (cb) => {
      const h = (_e, text) => cb(text);
      electron.ipcRenderer.on("diary:progress", h);
      return () => {
        electron.ipcRenderer.removeListener("diary:progress", h);
      };
    }
  },
  pages: {
    publish: (token, html) => electron.ipcRenderer.invoke("pages:publish", token, html)
  }
});
