import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Photo {
  id: string
  name: string
  filename: string
  createdAt: string
}

interface Album {
  id: string
  name: string
  description: string
  cover: string
  shareCode: string | null
  photos: Photo[]
  createdAt: string
}

type Bindings = {
  PHOTOS?: R2Bucket
  META: KVNamespace
  ASSETS?: { fetch: (req: Request) => Promise<Response> }
  MINIO_ENDPOINT?: string
  MINIO_PORT?: string
  MINIO_USE_SSL?: string
  MINIO_ACCESS_KEY?: string
  MINIO_SECRET_KEY?: string
  MINIO_BUCKET?: string
}

// ===== MinIO (S3-compatible) helpers =====

function minioConfig(env: Bindings) {
  const { MINIO_ENDPOINT: endpoint, MINIO_ACCESS_KEY: accessKey, MINIO_SECRET_KEY: secretKey, MINIO_BUCKET: bucket } = env
  if (!endpoint || !accessKey || !secretKey || !bucket) return null
  const useSSL = env.MINIO_USE_SSL === 'true'
  const port = env.MINIO_PORT || (useSSL ? '443' : '9000')
  return { endpoint, port, useSSL, accessKey, secretKey, bucket }
}

type MinioCfg = NonNullable<ReturnType<typeof minioConfig>>

function minioUrl(cfg: MinioCfg, filename: string) {
  const protocol = cfg.useSSL ? 'https' : 'http'
  return `${protocol}://${cfg.endpoint}:${cfg.port}/${cfg.bucket}/${filename}`
}

// AWS Signature V4 for S3-compatible API
async function sha256(data: string | Uint8Array) {
  const enc = new TextEncoder()
  const buf = typeof data === 'string' ? enc.encode(data) : data
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key: ArrayBuffer, data: string) {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', key instanceof Uint8Array ? key : new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return new Uint8Array(sig)
}

async function awsV4Sign(cfg: MinioCfg, method: string, filename: string, contentType: string, payloadHash: string) {
  const enc = new TextEncoder()
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'us-east-1'
  const service = 's3'
  const host = `${cfg.endpoint}:${cfg.port}`
  const scope = `${dateStamp}/${region}/${service}/aws4_request`

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = `${method}\n/${cfg.bucket}/${filename}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`

  const kDate = await hmacSha256(enc.encode('AWS4' + cfg.secretKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  const kSigning = await hmacSha256(kService, 'aws4_request')
  const signature = Array.from(await hmacSha256(kSigning, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('')

  return `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

async function minioPut(env: Bindings, filename: string, body: ArrayBuffer, contentType: string) {
  const cfg = minioConfig(env)
  if (!cfg) throw new Error('MinIO 未配置')
  const payloadHash = await sha256(new Uint8Array(body))
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const auth = await awsV4Sign(cfg, 'PUT', filename, contentType, payloadHash)
  const res = await fetch(minioUrl(cfg, filename), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Host': `${cfg.endpoint}:${cfg.port}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': auth,
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MinIO 上传失败: ${res.status} ${text}`)
  }
  return minioUrl(cfg, filename)
}

async function minioDelete(env: Bindings, filename: string) {
  const cfg = minioConfig(env)
  if (!cfg) return
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // empty string SHA-256
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const auth = await awsV4Sign(cfg, 'DELETE', filename, 'application/octet-stream', payloadHash)
  await fetch(minioUrl(cfg, filename), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Host': `${cfg.endpoint}:${cfg.port}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': auth,
    },
  })
}

// ===== KV photo fallback =====
const PHOTO_PREFIX = 'p:'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024

async function putPhotoKV(kv: KVNamespace, filename: string, data: ArrayBuffer, contentType: string) {
  if (data.byteLength > MAX_PHOTO_SIZE) throw new Error('照片大小超过5MB限制，请配置 MinIO 以解除限制')
  const bytes = new Uint8Array(data)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  await kv.put(PHOTO_PREFIX + filename, JSON.stringify({ ct: contentType, d: btoa(binary) }))
}

async function getPhotoKV(kv: KVNamespace, filename: string) {
  const raw = await kv.get(PHOTO_PREFIX + filename)
  if (!raw) return null
  const { ct, d } = JSON.parse(raw)
  const binary = atob(d)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { body: bytes, contentType: ct }
}

async function deletePhotoKV(kv: KVNamespace, filename: string) {
  await kv.delete(PHOTO_PREFIX + filename)
}

// ===== Unified storage =====

async function storePhoto(env: Bindings, filename: string, data: ArrayBuffer, contentType: string): Promise<string> {
  // MinIO (no size limit, self-hosted S3-compatible)
  if (minioConfig(env)) {
    await minioPut(env, filename, data, contentType)
    return filename
  }
  // R2 (when available, no size limit)
  if (env.PHOTOS) {
    await env.PHOTOS.put(filename, new Blob([data], { type: contentType }))
    return filename
  }
  // KV fallback (5MB limit)
  await putPhotoKV(env.META, filename, data, contentType)
  return filename
}

async function removePhoto(env: Bindings, filename: string) {
  const cfg = minioConfig(env)
  if (cfg) {
    await minioDelete(env, filename)
  } else if (env.PHOTOS) {
    try { await env.PHOTOS.delete(filename) } catch {}
  } else {
    await deletePhotoKV(env.META, filename)
  }
}

function photoUrlFor(env: Bindings, filename: string, base: string): string {
  const cfg = minioConfig(env)
  if (cfg) return `${base}/uploads/${filename}`
  return `${base}/uploads/${filename}`
}

// ===== App =====

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', cors())

function baseUrl(request: Request) { return new URL(request.url).origin }

function summary(env: Bindings, album: Album, base: string) {
  return {
    id: album.id, name: album.name, description: album.description,
    coverUrl: album.cover ? photoUrlFor(env, album.cover, base) : null,
    photoCount: album.photos.length, shareCode: album.shareCode, createdAt: album.createdAt,
  }
}

function full(env: Bindings, album: Album, base: string) {
  return {
    ...album,
    coverUrl: album.cover ? photoUrlFor(env, album.cover, base) : null,
    photos: album.photos.map(p => ({
      ...p,
      url: photoUrlFor(env, p.filename, base),
    })),
  }
}

async function loadAlbums(kv: KVNamespace): Promise<Album[]> {
  const raw = await kv.get('albums')
  return raw ? JSON.parse(raw) : []
}

async function saveAlbums(kv: KVNamespace, albums: Album[]) { await kv.put('albums', JSON.stringify(albums)) }
function generateId() { return crypto.randomUUID() }
function generateShareCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

// ===== ALBUMS =====

app.get('/api/albums', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const base = baseUrl(c.req.raw)
  return c.json(albums.map(a => summary(c.env, a, base)))
})

app.get('/api/albums/:id', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  return c.json(full(c.env, album, baseUrl(c.req.raw)))
})

app.post('/api/albums', async (c) => {
  const { name, description } = await c.req.json()
  if (!name || !name.trim()) return c.json({ error: '相册名称不能为空' }, 400)
  const album: Album = {
    id: generateId(), name: name.trim(), description: (description || '').trim(),
    cover: '', shareCode: null, photos: [], createdAt: new Date().toISOString(),
  }
  const albums = await loadAlbums(c.env.META)
  albums.unshift(album)
  await saveAlbums(c.env.META, albums)
  return c.json(summary(c.env, album, baseUrl(c.req.raw)), 201)
})

app.patch('/api/albums/:id/photos/:photoId/rename', async (c) => {
  const { name } = await c.req.json()
  if (!name || !name.trim()) return c.json({ error: '名称不能为空' }, 400)
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  const photo = album.photos.find(p => p.id === c.req.param('photoId'))
  if (!photo) return c.json({ error: '照片不存在' }, 404)
  photo.name = name.trim()
  await saveAlbums(c.env.META, albums)
  return c.json({ ok: true })
})

app.post('/api/albums/:id/photos/:photoId/move', async (c) => {
  const { toAlbumId } = await c.req.json()
  if (!toAlbumId) return c.json({ error: '目标相册不能为空' }, 400)
  const albums = await loadAlbums(c.env.META)
  const from = albums.find(a => a.id === c.req.param('id'))
  if (!from) return c.json({ error: '相册不存在' }, 404)
  const to = albums.find(a => a.id === toAlbumId)
  if (!to) return c.json({ error: '目标相册不存在' }, 404)
  const idx = from.photos.findIndex(p => p.id === c.req.param('photoId'))
  if (idx === -1) return c.json({ error: '照片不存在' }, 404)
  const [photo] = from.photos.splice(idx, 1)
  if (from.cover === photo.filename) from.cover = from.photos[0]?.filename || ''
  to.photos.unshift(photo)
  if (!to.cover) to.cover = photo.filename
  await saveAlbums(c.env.META, albums)
  return c.json({ ok: true })
})

app.patch('/api/albums/:id', async (c) => {
  const { name, description } = await c.req.json()
  if (!name || !name.trim()) return c.json({ error: '相册名称不能为空' }, 400)
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  album.name = name.trim()
  album.description = (description || '').trim()
  await saveAlbums(c.env.META, albums)
  return c.json(summary(c.env, album, baseUrl(c.req.raw)))
})

app.delete('/api/albums/:id', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  for (const photo of album.photos) {
    if (!photo.filename.startsWith('http')) await removePhoto(c.env, photo.filename)
  }
  await saveAlbums(c.env.META, albums.filter(a => a.id !== album.id))
  return c.body(null, 204)
})

app.post('/api/albums/:id/cover/:photoId', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  const photo = album.photos.find(p => p.id === c.req.param('photoId'))
  if (!photo) return c.json({ error: '照片不存在' }, 404)
  album.cover = photo.filename
  await saveAlbums(c.env.META, albums)
  return c.json(summary(c.env, album, baseUrl(c.req.raw)))
})

// ===== CHUNKED UPLOAD & DEDUP =====

// Check if file content already exists (hash-based dedup / 秒传)
app.post('/api/photos/check', async (c) => {
  const { hash } = await c.req.json()
  if (!hash || typeof hash !== 'string') return c.json({ error: '缺少 hash' }, 400)
  const raw = await c.env.META.get(`hash:${hash}`)
  if (raw) return c.json({ exists: true, photo: JSON.parse(raw) })
  return c.json({ exists: false })
})

// Upload a single chunk (续传 — each chunk stored independently)
app.post('/api/photos/chunk', async (c) => {
  const form = await c.req.formData()
  const chunk = form.get('chunk')
  const fileId = form.get('fileId')
  const index = form.get('index')
  const total = form.get('total')

  if (!chunk || typeof chunk === 'string' || !fileId || typeof fileId !== 'string') {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  const buf = await chunk.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])

  await c.env.META.put(`chunk:${fileId}:${index}`, btoa(binary), { expirationTtl: 7200 })
  return c.json({ ok: true, index: parseInt(index as string) })
})

// Complete chunked upload — merge chunks and store final file
app.post('/api/photos/complete', async (c) => {
  const { fileId, fileName, total, contentType, hash } = await c.req.json()
  if (!fileId || !fileName || !total) return c.json({ error: '缺少必要参数' }, 400)

  // Collect all chunks
  const parts: Uint8Array[] = []
  let totalSize = 0
  for (let i = 0; i < total; i++) {
    const raw = await c.env.META.get(`chunk:${fileId}:${i}`)
    if (!raw) return c.json({ error: `缺少分块 ${i}，请重新上传` }, 400)
    const decoded = atob(raw)
    const bytes = new Uint8Array(decoded.length)
    for (let j = 0; j < decoded.length; j++) bytes[j] = decoded.charCodeAt(j)
    parts.push(bytes)
    totalSize += bytes.length
  }

  // Merge into single buffer
  const merged = new Uint8Array(totalSize)
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.length
  }

  // Store merged file
  const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'jpg'
  const filename = `${generateId()}.${ext}`
  const storedKey = await storePhoto(c.env, filename, merged.buffer, contentType || 'image/jpeg')

  // Cleanup chunks
  for (let i = 0; i < total; i++) {
    await c.env.META.delete(`chunk:${fileId}:${i}`)
  }

  const photo = {
    id: generateId(), name: fileName, filename: storedKey,
    url: photoUrlFor(c.env, storedKey, baseUrl(c.req.raw)),
    createdAt: new Date().toISOString(),
  }

  // Save hash → photo mapping for future dedup
  if (hash) {
    await c.env.META.put(`hash:${hash}`, JSON.stringify(photo))
  }

  return c.json({ photo }, 201)
})

// Query completed chunks for resume (断点续传恢复)
app.get('/api/photos/chunks/:fileId', async (c) => {
  const { fileId } = c.req.param()
  const completed: number[] = []
  for (let i = 0; i < 100; i++) {
    const exists = await c.env.META.get(`chunk:${fileId}:${i}`)
    if (exists) completed.push(i)
  }
  return c.json({ completed, count: completed.length })
})

// Cancel chunked upload (cleanup)
app.delete('/api/photos/chunks/:fileId', async (c) => {
  const { fileId } = c.req.param()
  for (let i = 0; i < 100; i++) {
    await c.env.META.delete(`chunk:${fileId}:${i}`)
  }
  return c.body(null, 204)
})


// ===== PHOTOS =====

// Phase 1: upload single file (storage only, no album mutation)
app.post('/api/albums/:id/photos/upload', async (c) => {
  const albums = await loadAlbums(c.env.META)
  if (!albums.find(a => a.id === c.req.param('id'))) return c.json({ error: '相册不存在' }, 404)

  const form = await c.req.formData()
  const f = form.get('photo')
  if (!f || typeof f === 'string') return c.json({ error: '请选择照片或视频' }, 400)
  if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return c.json({ error: '只允许上传图片或视频文件' }, 400)

  const ext = f.name.includes('.') ? f.name.split('.').pop()! : 'jpg'
  const filename = `${generateId()}.${ext}`
  const buf = await f.arrayBuffer()
  const storedKey = await storePhoto(c.env, filename, buf, f.type)

  return c.json({
    photo: {
      id: generateId(), name: f.name, filename: storedKey,
      url: photoUrlFor(c.env, storedKey, baseUrl(c.req.raw)),
      createdAt: new Date().toISOString(),
    },
  }, 201)
})

// Phase 2: atomic batch confirm — adds all uploaded photos in one write
app.post('/api/albums/:id/photos/confirm', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)

  const { photos } = await c.req.json()
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return c.json({ error: '请提供照片列表' }, 400)
  }

  // Dedup: skip photos already in this album (same filename = same file)
  const existing = new Set(album.photos.map((p: any) => p.filename))
  const newPhotos = photos.filter((p: any) => !existing.has(p.filename))
  const skipped = photos.length - newPhotos.length

  if (newPhotos.length > 0) {
    album.photos.push(...newPhotos)
    if (!album.cover) album.cover = newPhotos[0].filename || newPhotos[0].url
    await saveAlbums(c.env.META, albums)
  }

  return c.json({
    photos: newPhotos.map((p: any) => ({ ...p, url: p.url || photoUrlFor(c.env, p.filename, baseUrl(c.req.raw)) })),
    skipped: skipped > 0 ? skipped : undefined,
  }, 201)
})

// Legacy: multipart batch upload (single request, atomic)

app.post('/api/albums/:id/photos', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)

  const form = await c.req.formData()
  const files = form.getAll('photos').filter(f => typeof f !== 'string') as File[]
  if (files.length === 0) return c.json({ error: '请选择至少一张照片或视频' }, 400)
  for (const f of files) {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return c.json({ error: '只允许上传图片或视频文件' }, 400)
  }

  const base = baseUrl(c.req.raw)
  const results = await Promise.allSettled(files.map(async (f) => {
    const ext = f.name.includes('.') ? f.name.split('.').pop()! : 'jpg'
    const filename = `${generateId()}.${ext}`
    const buf = await f.arrayBuffer()
    const url = await storePhoto(c.env, filename, buf, f.type)
    return { id: generateId(), name: f.name, filename: url, createdAt: new Date().toISOString() }
  }))

  const newPhotos: Photo[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') newPhotos.push(r.value)
    else errors.push(r.reason?.message || '上传失败')
  }

  if (newPhotos.length === 0) {
    return c.json({ error: `上传失败: ${errors.join('; ')}` }, 500)
  }

  album.photos.push(...newPhotos)
  if (!album.cover) album.cover = newPhotos[0].filename
  await saveAlbums(c.env.META, albums)

  return c.json({
    photos: newPhotos.map(p => ({ ...p, url: photoUrlFor(c.env, p.filename, base) })),
    errors: errors.length > 0 ? errors : undefined,
  }, 201)
})


app.delete('/api/albums/:id/photos/:photoId', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)

  const photo = album.photos.find(p => p.id === c.req.param('photoId'))
  if (!photo) return c.json({ error: '照片不存在' }, 404)

  if (!photo.filename.startsWith('http')) await removePhoto(c.env, photo.filename)

  album.photos = album.photos.filter(p => p.id !== photo.id)
  album.cover = album.photos.length > 0 ? album.photos[0].filename : ''
  await saveAlbums(c.env.META, albums)
  return c.body(null, 204)
})

// ===== SHARE =====

app.post('/api/albums/:id/share', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  if (!album.shareCode) { album.shareCode = generateShareCode(); await saveAlbums(c.env.META, albums) }
  const base = baseUrl(c.req.raw)
  return c.json({ shareCode: album.shareCode, shareUrl: `${base}/shared/${album.shareCode}` })
})

app.delete('/api/albums/:id/share', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.id === c.req.param('id'))
  if (!album) return c.json({ error: '相册不存在' }, 404)
  album.shareCode = null
  await saveAlbums(c.env.META, albums)
  return c.body(null, 204)
})

// ===== SHARED ACCESS =====

app.get('/api/shared/:code', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.shareCode === c.req.param('code'))
  if (!album) return c.json({ error: '分享链接无效或已失效' }, 404)
  return c.json(full(c.env, album, baseUrl(c.req.raw)))
})

// Shared: Phase 1 — upload file only
app.post('/api/shared/:code/photos/upload', async (c) => {
  const albums = await loadAlbums(c.env.META)
  if (!albums.find(a => a.shareCode === c.req.param('code'))) return c.json({ error: '分享链接无效或已失效' }, 404)

  const form = await c.req.formData()
  const f = form.get('photo')
  if (!f || typeof f === 'string') return c.json({ error: '请选择照片或视频' }, 400)
  if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return c.json({ error: '只允许上传图片或视频文件' }, 400)

  const ext = f.name.includes('.') ? f.name.split('.').pop()! : 'jpg'
  const filename = `${generateId()}.${ext}`
  const buf = await f.arrayBuffer()
  const storedKey = await storePhoto(c.env, filename, buf, f.type)

  return c.json({
    photo: {
      id: generateId(), name: f.name, filename: storedKey,
      url: photoUrlFor(c.env, storedKey, baseUrl(c.req.raw)),
      createdAt: new Date().toISOString(),
    },
  }, 201)
})

// Shared: Phase 2 — atomic batch confirm
app.post('/api/shared/:code/photos/confirm', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.shareCode === c.req.param('code'))
  if (!album) return c.json({ error: '分享链接无效或已失效' }, 404)

  const { photos } = await c.req.json()
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return c.json({ error: '请提供照片列表' }, 400)
  }

  // Dedup
  const existing = new Set(album.photos.map((p: any) => p.filename))
  const newPhotos = photos.filter((p: any) => !existing.has(p.filename))
  const skipped = photos.length - newPhotos.length

  if (newPhotos.length > 0) {
    album.photos.push(...newPhotos)
    if (!album.cover) album.cover = newPhotos[0].filename || newPhotos[0].url
    await saveAlbums(c.env.META, albums)
  }

  return c.json({
    photos: newPhotos.map((p: any) => ({ ...p, url: p.url || photoUrlFor(c.env, p.filename, baseUrl(c.req.raw)) })),
    skipped: skipped > 0 ? skipped : undefined,
  }, 201)
})


app.post('/api/shared/:code/photos', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.shareCode === c.req.param('code'))
  if (!album) return c.json({ error: '分享链接无效或已失效' }, 404)

  const form = await c.req.formData()
  const files = form.getAll('photos').filter(f => typeof f !== 'string') as File[]
  if (files.length === 0) return c.json({ error: '请选择至少一张照片或视频' }, 400)
  for (const f of files) {
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return c.json({ error: '只允许上传图片或视频文件' }, 400)
  }

  const base = baseUrl(c.req.raw)
  const results = await Promise.allSettled(files.map(async (f) => {
    const ext = f.name.includes('.') ? f.name.split('.').pop()! : 'jpg'
    const filename = `${generateId()}.${ext}`
    const buf = await f.arrayBuffer()
    const url = await storePhoto(c.env, filename, buf, f.type)
    return { id: generateId(), name: f.name, filename: url, createdAt: new Date().toISOString() }
  }))

  const newPhotos: Photo[] = []
  const errors: string[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') newPhotos.push(r.value)
    else errors.push(r.reason?.message || '上传失败')
  }

  if (newPhotos.length === 0) {
    return c.json({ error: `上传失败: ${errors.join('; ')}` }, 500)
  }

  album.photos.push(...newPhotos)
  if (!album.cover) album.cover = newPhotos[0].filename
  await saveAlbums(c.env.META, albums)
  return c.json({
    photos: newPhotos.map(p => ({ ...p, url: photoUrlFor(c.env, p.filename, base) })),
    errors: errors.length > 0 ? errors : undefined,
  }, 201)
})

app.delete('/api/shared/:code/photos/:photoId', async (c) => {
  const albums = await loadAlbums(c.env.META)
  const album = albums.find(a => a.shareCode === c.req.param('code'))
  if (!album) return c.json({ error: '分享链接无效或已失效' }, 404)
  const photo = album.photos.find(p => p.id === c.req.param('photoId'))
  if (!photo) return c.json({ error: '照片不存在' }, 404)
  if (!photo.filename.startsWith('http')) await removePhoto(c.env, photo.filename)
  album.photos = album.photos.filter(p => p.id !== photo.id)
  album.cover = album.photos.length > 0 ? album.photos[0].filename : ''
  await saveAlbums(c.env.META, albums)
  return c.body(null, 204)
})

// ===== SERVE PHOTOS =====

app.get('/uploads/:filename', async (c) => {
  if (c.env.PHOTOS) {
    const object = await c.env.PHOTOS.get(c.req.param('filename'))
    if (!object) return c.json({ error: '照片不存在' }, 404)
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('Cache-Control', 'public, max-age=31536000')
    return new Response(object.body, { headers })
  }
  const data = await getPhotoKV(c.env.META, c.req.param('filename'))
  if (!data) return c.json({ error: '照片不存在' }, 404)
  return new Response(data.body, {
    headers: { 'Content-Type': data.contentType, 'Cache-Control': 'public, max-age=31536000' },
  })
})

// ===== SPA FALLBACK =====

app.get('*', async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw)
    if (res.status !== 404) return res
  }
  if (c.env.ASSETS) return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)))
  return c.notFound()
})

export default app
