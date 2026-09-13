import { defineConfig } from 'vitest/config'

// formatTime のテストが絶対日時を比較するため、タイムゾーンを固定する
process.env.TZ = 'Asia/Tokyo'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})
