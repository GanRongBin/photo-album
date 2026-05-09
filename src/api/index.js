// In dev, Vite proxy forwards /api to Express.
// In production, set VITE_API_BASE to your Worker URL.
const BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const headers = options.headers !== undefined ? options.headers : { 'Content-Type': 'application/json' }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `请求失败 (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function getAlbums() {
  return request('/api/albums')
}

export function getAlbum(id) {
  return request(`/api/albums/${id}`)
}

export function createAlbum(name, description) {
  return request('/api/albums', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

export function deleteAlbum(id) {
  return request(`/api/albums/${id}`, { method: 'DELETE' })
}

export function updateAlbum(id, name, description) {
  return request(`/api/albums/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, description }),
  })
}

export function setAlbumCover(albumId, photoId) {
  return request(`/api/albums/${albumId}/cover/${photoId}`, { method: 'POST' })
}

export async function uploadPhotos(albumId, files) {
  const form = new FormData()
  for (const f of files) form.append('photos', f)
  return request(`/api/albums/${albumId}/photos`, {
    method: 'POST',
    headers: {}, // Let browser set Content-Type with boundary
    body: form,
  })
}

export function deletePhoto(albumId, photoId) {
  return request(`/api/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' })
}

export function movePhoto(albumId, photoId, toAlbumId) {
  return request(`/api/albums/${albumId}/photos/${photoId}/move`, {
    method: 'POST',
    body: JSON.stringify({ toAlbumId }),
  })
}

export function renamePhoto(albumId, photoId, name) {
  return request(`/api/albums/${albumId}/photos/${photoId}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function enableShare(albumId) {
  return request(`/api/albums/${albumId}/share`, { method: 'POST' })
}

export function disableShare(albumId) {
  return request(`/api/albums/${albumId}/share`, { method: 'DELETE' })
}

export function getSharedAlbum(code) {
  return request(`/api/shared/${code}`)
}

export async function uploadPhotosToShared(code, files) {
  const form = new FormData()
  for (const f of files) form.append('photos', f)
  return request(`/api/shared/${code}/photos`, {
    method: 'POST',
    headers: {},
    body: form,
  })
}

export function deletePhotoFromShared(code, photoId) {
  return request(`/api/shared/${code}/photos/${photoId}`, { method: 'DELETE' })
}
