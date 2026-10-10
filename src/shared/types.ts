/**
 * main / preload / renderer で共有する型。
 * Electron 固有の型や React 固有の型はここに置かない。
 */

// ---- Mastodon API ----

export interface MastodonAccount {
  id: string
  username: string
  acct: string
  display_name: string
  avatar: string
  avatar_static: string
  url: string
}

/** サーバー独自のカスタム絵文字 */
export interface CustomEmoji {
  shortcode: string
  url: string
  static_url: string
  category: string | null
}

export type Visibility = 'public' | 'unlisted' | 'private' | 'direct'

export interface PostParams {
  status: string
  visibility: Visibility
  spoiler_text?: string
  media_ids?: string[]
}

/** 投稿APIのレスポンスのうち、アプリが使う部分 */
export interface PostedStatus {
  id: string
}

/** アップロード済みのメディア（画像等）添付情報 */
export interface MediaAttachment {
  id: string
  type: string
  url: string
  preview_url: string
  description: string | null
}

export interface UploadMediaParams {
  data: ArrayBuffer
  filename: string
  mimeType: string
  description?: string
}

export interface OAuthCallbackData {
  token?: string
  account?: MastodonAccount
  error?: string
}

// ---- 永続化データ ----

export interface PostHistory {
  /** MastodonのステータスID。取り消し（削除）に使う。旧履歴には存在しない */
  id?: string
  text: string
  time: string
}

/** Mastodonに登録したアプリの認証情報（サーバーごとにキャッシュする） */
export interface OAuthApp {
  clientId: string
  clientSecret: string
  scopes?: string
}

/** renderer から読み書きしてよい設定 */
export interface RendererStoreSchema {
  hashtags: string[]
  activeHashtags: string[]
  lastPosts: PostHistory[]
  visibility: Visibility
  alwaysOnTop: boolean
  historyOpen: boolean
  recentEmojis: CustomEmoji[]
  customEmojisCache: CustomEmoji[]
}

export type RendererStoreKey = keyof RendererStoreSchema

/** electron-store に保存する全データ。認証情報は main プロセスの外へ出さない */
export interface StoreSchema extends RendererStoreSchema {
  serverUrl: string
  token: string
  windowWidth: number
  windowHeight: number
  [key: `oauth_app_${string}`]: OAuthApp
}
