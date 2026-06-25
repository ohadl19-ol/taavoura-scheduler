import { contextBridge, ipcRenderer } from "electron/renderer";
//#region electron/preload.ts
contextBridge.exposeInMainWorld("api", {
	config: {
		read: () => ipcRenderer.invoke("config:read"),
		write: (data) => ipcRenderer.invoke("config:write", data),
		export: (data) => ipcRenderer.invoke("config:export", data),
		import: () => ipcRenderer.invoke("config:import")
	},
	schedule: {
		list: () => ipcRenderer.invoke("schedule:list"),
		read: (id) => ipcRenderer.invoke("schedule:read", id),
		write: (id, data) => ipcRenderer.invoke("schedule:write", id, data),
		delete: (id) => ipcRenderer.invoke("schedule:delete", id)
	},
	export: { html: (filename, html) => ipcRenderer.invoke("export:html", filename, html) }
});
//#endregion
export {};
