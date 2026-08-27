import { app, shell, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { createHash, randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

const store = new Store()

const minWidth = 420
const minHeight = 450

let mainWindow: BrowserWindow | null = null

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

interface OAuthPending {
  serverUrl: string
  clientId: string
  clientSecret: string
  codeVerifier: string
}

type OAuthApp = { clientId: string; clientSecret: string }

let pendingOAuth: OAuthPending | null = null

/**
 * キャッシュ済みのアプリ登録がサーバー側でまだ有効か確認する。
 * Mastodonはトークンが紐づいていないアプリ登録を定期的に自動削除するため、
 * 古いclient_id/client_secretのまま認証を始めるとトークン交換で401になる。
 * ネットワークエラー等で判定できない場合は有効とみなす（本番の認証で改めて失敗させる）。
 */
async function validateAppCredentials(
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

async function handleOAuthDeepLink(url: string): Promise<void> {
  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get('code')
    const error = parsed.searchParams.get('error')

    if (error) {
      mainWindow?.webContents.send('oauth:callback', { error: `認証エラー: ${error}` })
      return
    }

    if (!code || !pendingOAuth) {
      mainWindow?.webContents.send('oauth:callback', { error: '無効なコールバックです' })
      return
    }

    const { serverUrl, clientId, clientSecret, codeVerifier } = pendingOAuth
    pendingOAuth = null

    const tokenRes = await fetch(`${serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'tootgun://oauth',
        code_verifier: codeVerifier
      })
    })
    if (!tokenRes.ok) {
      const body = (await tokenRes.json().catch(() => ({}))) as {
        error?: string
        error_description?: string
      }
      // 401 = クライアント認証失敗。キャッシュ済みアプリ登録の失効なので破棄し、次回の再登録で自己修復する
      if (tokenRes.status === 401) {
        store.delete(`oauth_app_${serverUrl}`)
        throw new Error(
          'アプリ登録が失効していたためリセットしました。もう一度ログインしてください'
        )
      }
      throw new Error(
        `トークン取得失敗: HTTP ${tokenRes.status}` +
          (body.error_description || body.error ? ` (${body.error_description || body.error})` : '')
      )
    }
    const tokenData = (await tokenRes.json()) as { access_token: string }
    const token = tokenData.access_token

    const verifyRes = await fetch(`${serverUrl}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!verifyRes.ok) throw new Error(`認証情報の確認失敗: HTTP ${verifyRes.status}`)
    const account = await verifyRes.json()

    store.set('serverUrl', serverUrl)
    store.set('token', token)

    mainWindow?.webContents.send('oauth:callback', { token, account })
  } catch (e) {
    mainWindow?.webContents.send('oauth:callback', { error: (e as Error).message })
  }
}

// macOS: open-url must be registered before app is ready
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('tootgun://oauth')) {
    handleOAuthDeepLink(url)
  }
})

// Windows/Linux: single-instance lock for deep link handling
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    const url = argv.find((arg) => arg.startsWith('tootgun://oauth'))
    if (url) handleOAuthDeepLink(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.setAsDefaultProtocolClient('tootgun')

function createWindow(): void {
  const savedWidth = store.get('windowWidth') as number | undefined
  const savedHeight = store.get('windowHeight') as number | undefined

  mainWindow = new BrowserWindow({
    width: Math.max(minWidth, savedWidth ?? minWidth),
    height: Math.max(minHeight, savedHeight ?? minHeight),
    minWidth: minWidth,
    minHeight: minHeight,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  mainWindow.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (!mainWindow) return
      const [w, h] = mainWindow.getSize()
      store.set('windowWidth', w)
      store.set('windowHeight', h)
      resizeTimer = null
    }, 300)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tootgun.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Store IPC handlers
  ipcMain.handle('store:get', (_, key: string) => store.get(key))
  ipcMain.handle('store:set', (_, key: string, value: unknown) => store.set(key, value))
  ipcMain.handle('store:delete', (_, key: string) => store.delete(key))

  // Window: always on top
  ipcMain.handle('window:setAlwaysOnTop', (_, flag: boolean) => {
    mainWindow?.setAlwaysOnTop(flag)
  })

  // Window: resize
  ipcMain.handle('window:setSize', (_, { width, height }: { width: number; height: number }) => {
    mainWindow?.setSize(width, height)
  })

  // Window: resize width only (height stays unchanged), clamped to screen width
  ipcMain.handle('window:setWidth', (_, width: number) => {
    if (mainWindow) {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
      const [, currentHeight] = mainWindow.getSize()
      mainWindow.setSize(Math.min(width, screenWidth), currentHeight)
    }
  })

  // Post to Mastodon
  ipcMain.handle(
    'mastodon:post',
    async (
      _,
      {
        status,
        visibility,
        spoiler_text
      }: { status: string; visibility: string; spoiler_text?: string }
    ) => {
      const serverUrl = store.get('serverUrl') as string
      const token = store.get('token') as string
      try {
        const response = await fetch(`${serverUrl}/api/v1/statuses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status,
            visibility: visibility || 'public',
            spoiler_text: spoiler_text || undefined
          })
        })
        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error || `HTTP ${response.status}`)
        }
        return await response.json()
      } catch (e) {
        throw new Error((e as Error).message)
      }
    }
  )

  // Delete a status (送信取り消し)
  ipcMain.handle('mastodon:delete', async (_, id: string) => {
    const serverUrl = store.get('serverUrl') as string
    const token = store.get('token') as string
    try {
      const response = await fetch(`${serverUrl}/api/v1/statuses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      return await response.json()
    } catch (e) {
      throw new Error((e as Error).message)
    }
  })

  // Verify Mastodon token
  ipcMain.handle('mastodon:verify', async () => {
    const serverUrl = store.get('serverUrl') as string | undefined
    const token = store.get('token') as string | undefined
    if (!serverUrl || !token) throw new Error('未認証')
    try {
      const response = await fetch(`${serverUrl}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (e) {
      throw new Error((e as Error).message)
    }
  })

  // OAuth: register app and open auth window
  ipcMain.handle('mastodon:startOAuth', async (_, { serverUrl }: { serverUrl: string }) => {
    const stored = store.get(`oauth_app_${serverUrl}`) as OAuthApp | undefined
    let credentials: OAuthApp | undefined = stored

    // サーバー側で失効したアプリ登録を掴んだまま認証を始めない（失効していたら捨てて再登録に倒す）
    if (credentials && !(await validateAppCredentials(serverUrl, credentials))) {
      store.delete(`oauth_app_${serverUrl}`)
      credentials = undefined
    }

    if (!credentials) {
      const res = await fetch(`${serverUrl}/api/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'TootGun',
          redirect_uris: 'tootgun://oauth',
          scopes: 'read:accounts write:statuses',
          website: 'https://github.com/otera/TootGun'
        })
      })
      if (!res.ok) throw new Error(`アプリ登録失敗: HTTP ${res.status}`)
      const data = (await res.json()) as { client_id: string; client_secret: string }
      credentials = { clientId: data.client_id, clientSecret: data.client_secret }
      store.set(`oauth_app_${serverUrl}`, credentials)
    }

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    pendingOAuth = { serverUrl, ...credentials, codeVerifier }

    const authUrl = new URL(`${serverUrl}/oauth/authorize`)
    authUrl.searchParams.set('client_id', credentials.clientId)
    authUrl.searchParams.set('redirect_uri', 'tootgun://oauth')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'read:accounts write:statuses')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    const authWindow = new BrowserWindow({
      width: 800,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      title: 'TootGun - 認証',
      webPreferences: {}
    })

    const handleRedirect = (url: string): void => {
      if (url.startsWith('tootgun://oauth')) {
        authWindow.destroy()
        handleOAuthDeepLink(url)
      }
    }

    authWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('tootgun://oauth')) {
        event.preventDefault()
        handleRedirect(url)
      }
    })

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('tootgun://oauth')) {
        event.preventDefault()
        handleRedirect(url)
      }
    })

    authWindow.loadURL(authUrl.toString())
  })

  nativeTheme.themeSource = 'dark'
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
