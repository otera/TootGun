import type {
  CustomEmoji,
  MastodonAccount,
  MediaAttachment,
  OAuthApp,
  PostParams,
  PostedStatus,
  UploadMediaParams
} from '../shared/types'
import { getCredentials } from './store'

export const OAUTH_SCOPES = 'read:accounts write:statuses write:media'
export const OAUTH_REDIRECT_URI = 'tootgun://oauth'

/**
 * APIリクエストがMastodon本体ではなく、その手前のCDN/WAF等のBot対策に止められた場合にtrue。
 * Mastodon APIはエラー時も必ずJSON(`{"error": ...}`)を返すため、403でHTMLが返ってきたら
 * 「人間確認ページ」のような保護機構が割り込んだと判断できる（Cloudflare等、製品を問わない）。
 * この種の保護はブラウザ窓で通過させても発行されるcookieがブラウザのフィンガープリントに
 * 紐づくため、アプリからのAPI呼び出しでは再利用できず、外部クライアント全般が利用不可になる。
 * 単なる「HTTP 403」ではなく原因を明示するために判定する。
 */
function isBlockedByBotProtection(res: Response): boolean {
  const contentType = res.headers.get('content-type') ?? ''
  return res.status === 403 && contentType.includes('text/html')
}

function botProtectionMessage(serverUrl: string): string {
  return (
    `${new URL(serverUrl).hostname} はサーバー手前のBot対策（人間確認など）によりアプリからの` +
    'APIアクセスがブロックされています。VPNやプロキシを使っている場合は外して再試行してください。' +
    'それでも変わらなければ、サーバー管理者に /api/ と /oauth/ を保護の対象外にするよう依頼してください'
  )
}

interface MastodonErrorBody {
  error?: string
  error_description?: string
}

/** エラーレスポンスから人が読めるメッセージを組み立てる */
async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as MastodonErrorBody
  const detail = body.error_description || body.error
  return detail ? `${detail} (HTTP ${res.status})` : `HTTP ${res.status}`
}

interface RequestOptions {
  method?: string
  /** オブジェクトなら JSON として送る。FormData はそのまま送る */
  body?: FormData | Record<string, unknown>
  token?: string
}

/**
 * Mastodon API を呼び出し、JSON レスポンスを返す。
 * 非2xx なら Mastodon のエラーメッセージを含む Error を投げる。
 */
async function request<T>(
  serverUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`

  let body: string | FormData | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(`${serverUrl}${path}`, { method: options.method ?? 'GET', headers, body })
  if (isBlockedByBotProtection(res)) throw new Error(botProtectionMessage(serverUrl))
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as T
}

/** 保存済みトークンで認証付きリクエストを行う。未認証なら Error */
async function authedRequest<T>(
  path: string,
  options: Omit<RequestOptions, 'token'> = {}
): Promise<T> {
  const credentials = getCredentials()
  if (!credentials) throw new Error('未認証')
  return request<T>(credentials.serverUrl, path, { ...options, token: credentials.token })
}

// ---- 認証済みAPI ----

export function postStatus(params: PostParams): Promise<PostedStatus> {
  const { status, visibility, spoiler_text, media_ids } = params
  return authedRequest<PostedStatus>('/api/v1/statuses', {
    method: 'POST',
    body: {
      status,
      visibility: visibility || 'public',
      spoiler_text: spoiler_text || undefined,
      media_ids: media_ids && media_ids.length > 0 ? media_ids : undefined
    }
  })
}

export function deleteStatus(id: string): Promise<unknown> {
  return authedRequest(`/api/v1/statuses/${id}`, { method: 'DELETE' })
}

/** 画像などの添付ファイルをアップロードする。成功すればmedia_idを含むMediaAttachmentを返す */
export function uploadMedia(params: UploadMediaParams): Promise<MediaAttachment> {
  const form = new FormData()
  form.append('file', new Blob([params.data], { type: params.mimeType }), params.filename)
  if (params.description) form.append('description', params.description)
  return authedRequest<MediaAttachment>('/api/v2/media', { method: 'POST', body: form })
}

/** アップロード後に説明文（Altテキスト）を変更/付与する */
export function updateMedia(id: string, description: string): Promise<MediaAttachment> {
  return authedRequest<MediaAttachment>(`/api/v1/media/${id}`, {
    method: 'PUT',
    body: { description }
  })
}

interface RawCustomEmoji {
  shortcode: string
  url: string
  static_url: string
  visible_in_picker: boolean
  category?: string
}

/** サーバー独自絵文字の一覧。ピッカー非表示のものは除外する */
export async function fetchCustomEmojis(): Promise<CustomEmoji[]> {
  const list = await authedRequest<RawCustomEmoji[]>('/api/v1/custom_emojis')
  return list
    .filter((e) => e.visible_in_picker !== false)
    .map((e) => ({
      shortcode: e.shortcode,
      url: e.url,
      static_url: e.static_url,
      category: e.category ?? null
    }))
}

export function verifyCredentials(serverUrl: string, token: string): Promise<MastodonAccount> {
  return request<MastodonAccount>(serverUrl, '/api/v1/accounts/verify_credentials', { token })
}

export function verifySavedCredentials(): Promise<MastodonAccount> {
  return authedRequest<MastodonAccount>('/api/v1/accounts/verify_credentials')
}

// ---- OAuth ----

/** TootGun をアプリとして登録し、client_id / client_secret を得る */
export async function registerApp(serverUrl: string): Promise<OAuthApp> {
  const data = await request<{ client_id: string; client_secret: string }>(
    serverUrl,
    '/api/v1/apps',
    {
      method: 'POST',
      body: {
        client_name: 'TootGun',
        redirect_uris: OAUTH_REDIRECT_URI,
        scopes: OAUTH_SCOPES,
        website: 'https://github.com/otera/TootGun'
      }
    }
  ).catch((e: Error) => {
    throw new Error(`アプリ登録失敗: ${e.message}`)
  })
  return { clientId: data.client_id, clientSecret: data.client_secret, scopes: OAUTH_SCOPES }
}

/**
 * キャッシュ済みのアプリ登録がサーバー側でまだ有効か確認する。
 * Mastodonはトークンが紐づいていないアプリ登録を定期的に自動削除するため、
 * 古いclient_id/client_secretのまま認証を始めるとトークン交換で401になる。
 * ネットワークエラー等で判定できない場合は有効とみなす（本番の認証で改めて失敗させる）。
 */
export async function validateAppCredentials(
  serverUrl: string,
  { clientId, clientSecret }: OAuthApp
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'read:accounts'
      })
    })
    return res.ok
  } catch {
    return true
  }
}

export class TokenExchangeError extends Error {
  constructor(
    message: string,
    /** クライアント認証失敗（HTTP 401）。キャッシュ済みアプリ登録の失効を意味する */
    public readonly appRevoked: boolean
  ) {
    super(message)
  }
}

/** 認可コードをアクセストークンに交換する（PKCE） */
export async function exchangeCodeForToken(
  serverUrl: string,
  app: OAuthApp,
  code: string,
  codeVerifier: string
): Promise<string> {
  const res = await fetch(`${serverUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier
    })
  })
  if (!res.ok) {
    throw new TokenExchangeError(`トークン取得失敗: ${await errorMessage(res)}`, res.status === 401)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export function buildAuthorizeUrl(
  serverUrl: string,
  clientId: string,
  codeChallenge: string
): string {
  const url = new URL(`${serverUrl}/oauth/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', OAUTH_SCOPES)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}
