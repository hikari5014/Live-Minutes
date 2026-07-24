import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The frontend builds to ./dist and is served by the Cloudflare Worker
// (Workers Static Assets). API + WebSocket rooms live under /api/*.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/maskable.svg', 'favicon.svg'],
      manifest: {
        name: 'Live Minutes',
        short_name: 'Live Minutes',
        description: '跨裝置雙語即時字幕 + AI 會議紀錄',
        lang: 'zh-Hant',
        theme_color: '#0C8F94',
        background_color: '#0A0E13',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // In dev, proxy API + room websockets to a locally-running Worker (wrangler dev on :8787).
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
