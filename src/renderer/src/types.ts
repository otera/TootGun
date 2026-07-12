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

export type Visibility = 'public' | 'unlisted' | 'private' | 'direct'

export interface PostParams {
  status: string
  visibility: Visibility
  spoiler_text?: string
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
    startOAuth: (serverUrl: string) => Promise<void>
    onOAuthCallback: (callback: (data: OAuthCallbackData) => void) => () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
