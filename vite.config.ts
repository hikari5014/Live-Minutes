import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Expose the package version to the app (shown in the top bar) so users can
// confirm which build their PWA has loaded.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

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
        theme_color: '#07B6CC',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // Receive audio shared from other apps (Android/Chromium; iOS Safari
        // does not implement share_target and simply ignores this).
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            files: [{ name: 'audio', accept: ['audio/*', 'video/*'] }],
          },
        },
        icons: [
          { src: '/icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/share-target/],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        importScripts: ['share-target-sw.js'],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    // In dev, proxy API + room websockets to a locally-running Worker (wrangler dev on :8787).
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
