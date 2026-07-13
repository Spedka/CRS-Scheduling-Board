import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Overridable so the frontend can point at chalkboard's API on a
// non-default port -- e.g. running `PORT=8788 npm run dev:node` in worker/
// to avoid colliding with a local crs-dispatch dev server on 8787.
const apiTarget = `http://localhost:${process.env.API_PORT ?? 8787}`

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CRS Tech Chalkboard',
        short_name: 'Chalkboard',
        start_url: '/',
        display: 'standalone',
        theme_color: '#...',
        background_color: '#...',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'chalkboard-api', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: /^\/calendar\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'chalkboard-calendar' },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/calendar': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/auth': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
