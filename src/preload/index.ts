import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  CustomEmoji,
  MastodonAccount,
  MediaAttachment,
  OAuthCallbackData,
  PostParams,
  PostedStatus,
  RendererStoreKey,
  RendererStoreSchema,
  UploadMediaParams
} from '../shared/types'

/**
 * renderer に公開する API。チャンネル名は src/main/ipc.ts と対応している。
 * 型は renderer 側で `typeof api` として参照する（src/preload/global.d.ts）。
 */
const api = {
  platform: process.platform,
  store: {
    get: <K extends RendererStoreKey>(key: K): Promise<RendererStoreSchema[K] | undefined> =>
      ipcRenderer.invoke('store:get', key),
    set: <K extends RendererStoreKey>(key: K, value: RendererStoreSchema[K]): Promise<void> =>
      ipcRenderer.invoke('store:set', key, value)
  },
  window: {
    setAlwaysOnTop: (flag: boolean): Promise<void> =>
      ipcRenderer.invoke('window:setAlwaysOnTop', flag),
    setWidth: (width: number): Promise<void> => ipcRenderer.invoke('window:setWidth', width)
  },
  mastodon: {
    post: (params: PostParams): Promise<PostedStatus> =>
      ipcRenderer.invoke('mastodon:post', params),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('mastodon:delete', id),
    verify: (): Promise<MastodonAccount> => ipcRenderer.invoke('mastodon:verify'),
    logout: (): Promise<void> => ipcRenderer.invoke('mastodon:logout'),
    customEmojis: (): Promise<CustomEmoji[]> => ipcRenderer.invoke('mastodon:customEmojis'),
    startOAuth: (serverUrl: string): Promise<void> =>
      ipcRenderer.invoke('mastodon:startOAuth', serverUrl),
    onOAuthCallback: (callback: (data: OAuthCallbackData) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, data: OAuthCallbackData) => callback(data)
      ipcRenderer.on('oauth:callback', handler)
      return () => ipcRenderer.removeListener('oauth:callback', handler)
    },
    uploadMedia: (params: UploadMediaParams): Promise<MediaAttachment> =>
      ipcRenderer.invoke('mastodon:uploadMedia', params),
    updateMedia: (id: string, description: string): Promise<MediaAttachment> =>
      ipcRenderer.invoke('mastodon:updateMedia', id, description)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
