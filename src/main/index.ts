import { app, shell, BrowserWindow, ipcMain, nativeTheme, safeStorage } from 'electron'
import { join } from 'path'
import { createHash, randomBytes } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

const store = new Store()

function encryptToken(token: string): string {
  return safeStorage.encryptString(token).toString('base64')
}

function decryptToken(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

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
    if (!tokenRes.ok) throw new Error(`トークン取得失敗: HTTP ${tokenRes.status}`)
    const tokenData = (await tokenRes.json()) as { access_token: string }
    const token = tokenData.access_token

    const verifyRes = await fetch(`${serverUrl}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!verifyRes.ok) throw new Error(`認証情報の確認失敗: HTTP ${verifyRes.status}`)
    const account = await verifyRes.json()

    store.set('serverUrl', serverUrl)
    store.set('token', encryptToken(token))

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
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 360,
    minHeight: 550,
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

  // Post to Mastodon
  ipcMain.handle(
    'mastodon:post',
    async (_, { status, visibility }: { status: string; visibility: string }) => {
      const serverUrl = store.get('serverUrl') as string
      const encrypted = store.get('token') as string
      const token = decryptToken(encrypted)
      try {
        const response = await fetch(`${serverUrl}/api/v1/statuses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status, visibility: visibility || 'public' })
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

  // Verify Mastodon token
  ipcMain.handle('mastodon:verify', async () => {
    const serverUrl = store.get('serverUrl') as string | undefined
    const encrypted = store.get('token') as string | undefined
    if (!serverUrl || !encrypted) throw new Error('未認証')
    const token = decryptToken(encrypted)
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

  // OAuth: register app and open browser
  ipcMain.handle('mastodon:startOAuth', async (_, { serverUrl }: { serverUrl: string }) => {
    let credentials: OAuthApp | undefined
    const stored = store.get(`oauth_app_${serverUrl}`) as OAuthApp | undefined
    if (stored) {
      try {
        credentials = { clientId: stored.clientId, clientSecret: decryptToken(stored.clientSecret) }
      } catch {
        // Decryption failed (old unencrypted data), discard and re-register
        store.delete(`oauth_app_${serverUrl}`)
      }
    }

    if (!credentials) {
      const res = await fetch(`${serverUrl}/api/v1/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'TootGun',
          redirect_uris: 'tootgun://oauth',
          scopes: 'read:accounts write:statuses'
        })
      })
      if (!res.ok) throw new Error(`アプリ登録失敗: HTTP ${res.status}`)
      const data = (await res.json()) as { client_id: string; client_secret: string }
      credentials = { clientId: data.client_id, clientSecret: data.client_secret }
      store.set(`oauth_app_${serverUrl}`, {
        clientId: credentials.clientId,
        clientSecret: encryptToken(credentials.clientSecret)
      })
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

    shell.openExternal(authUrl.toString())
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
