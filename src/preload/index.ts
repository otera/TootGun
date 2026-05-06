import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key)
  },
  window: {
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    setSize: (width: number, height: number) => ipcRenderer.invoke('window:setSize', { width, height }),
    setWidth: (width: number) => ipcRenderer.invoke('window:setWidth', width)
  },
  mastodon: {
    post: (params: unknown) => ipcRenderer.invoke('mastodon:post', params),
    verify: () => ipcRenderer.invoke('mastodon:verify'),
    startOAuth: (serverUrl: string) => ipcRenderer.invoke('mastodon:startOAuth', { serverUrl }),
    onOAuthCallback: (callback: (data: unknown) => void) => {
      const handler = (_: IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('oauth:callback', handler)
      return () => ipcRenderer.removeListener('oauth:callback', handler)
    }
  }
})
