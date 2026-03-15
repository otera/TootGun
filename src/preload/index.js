import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key)
  },
  mastodon: {
    post: (params) => ipcRenderer.invoke('mastodon:post', params),
    verify: (params) => ipcRenderer.invoke('mastodon:verify', params)
  }
})
