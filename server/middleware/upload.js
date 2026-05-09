import multer from 'multer'

function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传图片和视频文件'), false)
  }
}

// Use memory storage — files are saved by storage.js (OSS or disk)
export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
})
