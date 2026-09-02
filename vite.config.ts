import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// En GitHub Actions, GITHUB_REPOSITORY = "DamianKR/Tournament-Bracket-Manager-FGC"
// Extraemos el nombre del repo para usarlo como base path en GitHub Pages.
// En local no existe esta variable → base queda como './' (relativa, funciona en cualquier ruta).
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = repoName ? `/${repoName}/` : './';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
