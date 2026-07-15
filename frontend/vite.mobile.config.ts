import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 手机版独立构建：产物输出到 dist/mobile/，与桌面版 dist 完全隔离
export default defineConfig({
  root: 'src/mobile',
  base: '/mobile/',
  plugins: [react()],
  build: {
    outDir: '../../dist/mobile',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8766',
        changeOrigin: true,
        timeout: 1200000,
        proxyTimeout: 1200000,
      },
    },
  },
})
