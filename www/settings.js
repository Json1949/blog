const MODEL = 'grok-4.7-high-fast'

const DEFAULTS = {
  apiKey: '',
  model: MODEL,
}

function normalize(value) {
  return {
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey : '',
    model: MODEL,
  }
}

async function request(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || '没能读写根目录的 data 文件夹。')
  }
  if (response.status === 204) return null
  return response.json()
}

export async function loadSettings() {
  const stored = await request('/api/store/settings')
  if (stored && (stored.apiKey || stored.model)) return normalize(stored)
  return { ...DEFAULTS }
}

export function saveSettings(settings) {
  const next = normalize(settings)
  return request('/api/store/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  })
}
