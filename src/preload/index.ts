import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  mastodon: {
    post: (params: unknown) => ipcRenderer.invoke('mastodon:post', params),
    verify: (params: unknown) => ipcRenderer.invoke('mastodon:verify', params)
  }
})
