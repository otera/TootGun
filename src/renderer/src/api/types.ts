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
} from '../../../shared/types'

export type Platform = 'darwin' | 'win32' | 'linux'

/**
 * 画面側から使う API（window.api）。実装は ./index.ts で、
 * 呼び出し先は src-tauri/src/commands.rs。アクセストークンはこの API を通らない。
 */
export interface TootGunAPI {
  platform: Platform
  store: {
    get<K extends RendererStoreKey>(key: K): Promise<RendererStoreSchema[K] | undefined>
    set<K extends RendererStoreKey>(key: K, value: RendererStoreSchema[K]): Promise<void>
  }
  window: {
    setAlwaysOnTop(flag: boolean): Promise<void>
    setWidth(width: number): Promise<void>
  }
  mastodon: {
    post(params: PostParams): Promise<PostedStatus>
    delete(id: string): Promise<void>
    verify(): Promise<MastodonAccount>
    logout(): Promise<void>
    customEmojis(): Promise<CustomEmoji[]>
    startOAuth(serverUrl: string): Promise<void>
    /** 認証窓での認可結果を受け取る。戻り値は購読の解除関数 */
    onOAuthCallback(callback: (data: OAuthCallbackData) => void): () => void
    uploadMedia(params: UploadMediaParams): Promise<MediaAttachment>
    updateMedia(id: string, description: string): Promise<MediaAttachment>
  }
}

declare global {
  interface Window {
    api: TootGunAPI
  }
}
