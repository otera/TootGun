import { app, shell, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'

const store = new Store()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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
    async (
      _,
      {
        serverUrl,
        token,
        status,
        visibility
      }: {
        serverUrl: string
        token: string
        status: string
        visibility: string
      }
    ) => {
      try {
        const url = `${serverUrl}/api/v1/statuses`
        const response = await fetch(url, {
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
  ipcMain.handle(
    'mastodon:verify',
    async (_, { serverUrl, token }: { serverUrl: string; token: string }) => {
      try {
        const response = await fetch(`${serverUrl}/api/v1/accounts/verify_credentials`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } catch (e) {
        throw new Error((e as Error).message)
      }
    }
  )

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
