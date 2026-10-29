import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          markdown: ['react-markdown', 'remark-gfm'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${process.env.PORT || 8787}`, changeOrigin: true, ws: true }
    }
  }
})
