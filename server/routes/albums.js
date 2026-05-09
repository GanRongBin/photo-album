import { Router } from 'express'
import { randomUUID } from 'crypto'
import { loadAlbums, findAlbum, addAlbum, deleteAlbum, updateAlbum } from '../db.js'
import { deletePhoto } from '../storage.js'

const router = Router()

function summary(album) {
  return {
    id: album.id,
    name: album.name,
    description: album.description,
    coverUrl: album.cover || null,
    photoCount: album.photos.length,
    shareCode: album.shareCode,
    createdAt: album.createdAt,
  }
}

function full(album) {
  return {
    ...album,
    coverUrl: album.cover || null,
  }
}

// List all albums
router.get('/', async (req, res) => {
  const albums = await loadAlbums()
  res.json(albums.map(summary))
})

// Get single album
router.get('/:id', async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })
  res.json(full(album))
})

// Create album
router.post('/', async (req, res) => {
  const { name, description } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '相册名称不能为空' })
  }
  const album = {
    id: randomUUID(),
    name: name.trim(),
    description: (description || '').trim(),
    cover: '',
    shareCode: null,
    photos: [],
    createdAt: new Date().toISOString(),
  }
  await addAlbum(album)
  res.status(201).json(summary(album))
})

// Delete album
router.delete('/:id', async (req, res) => {
  const album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

  for (const photo of album.photos) {
    if (photo.filename) {
      await deletePhoto(photo.filename)
    }
  }
  await deleteAlbum(album.id)
  res.status(204).end()
})

// Set album cover
router.post('/:id/cover/:photoId', async (req, res) => {
  const album = await updateAlbum(req.params.id, (a) => {
    const photo = a.photos.find(p => p.id === req.params.photoId)
    if (!photo) return
    a.cover = photo.url || ''
  })
  if (!album) return res.status(404).json({ error: '相册不存在' })
  res.json(summary(album))
})

export default router
