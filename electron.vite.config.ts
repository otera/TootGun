import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-store']
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
