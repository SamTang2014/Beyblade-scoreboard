import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相對路徑 base：build 出嚟嘅 dist/ 可以擺喺 UAT server 任何一個子目錄，
  // 唔使改設定，copy 個 folder 上去就跑到。
  base: './',
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
