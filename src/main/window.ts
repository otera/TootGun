import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { store } from './store'

const MIN_WIDTH = 420
const MIN_HEIGHT = 450
const RESIZE_SAVE_DELAY_MS = 300

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  const savedWidth = store.get('windowWidth')
  const savedHeight = store.get('windowHeight')

  const win = new BrowserWindow({
    width: Math.max(MIN_WIDTH, savedWidth ?? MIN_WIDTH),
    height: Math.max(MIN_HEIGHT, savedHeight ?? MIN_HEIGHT),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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
  mainWindow = win

  // ウィンドウサイズを保存（連続リサイズ中は書き込まない）
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  win.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const [w, h] = win.getSize()
      store.set('windowWidth', w)
      store.set('windowHeight', h)
      resizeTimer = null
    }, RESIZE_SAVE_DELAY_MS)
  })

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** 最小化されていれば復元し、前面に出す */
export function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

/** 高さはそのまま、幅だけ変更する（画面幅を超えない） */
export function setMainWindowWidth(width: number): void {
  if (!mainWindow) return
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const [, currentHeight] = mainWindow.getSize()
  mainWindow.setSize(Math.min(width, screenWidth), currentHeight)
}
