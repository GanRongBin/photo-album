import { Router } from 'express'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import { findAlbumByShareCode, updateAlbum } from '../db.js'
import { upload } from '../middleware/upload.js'
import { savePhoto, deletePhoto as removePhoto, getMinioClient, getMinioBucket } from '../storage.js'

const router = Router()

function full(album) {
  return {
    ...album,
    coverUrl: album.cover || null,
  }
}

// Get shared album
router.get('/:code', async (req, res) => {
  const album = await findAlbumByShareCode(req.params.code)
  if (!album) return res.status(404).json({ error: '分享链接无效或已失效' })
  res.json(full(album))
})

// Generate pre-signed MinIO upload URLs for shared album
router.post('/:code/upload-sign', async (req, res) => {
  const album = await findAlbumByShareCode(req.params.code)
  if (!album) return res.status(404).json({ error: '分享链接无效或已失效' })

  const { files } = req.body
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: '请提供文件列表' })
  }

  const minio = getMinioClient()
  const bucket = getMinioBucket()
  const result = await Promise.all(files.map(async f => {
    const ext = extname(f.name)
    const filename = randomUUID() + ext
    if (minio) {
      const uploadUrl = await minio.presignedPutObject(bucket, filename, 600)
      const publicUrl = `/uploads/${filename}`
      return { name: f.name, filename, uploadUrl, publicUrl }
    } else {
      return { name: f.name, filename, uploadUrl: null, publicUrl: null }
    }
  }))

  res.json({ files: result })
})

// Confirm uploads for shared album
router.post('/:code/photos/confirm', async (req, res) => {
  const album = await findAlbumByShareCode(req.params.code)
  if (!album) return res.status(404).json({ error: '分享链接无效或已失效' })

  const { photos } = req.body
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: '请提供照片列表' })
  }

  const newPhotos = photos.map(p => ({
    id: p.id || randomUUID(),
    name: p.name,
    filename: p.filename,
    url: p.url,
    createdAt: new Date().toISOString(),
  }))

  await updateAlbum(album.id, (a) => {
    a.photos.push(...newPhotos)
    if (!a.cover) a.cover = newPhotos[0].url
  })

  res.status(201).json({ photos: newPhotos })
})

// Upload photos to shared album (traditional multipart, fallback)
router.post('/:code/photos', upload.array('photos', 20), async (req, res) => {
  const album = await findAlbumByShareCode(req.params.code)
  if (!album) return res.status(404).json({ error: '分享链接无效或已失效' })

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请选择至少一张照片' })
  }

  const newPhotos = []
  for (const f of req.files) {
    const filename = randomUUID() + extname(f.originalname)
    const url = await savePhoto(filename, f.buffer)
    newPhotos.push({
      id: randomUUID(),
      name: f.originalname,
      filename,
      url,
      createdAt: new Date().toISOString(),
    })
  }

  await updateAlbum(album.id, (a) => {
    a.photos.push(...newPhotos)
    if (!a.cover) a.cover = newPhotos[0].url
  })

  res.status(201).json({ photos: newPhotos })
})

// Delete photo from shared album
router.delete('/:code/photos/:photoId', async (req, res) => {
  const album = await findAlbumByShareCode(req.params.code)
  if (!album) return res.status(404).json({ error: '分享链接无效或已失效' })

  const photo = album.photos.find(p => p.id === req.params.photoId)
  if (!photo) return res.status(404).json({ error: '照片不存在' })

  if (photo.filename) {
    await removePhoto(photo.filename)
  }

  await updateAlbum(album.id, (a) => {
    a.photos = a.photos.filter(p => p.id !== req.params.photoId)
    a.cover = a.photos.length > 0 ? a.photos[0].url : ''
  })

  res.status(204).end()
})

export default router
