// Mastodon API types
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

// アップロード済みのメディア（画像等）添付情報
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

export interface PostHistory {
  /** MastodonのステータスID。取り消し（削除）に使う。旧履歴には存在しない */
  id?: string
  text: string
  time: string
}

// Spark particle types
export interface Spark {
  id: number
  x: number
  y: number
  angle: number
  speed: number
  size: number
  color: string
}

export interface Particle extends Spark {
  vx: number
  vy: number
  life: number
  decay: number
  px: number
  py: number
}

export interface OAuthCallbackData {
  token?: string
  account?: MastodonAccount
  error?: string
}

// window.api bridge type
export interface ElectronAPI {
  platform: string
  store: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  window: {
    setAlwaysOnTop: (flag: boolean) => Promise<void>
    setSize: (width: number, height: number) => Promise<void>
    setWidth: (width: number) => Promise<void>
  }
  mastodon: {
    post: (params: PostParams) => Promise<unknown>
    delete: (id: string) => Promise<unknown>
    verify: () => Promise<MastodonAccount>
    customEmojis: () => Promise<CustomEmoji[]>
    startOAuth: (serverUrl: string) => Promise<void>
    onOAuthCallback: (callback: (data: OAuthCallbackData) => void) => () => void
    uploadMedia: (params: UploadMediaParams) => Promise<MediaAttachment>
    updateMedia: (id: string, description: string) => Promise<MediaAttachment>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
