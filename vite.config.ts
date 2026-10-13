import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Actions, GITHUB_REPOSITORY = "DamianKR/Tournament-Bracket-Manager-FGC"
// Extraemos el nombre del repo para usarlo como base path en GitHub Pages.
// En local no existe esta variable → base queda como './' (relativa, funciona en cualquier ruta).
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = repoName ? `/${repoName}/` : './';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Service Worker: solo en builds de CI (base absoluta de GitHub Pages).
    // En local la base es './' y registrar './sw.js' desde rutas anidadas
    // fallaría; ahí el plugin queda desactivado (virtual modules como no-op).
    VitePWA({
      disable: !repoName,
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.svg', 'logo-white.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'RankNexus',
        short_name: 'RankNexus',
        description: 'Comunidades, torneos, ligas y rankings ELO para juegos de pelea',
        theme_color: '#7c3aed',
        background_color: '#1e1b4b',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache solo del app shell. public/images (~50 MB) NO se precachea:
        // se cachea bajo demanda con runtimeCaching.
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
        globIgnores: ['images/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-styles' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base,
  server: {
    port: 5174, // Puerto para desarrollo
    strictPort: true,
  },
  preview: {
    port: 5173, // Puerto para producción
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['react', 'react-dom', 'scheduler'],
  },
})
