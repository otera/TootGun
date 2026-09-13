import Store from 'electron-store'
import type { OAuthApp, RendererStoreKey, RendererStoreSchema, StoreSchema } from '../shared/types'

export const store = new Store<StoreSchema>()

/** renderer に公開する設定キー。認証情報（serverUrl / token / oauth_app_*）は含めない */
const RENDERER_STORE_KEYS: ReadonlySet<string> = new Set<RendererStoreKey>([
  'hashtags',
  'activeHashtags',
  'lastPosts',
  'visibility',
  'alwaysOnTop',
  'historyOpen',
  'recentEmojis',
  'customEmojisCache'
])

/** renderer から渡されたキーが公開対象か検証する。IPC 経由の任意キーアクセスを防ぐ */
export function assertRendererStoreKey(key: unknown): asserts key is RendererStoreKey {
  if (typeof key !== 'string' || !RENDERER_STORE_KEYS.has(key)) {
    throw new Error(`renderer からアクセスできない設定です: ${String(key)}`)
  }
}

export function getRendererValue<K extends RendererStoreKey>(
  key: K
): RendererStoreSchema[K] | undefined {
  return store.get(key)
}

export function setRendererValue<K extends RendererStoreKey>(
  key: K,
  value: RendererStoreSchema[K]
): void {
  store.set(key, value)
}

// ---- 認証情報 ----

export interface Credentials {
  serverUrl: string
  token: string
}

/** 保存済みの接続先とトークン。未認証なら undefined */
export function getCredentials(): Credentials | undefined {
  const serverUrl = store.get('serverUrl')
  const token = store.get('token')
  return serverUrl && token ? { serverUrl, token } : undefined
}

export function setCredentials({ serverUrl, token }: Credentials): void {
  store.set('serverUrl', serverUrl)
  store.set('token', token)
}

export function clearCredentials(): void {
  store.delete('serverUrl')
  store.delete('token')
}

// ---- アプリ登録のキャッシュ ----

const oauthAppKey = (serverUrl: string) => `oauth_app_${serverUrl}` as const

export function getOAuthApp(serverUrl: string): OAuthApp | undefined {
  return store.get(oauthAppKey(serverUrl))
}

export function setOAuthApp(serverUrl: string, app: OAuthApp): void {
  store.set(oauthAppKey(serverUrl), app)
}

export function deleteOAuthApp(serverUrl: string): void {
  store.delete(oauthAppKey(serverUrl))
}
