const IMAGE_ID = /img:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

export function listImageIds(markdown) {
  return [...String(markdown || '').matchAll(IMAGE_ID)].map((match) => match[1].toLowerCase())
}

export function countMissingImages(source, next) {
  const kept = new Set(listImageIds(next))
  return listImageIds(source).filter((id) => !kept.has(id)).length
}

export function cleanCategoryName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16)
}

export function countWords(markdown) {
  const plain = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_~`]/g, ' ')
  const cjk = (plain.match(/[\u3400-\u9fff]/g) || []).length
  const latin = plain
    .replace(/[\u3400-\u9fff]/g, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0).length
  return cjk + latin
}
