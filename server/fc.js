// Alibaba Cloud Function Compute entry point
// Deploy: zip the whole project and upload to FC with HTTP trigger
//
// Runtime: Node.js 18+, handler: index.handler
// The FC runtime will load this file as the entry

import serverless from 'serverless-http'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

import albumsRouter from './routes/albums.js'
import photosRouter from './routes/photos.js'
import shareRouter from './routes/share.js'
import sharedRouter from './routes/shared.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

mkdirSync(join(__dirname, 'data'), { recursive: true })
mkdirSync(join(__dirname, 'uploads'), { recursive: true })

const app = express()
app.use(express.json())

app.use('/api/albums', albumsRouter)
app.use('/api/albums', photosRouter)
app.use('/api/albums', shareRouter)
app.use('/api/shared', sharedRouter)
app.use('/uploads', express.static(join(__dirname, 'uploads')))

// Serve frontend in production
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return
  res.sendFile(join(distPath, 'index.html'))
})

app.use((err, req, res, next) => {
  console.error(err)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件大小超过10MB限制' })
  }
  res.status(500).json({ error: '服务器内部错误' })
})

export const handler = serverless(app)
