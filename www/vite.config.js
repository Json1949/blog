import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const wwwDir = path.dirname(fileURLToPath(import.meta.url))
const blogDir = path.resolve(wwwDir, '..')

export default defineConfig({
  root: wwwDir,
  publicDir: path.resolve(blogDir, 'public'),
  envDir: blogDir,
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/store': 'http://127.0.0.1:8787',
    },
    fs: {
      allow: [blogDir],
    },
  },
  preview: {
    proxy: {
      '/api/store': 'http://127.0.0.1:8787',
    },
  },
  plugins: [react()],
})
