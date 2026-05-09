import { Router } from 'express'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import sharp from 'sharp'
import multer from 'multer'
import { savePhoto } from '../storage.js'

const router = Router()

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传图片和视频文件'), false)
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
})

// Upload a single file — direct multipart, no chunking
router.post('/upload', upload.single('file'), async (req, res, next) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: '请选择文件' })
  }

  try {
    let buffer = file.buffer
    let name = file.originalname
    let ext = extname(name).toLowerCase() || '.jpg'

    if (file.mimetype.startsWith('image/') && !file.mimetype.includes('svg')) {
      try {
        buffer = await sharp(file.buffer)
          .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, progressive: true })
          .toBuffer()
        name = file.originalname.replace(/\.\w+$/, '.jpg')
        ext = '.jpg'
      } catch (err) {
        console.error('Image compression failed:', err.message)
      }
    }

    const filename = randomUUID() + ext
    const url = await savePhoto(filename, buffer)

    const photo = {
      id: randomUUID(),
      name,
      filename,
      url,
      createdAt: new Date().toISOString(),
    }

    res.status(201).json({ photo })
  } catch (err) {
    next(err)
  }
})

export default router
