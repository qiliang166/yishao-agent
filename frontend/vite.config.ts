import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        timeout: 600000,        // 10 min for AI generation (3-stage pipeline)
        proxyTimeout: 600000,   // 10 min response wait
      },
    },
  },
})
