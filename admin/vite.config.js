import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const adminDir = path.dirname(fileURLToPath(import.meta.url))
const blogDir = path.resolve(adminDir, '..')

function cursorChat(apiKey) {
  return {
    name: 'cursor-chat',
    async configureServer(server) {
      const { attachCursor } = await import(pathToFileURL(path.resolve(adminDir, 'cursorAgent.js')).href)
      attachCursor(server.middlewares, { apiKey })
    },
    async configurePreviewServer(server) {
      const { attachCursor } = await import(pathToFileURL(path.resolve(adminDir, 'cursorAgent.js')).href)
      attachCursor(server.middlewares, { apiKey })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, blogDir, '')
  return {
    root: adminDir,
    publicDir: path.resolve(blogDir, 'public'),
    envDir: blogDir,
    server: {
      host: '127.0.0.1',
      port: 5174,
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
    plugins: [cursorChat(env.CURSOR_API_KEY || ''), react()],
  }
})
