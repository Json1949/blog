import { listImageIds } from './text.js'

const BASE = '/api/store'
const DEFAULT_CATEGORIES = [
  { name: '知识点', createdAt: 1 },
  { name: '博客', createdAt: 2 },
]

async function request(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || '没能读写根目录的 data 文件夹。')
  }
  if (response.status === 204) return null
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json()
  throw new Error('没能连上后端。请运行 start.bat。')
}

async function readCollection(kind) {
  const rows = await request(`${BASE}/${kind}`)
  return Array.isArray(rows) ? rows : []
}

function writeRecord(kind, record) {
  return request(`${BASE}/${kind}/${record.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(record),
  })
}

function deleteRecord(kind, id) {
  return request(`${BASE}/${kind}/${id}`, { method: 'DELETE' })
}

function normalizePost(post) {
  const next = { ...post }
  delete next.bookId
  delete next.chapterIndex
  return {
    ...next,
    categoryId: typeof post.categoryId === 'string' ? post.categoryId : '',
  }
}

export async function loadPosts() {
  const rows = await readCollection('posts')
  return rows
    .map(normalizePost)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function savePost(post) {
  return writeRecord('posts', post)
}

export function removePost(id) {
  return deleteRecord('posts', id)
}

async function readCategories() {
  const rows = await readCollection('categories')
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

let categoriesPromise

async function seedCategories() {
  const stored = await readCategories()
  const names = new Set()
  for (const category of stored) {
    if (!names.has(category.name)) {
      names.add(category.name)
      continue
    }
    await removeCategory(category.id)
  }
  const meta = await loadMeta()
  if (!meta.categoryDefaults) {
    for (const category of DEFAULT_CATEGORIES) {
      if (names.has(category.name)) continue
      await saveCategory({ id: crypto.randomUUID(), ...category })
      names.add(category.name)
    }
    await patchMeta({ categoryDefaults: true })
  }
  return readCategories()
}

export function loadCategories() {
  if (!categoriesPromise) {
    categoriesPromise = seedCategories().finally(() => {
      categoriesPromise = null
    })
  }
  return categoriesPromise
}

export function saveCategory(category) {
  return writeRecord('categories', category)
}

export function removeCategory(id) {
  return deleteRecord('categories', id)
}

export async function loadMeta() {
  const meta = await request(`${BASE}/meta`)
  return meta && typeof meta === 'object' ? meta : {}
}

export async function patchMeta(partial) {
  const current = await loadMeta()
  await request(`${BASE}/meta`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...current, ...partial }),
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function putImage(record) {
  const dataUrl = await blobToDataUrl(record.blob)
  await request(`${BASE}/images/${record.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: record.type || record.blob?.type || 'image/png',
      createdAt: record.createdAt || Date.now(),
      dataUrl,
    }),
  })
}

export function saveImage(record) {
  return putImage(record)
}

export function removeImage(id) {
  return deleteRecord('images', id)
}

export async function loadImage(id) {
  const response = await fetch(`${BASE}/images/${id}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error('没能读取图片。')
  const blob = await response.blob()
  return {
    id,
    blob,
    type: blob.type || 'image/png',
    createdAt: Number(response.headers.get('x-created-at')) || 0,
  }
}

async function loadImageKeys() {
  const keys = await request(`${BASE}/images`)
  return Array.isArray(keys) ? keys : []
}

export async function pruneImages(posts) {
  const used = new Set()
  for (const post of posts) {
    for (const id of listImageIds(post.content)) used.add(id)
  }
  const keys = await loadImageKeys()
  await Promise.all(
    keys
      .map((key) => String(key).toLowerCase())
      .filter((id) => !used.has(id))
      .map((id) => removeImage(id)),
  )
}

