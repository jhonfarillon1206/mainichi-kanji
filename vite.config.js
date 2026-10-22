import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Keep Google Fonts available offline after the first visit.
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } }
            }, {
          // Built-in dictionary for Reading: saved after first use, works offline.
          urlPattern: ({ url }) => url.pathname.endsWith('/dict.json'),
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'dictionary' }
        }]
      },
      manifest: {
              name: 'Mainichi Kanji',
        short_name: 'Mainichi Kanji',
        description: 'Personal kanji flashcards with spaced repetition',
        theme_color: '#dcebfa',
        background_color: '#eef4fb',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
