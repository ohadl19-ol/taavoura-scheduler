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
    html: (filename: string, html: string) => ipcRenderer.invoke('export:html', filename, html),
    pdf:  (filename: string, html: string) => ipcRenderer.invoke('export:pdf',  filename, html),
  },
  pages: {
    publish: (token: string, html: string) => ipcRenderer.invoke('pages:publish', token, html),
  },
  drive: {
    status:    ()                                                          => ipcRenderer.invoke('drive:status'),
    authorize: (clientId: string, clientSecret: string)                    => ipcRenderer.invoke('drive:authorize', clientId, clientSecret),
    logout:    ()                                                          => ipcRenderer.invoke('drive:logout'),
    upload:    (clientId: string, clientSecret: string, filename: string, html: string) =>
                                                                              ipcRenderer.invoke('drive:upload', clientId, clientSecret, filename, html),
  },
})
