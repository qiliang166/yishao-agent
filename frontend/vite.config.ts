import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8766',
        changeOrigin: true,
        timeout: 1200000,        // 20 min for AI generation (3-stage pipeline)
        proxyTimeout: 1200000,   // 20 min response wait
      },
    },
  },
})
