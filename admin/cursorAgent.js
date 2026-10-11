import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Agent, CursorAgentError } from '@cursor/sdk'

const MODEL = {
  id: 'grok-4.7',
  params: [
    { id: 'context', value: '256k' },
    { id: 'reasoning_effort', value: 'high' },
    { id: 'fast', value: 'true' },
  ],
}

const SCRATCH = path.join(os.tmpdir(), 'nike-blog-cursor')

function bearer(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(\S+)/i)
  return match ? match[1].trim() : ''
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('这次请求太大了。'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function splitContent(content) {
  if (typeof content === 'string') return { text: content, images: [] }
  if (!Array.isArray(content)) return { text: '', images: [] }
  const texts = []
  const images = []
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text)
    const url = part?.type === 'image_url' ? part.image_url?.url : ''
    const match = typeof url === 'string' ? url.match(/^data:([^;,]+);base64,([\s\S]+)$/) : null
    if (match) images.push({ data: match[2], mimeType: match[1] })
  }
  return { text: texts.join('\n'), images }
}

function promptFromMessages(messages) {
  const system = []
  const texts = []
  const images = []
  for (const message of messages || []) {
    const part = splitContent(message?.content)
    images.push(...part.images)
    if (!part.text) continue
    if (message?.role === 'system') system.push(part.text)
    else texts.push(part.text)
  }
  return {
    system: system.join('\n\n'),
    text: texts.join('\n\n'),
    images,
  }
}

function publicError(error) {
  const message = error?.message || 'Cursor 没有完成这次请求。'
  if (/unauthenticated|invalid api key|unauthorized|401/i.test(message)) {
    return 'API Key 无效。请检查本机配置，或在设置里重新填写。'
  }
  if (/429|rate limit|too many/i.test(message)) return '请求太频繁，过一会儿再试。'
  return message
}

function abortError() {
  const error = new Error('已取消。')
  error.name = 'AbortError'
  return error
}

export async function complete({ apiKey, messages, signal }) {
  const { system, text, images } = promptFromMessages(messages)
  if (!text.trim() && images.length === 0) throw new Error('没有要发给模型的内容。')
  await fs.mkdir(SCRATCH, { recursive: true })
  const prompt = system ? `${system}\n\n${text}` : text
  const agent = await Agent.create({
    apiKey,
    model: MODEL,
    tools: [],
    local: { cwd: SCRATCH, settingSources: [] },
  })
  try {
    if (signal?.aborted) throw abortError()
    const run = await agent.send(images.length > 0 ? { text: prompt || '请看截图。', images } : prompt)
    const onAbort = () => {
      if (run.supports('cancel')) void run.cancel()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const result = await run.wait()
      if (signal?.aborted || result.status === 'cancelled') throw abortError()
      if (result.status === 'error') throw new Error(result.error?.message || '这次生成失败了。')
      const content = (result.result || '').trim()
      if (!content) throw new Error('Cursor 没有返回内容。')
      return content
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    if (error instanceof CursorAgentError) {
      const wrapped = new Error(publicError(error))
      wrapped.status = error.isRetryable ? 503 : 502
      throw wrapped
    }
    if (error?.status) throw error
    const wrapped = new Error(publicError(error))
    wrapped.status = 502
    throw wrapped
  } finally {
    await agent[Symbol.asyncDispose]()
  }
}

export function attachCursor(middlewares, options) {
  middlewares.use(async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname !== '/api/cursor/chat') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('不支持这个操作。')
      return
    }
    const signal = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) signal.abort()
    })
    try {
      const raw = await readBody(req, 32 * 1024 * 1024)
      const body = JSON.parse(raw.toString('utf8') || '{}')
      const apiKey = bearer(req) || options.apiKey || ''
      if (!apiKey.trim()) {
        sendJson(res, 400, { error: '还没有配置 Cursor API Key。' })
        return
      }
      const content = await complete({ apiKey: apiKey.trim(), messages: body.messages, signal: signal.signal })
      sendJson(res, 200, { content })
    } catch (error) {
      if (error?.name === 'AbortError') return
      const status = error?.status || 502
      sendJson(res, status, { error: error?.message || 'Cursor 没有完成这次请求。' })
    }
  })
}

function sendJson(res, status, value) {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}
