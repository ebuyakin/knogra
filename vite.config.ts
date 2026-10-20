import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',  // Listen on all interfaces so Mac host can connect
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // Two pages from one bundle: the editor and the mobile viewer (docs/mobile-viewer.md §3).
      input: {
        main: 'index.html',
        view: 'view.html',
      },
    },
  },
})
