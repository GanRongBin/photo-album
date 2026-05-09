import { Router } from 'express'
import { randomBytes } from 'crypto'
import { findAlbum, updateAlbum } from '../db.js'

const router = Router()

// Enable sharing
router.post('/:id/share', async (req, res) => {
  let album = await findAlbum(req.params.id)
  if (!album) return res.status(404).json({ error: '相册不存在' })

  if (!album.shareCode) {
    album = await updateAlbum(album.id, (a) => {
      a.shareCode = randomBytes(4).toString('hex')
    })
  }

  res.json({
    shareCode: album.shareCode,
    shareUrl: `/shared/${album.shareCode}`,
  })
})

// Disable sharing
router.delete('/:id/share', async (req, res) => {
  const album = await updateAlbum(req.params.id, (a) => {
    a.shareCode = null
  })
  if (!album) return res.status(404).json({ error: '相册不存在' })
  res.status(204).end()
})

export default router
