import { BrowserWindow } from 'electron'
import { createHash, randomBytes } from 'crypto'
import type { OAuthApp, OAuthCallbackData } from '../shared/types'
import {
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
  TokenExchangeError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  registerApp,
  validateAppCredentials,
  verifyCredentials
} from './mastodon'
import { deleteOAuthApp, getOAuthApp, setCredentials, setOAuthApp } from './store'

interface OAuthPending {
  serverUrl: string
  app: OAuthApp
  codeVerifier: string
}

let pendingOAuth: OAuthPending | null = null

export function isOAuthCallbackUrl(url: string): boolean {
  return url.startsWith(OAUTH_REDIRECT_URI)
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * キャッシュ済みのアプリ登録を返す。失効していたり要求スコープが変わっていれば捨てて再登録する。
 * （スコープ変更の例: 画像添付対応で write:media を追加）
 */
async function resolveApp(serverUrl: string): Promise<OAuthApp> {
  const cached = getOAuthApp(serverUrl)
  if (
    cached &&
    cached.scopes === OAUTH_SCOPES &&
    (await validateAppCredentials(serverUrl, cached))
  ) {
    return cached
  }
  deleteOAuthApp(serverUrl)
  const app = await registerApp(serverUrl)
  setOAuthApp(serverUrl, app)
  return app
}

/**
 * アプリ登録を確認したうえで認可ウィンドウを開く。
 * 認可完了後のコールバックは handleOAuthCallback が受け取り、結果は onResult で通知する。
 */
export async function startOAuth(
  serverUrl: string,
  onResult: (data: OAuthCallbackData) => void
): Promise<void> {
  const app = await resolveApp(serverUrl)

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  pendingOAuth = { serverUrl, app, codeVerifier }

  const authWindow = new BrowserWindow({
    width: 800,
    height: 700,
    show: true,
    autoHideMenuBar: true,
    title: 'TootGun - 認証',
    webPreferences: {}
  })

  // 認可後のリダイレクト先 tootgun://oauth はブラウザ窓では開けないので、ここで横取りして処理する
  const intercept = (event: { preventDefault(): void }, url: string): void => {
    if (!isOAuthCallbackUrl(url)) return
    event.preventDefault()
    authWindow.destroy()
    handleOAuthCallback(url, onResult)
  }
  authWindow.webContents.on('will-navigate', intercept)
  authWindow.webContents.on('will-redirect', intercept)

  authWindow.loadURL(buildAuthorizeUrl(serverUrl, app.clientId, codeChallenge))
}

/** tootgun://oauth?code=... を受け取り、トークン交換とアカウント確認を行う */
export async function handleOAuthCallback(
  url: string,
  onResult: (data: OAuthCallbackData) => void
): Promise<void> {
  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get('code')
    const error = parsed.searchParams.get('error')

    if (error) throw new Error(`認証エラー: ${error}`)
    if (!code || !pendingOAuth) throw new Error('無効なコールバックです')

    const { serverUrl, app, codeVerifier } = pendingOAuth
    pendingOAuth = null

    let token: string
    try {
      token = await exchangeCodeForToken(serverUrl, app, code, codeVerifier)
    } catch (e) {
      // アプリ登録の失効なら破棄し、次回の再登録で自己修復する
      if (e instanceof TokenExchangeError && e.appRevoked) {
        deleteOAuthApp(serverUrl)
        throw new Error(
          'アプリ登録が失効していたためリセットしました。もう一度ログインしてください'
        )
      }
      throw e
    }

    const account = await verifyCredentials(serverUrl, token).catch((e: Error) => {
      throw new Error(`認証情報の確認失敗: ${e.message}`)
    })

    setCredentials({ serverUrl, token })
    onResult({ token, account })
  } catch (e) {
    onResult({ error: (e as Error).message })
  }
}
