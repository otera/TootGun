import { ipcMain } from 'electron'
import type { OAuthCallbackData, PostParams, UploadMediaParams } from '../shared/types'
import {
  deleteStatus,
  fetchCustomEmojis,
  postStatus,
  updateMedia,
  uploadMedia,
  verifySavedCredentials
} from './mastodon'
import { startOAuth } from './oauth'
import {
  assertRendererStoreKey,
  clearCredentials,
  getRendererValue,
  setRendererValue,
  store
} from './store'
import { getMainWindow, setMainWindowWidth } from './window'

/** OAuth の結果を renderer へ届ける（Settings 画面が購読している） */
export function sendOAuthCallback(data: OAuthCallbackData): void {
  getMainWindow()?.webContents.send('oauth:callback', data)
}

/**
 * renderer から呼べる IPC を登録する。
 * チャンネル名と引数の形は src/preload/index.ts と対応している。
 */
export function registerIpcHandlers(): void {
  // 設定（認証情報は対象外。キーは allowlist で検証する）
  ipcMain.handle('store:get', (_, key: unknown) => {
    assertRendererStoreKey(key)
    return getRendererValue(key)
  })
  ipcMain.handle('store:set', (_, key: unknown, value: unknown) => {
    assertRendererStoreKey(key)
    setRendererValue(key, value as never)
  })
  ipcMain.handle('store:delete', (_, key: unknown) => {
    assertRendererStoreKey(key)
    store.delete(key)
  })

  // ウィンドウ
  ipcMain.handle('window:setAlwaysOnTop', (_, flag: boolean) => {
    getMainWindow()?.setAlwaysOnTop(flag)
  })
  ipcMain.handle('window:setWidth', (_, width: number) => setMainWindowWidth(width))

  // Mastodon API
  ipcMain.handle('mastodon:post', (_, params: PostParams) => postStatus(params))
  ipcMain.handle('mastodon:delete', (_, id: string) => deleteStatus(id))
  ipcMain.handle('mastodon:uploadMedia', (_, params: UploadMediaParams) => uploadMedia(params))
  ipcMain.handle('mastodon:updateMedia', (_, id: string, description: string) =>
    updateMedia(id, description)
  )
  ipcMain.handle('mastodon:customEmojis', () => fetchCustomEmojis())
  ipcMain.handle('mastodon:verify', () => verifySavedCredentials())
  ipcMain.handle('mastodon:logout', () => clearCredentials())
  ipcMain.handle('mastodon:startOAuth', (_, serverUrl: string) =>
    startOAuth(serverUrl, sendOAuthCallback)
  )
}
