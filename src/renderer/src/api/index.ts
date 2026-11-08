/**
 * 画面側から使う `window.api` を用意する。呼び出し先は src-tauri/src/commands.rs。
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Platform, TootGunAPI } from './types'
import type {
  OAuthCallbackData,
  RendererStoreKey,
  RendererStoreSchema
} from '../../../shared/types'

/** Rust 側のエラーは文字列で届くので、画面側が使う Error に揃える */
async function call<T>(...args: Parameters<typeof invoke>): Promise<T> {
  try {
    return await invoke<T>(...args)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (ua.includes('Mac')) return 'darwin'
  if (ua.includes('Windows')) return 'win32'
  return 'linux'
}

/** ヘッダーには ASCII しか載らないので、ファイル名や説明文はエンコードして送る */
const encodeHeader = (value: string): string => encodeURIComponent(value)

const api: TootGunAPI = {
  platform: detectPlatform(),
  store: {
    get: async <K extends RendererStoreKey>(key: K) => {
      const value = await call<RendererStoreSchema[K] | null>('store_get', { key })
      return value ?? undefined
    },
    set: <K extends RendererStoreKey>(key: K, value: RendererStoreSchema[K]) =>
      call<void>('store_set', { key, value })
  },
  window: {
    setAlwaysOnTop: (flag) => call('window_set_always_on_top', { flag }),
    setWidth: (width) => call('window_set_width', { width })
  },
  mastodon: {
    post: (params) => call('mastodon_post', { params }),
    delete: (id) => call('mastodon_delete', { id }),
    verify: () => call('mastodon_verify'),
    logout: () => call('mastodon_logout'),
    customEmojis: () => call('mastodon_custom_emojis'),
    startOAuth: (serverUrl) => call('mastodon_start_oauth', { serverUrl }),
    onOAuthCallback: (callback) => {
      // listen は解除関数を非同期で返すので、先に解除されたら届いた時点で解除する
      let unlisten: (() => void) | undefined
      let disposed = false
      void listen<OAuthCallbackData>('oauth:callback', (e) => callback(e.payload)).then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      return () => {
        disposed = true
        unlisten?.()
      }
    },
    uploadMedia: (params) =>
      call('mastodon_upload_media', new Uint8Array(params.data), {
        headers: {
          'x-filename': encodeHeader(params.filename),
          'x-mime-type': encodeHeader(params.mimeType),
          'x-description': encodeHeader(params.description ?? '')
        }
      }),
    updateMedia: (id, description) => call('mastodon_update_media', { id, description })
  }
}

/** ドラッグでウィンドウを動かせる場所 */
const DRAG_REGIONS = '.settings-screen, .composer-header, .history-panel-header'
const NO_DRAG_REGIONS =
  'button, input, textarea, select, a, .settings-form, .oauth-waiting, .account-info, .pin-btn, .logout-btn, .history-close-btn, .hist-btn'

/**
 * タイトルバーを隠しているので、ドラッグできる場所でのマウス操作をウィンドウ移動に変換する。
 * WebView は -webkit-app-region を解釈しないため CSS ではなくここで扱う。
 */
function enableWindowDrag(): void {
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return
    if (!e.target.closest(DRAG_REGIONS) || e.target.closest(NO_DRAG_REGIONS)) return
    e.preventDefault()
    void getCurrentWindow().startDragging()
  })
}

window.api = api
enableWindowDrag()
