import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'index.html',
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*', 'manifest.webmanifest'],
      manifest: {
        name: 'Dr. Mrinal Duty App',
        short_name: 'Duty App',
        description: 'Monthly hospital duty roster for Dr. Mrinal — PICU, NICU, ER and OPD schedules.',
        id: 'duty-roster',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fcfbfa',
        theme_color: '#5B93D8',
        lang: 'en',
        icons: [
          {
            src: './icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: './icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Today',
            short_name: 'Today',
            description: 'Jump to today\'s duty',
            url: './index.html?view=daily',
            icons: [{ src: './icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Month View',
            short_name: 'Month',
            description: 'View monthly calendar',
            url: './index.html?view=month',
            icons: [{ src: './icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Add Note',
            short_name: 'Note',
            description: 'Add a note to today',
            url: './index.html?action=note',
            icons: [{ src: './icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  }
});