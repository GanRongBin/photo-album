import express from 'express'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

import albumsRouter from './routes/albums.js'
import photosRouter from './routes/photos.js'
import shareRouter from './routes/share.js'
import sharedRouter from './routes/shared.js'
import { getPhotoStream } from './storage.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PERSIST_DIR || __dirname
const PORT = process.env.PORT || 3001

// Ensure data/uploads dirs exist
mkdirSync(join(BASE, 'data'), { recursive: true })
mkdirSync(join(BASE, 'uploads'), { recursive: true })

const app = express()

app.use(express.json())

// API routes
app.use('/api/albums', albumsRouter)
app.use('/api/albums', photosRouter)
app.use('/api/albums', shareRouter)
app.use('/api/shared', sharedRouter)

// Serve uploaded files from MinIO (or local disk)
app.get('/uploads/:filename', async (req, res, next) => {
  const stream = await getPhotoStream(req.params.filename)
  if (stream) {
    const mime = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska', '.webm': 'video/webm',
    }
    const ext = extname(req.params.filename).toLowerCase()
    res.set('Content-Type', mime[ext] || 'application/octet-stream')
    res.set('Cache-Control', 'public, max-age=31536000')
    stream.pipe(res)
    return
  }
  next()
})
app.use('/uploads', express.static(join(BASE, 'uploads')))

// Production: serve built frontend
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return
  res.sendFile(join(distPath, 'index.html'))
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件大小超过10MB限制' })
  }
  if (err.message === '只允许上传图片文件') {
    return res.status(400).json({ error: err.message })
  }
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
