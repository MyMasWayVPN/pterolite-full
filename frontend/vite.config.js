import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 3000,
    proxy: {
      '/auth': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/containers': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/files': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/processes': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/console': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/scripts': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/startup-commands': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/docker': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        secure: false
      }
    }
  },
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
