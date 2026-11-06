import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (data: unknown) => ipcRenderer.invoke('config:write', data),
    export: (data: unknown) => ipcRenderer.invoke('config:export', data),
    import: () => ipcRenderer.invoke('config:import'),
  },
  schedule: {
    list: () => ipcRenderer.invoke('schedule:list'),
    read: (id: string) => ipcRenderer.invoke('schedule:read', id),
    write: (id: string, data: unknown) => ipcRenderer.invoke('schedule:write', id, data),
    delete: (id: string) => ipcRenderer.invoke('schedule:delete', id),
  },
  export: {
    html:  (filename: string, html: string) => ipcRenderer.invoke('export:html', filename, html),
    pdf:   (filename: string, html: string) => ipcRenderer.invoke('export:pdf',  filename, html),
    excel: (filename: string, headers: string[], rows: string[][]) => ipcRenderer.invoke('export:excel', filename, headers, rows),
    template: (payload: unknown) => ipcRenderer.invoke('export:template', payload),
  },
  importTable: {
    pick: () => ipcRenderer.invoke('import:pickTable'),
  },
  storage: {
    info:   () => ipcRenderer.invoke('storage:info'),
    open:   () => ipcRenderer.invoke('storage:open'),
    choose: () => ipcRenderer.invoke('storage:choose'),
  },
  diary: {
    fetch: (req: unknown) => ipcRenderer.invoke('diary:fetch', req),
    onProgress: (cb: (text: string) => void) => {
      const h = (_e: unknown, text: string) => cb(text)
      ipcRenderer.on('diary:progress', h)
      return () => { ipcRenderer.removeListener('diary:progress', h) }
    },
  },
  pages: {
    publish: (token: string, html: string) => ipcRenderer.invoke('pages:publish', token, html),
  },
})
