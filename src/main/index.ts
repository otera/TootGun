import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers, sendOAuthCallback } from './ipc'
import { handleOAuthCallback, isOAuthCallbackUrl } from './oauth'
import { createMainWindow, focusMainWindow } from './window'

const PROTOCOL = 'tootgun'

// macOS: open-url は app ready より前に登録しておく必要がある
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (isOAuthCallbackUrl(url)) handleOAuthCallback(url, sendOAuthCallback)
})

// Windows/Linux: ディープリンクは二重起動の引数として届くので、単一インスタンスに集約する
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    const url = argv.find(isOAuthCallbackUrl)
    if (url) handleOAuthCallback(url, sendOAuthCallback)
    focusMainWindow()
  })
}

app.setAsDefaultProtocolClient(PROTOCOL)

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tootgun.app')
  nativeTheme.themeSource = 'dark'

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
