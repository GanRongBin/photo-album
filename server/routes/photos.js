import { Router } from 'express'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import sharp from 'sharp'
import { findAlbum, updateAlbum } from '../db.js'
import { upload } from '../middleware/upload.js'
import { savePhoto, deletePhoto as removePhoto, getMinioClient, getMinioBucket } from '../storage.js'

const router = Router()

// Generate pre-signed MinIO upload URLs for direct browser upload
router.post('/:id/upload-sign', async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

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

// Confirm uploads (after direct OSS upload)
router.post('/:id/photos/confirm', async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

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

// Upload photos to album (traditional multipart, kept as fallback)
router.post('/:id/photos', upload.array('photos', 20), async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '请选择至少一张照片或视频' })
  }

  const newPhotos = []
  for (const f of req.files) {
    let buffer = f.buffer
    let name = f.originalname
    // Compress images to save space
    if (f.mimetype.startsWith('image/') && !f.mimetype.includes('svg')) {
      try {
        buffer = await sharp(f.buffer)
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, progressive: true })
          .toBuffer()
        // Change extension to .jpg for compressed images
        name = f.originalname.replace(/\.\w+$/, '.jpg')
      } catch {
        // If compression fails, keep original
      }
    }
    const filename = randomUUID() + extname(name)
    const url = await savePhoto(filename, buffer)
    newPhotos.push({
      id: randomUUID(),
      name,
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

// Delete photo from album
router.delete('/:id/photos/:photoId', async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

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
