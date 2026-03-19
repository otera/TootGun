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
  serverUrl: string
  token: string
  status: string
  visibility: Visibility
}

export interface VerifyParams {
  serverUrl: string
  token: string
}

export interface PostHistory {
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
  mastodon: {
    post: (params: PostParams) => Promise<unknown>
    verify: (params: VerifyParams) => Promise<MastodonAccount>
    startOAuth: (serverUrl: string) => Promise<void>
    onOAuthCallback: (callback: (data: OAuthCallbackData) => void) => () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
