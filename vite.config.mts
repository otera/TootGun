import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** 画面（src/renderer）をビルドする設定。Tauri から呼ばれる（src-tauri/tauri.conf.json） */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    outDir: resolve(import.meta.dirname, 'out/renderer'),
    emptyOutDir: true,
    // macOS の WebView（Safari）と Windows の WebView2 で動く範囲
    target: ['safari15', 'chrome105']
  }
})
