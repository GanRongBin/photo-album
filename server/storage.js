import { Client } from 'minio'
import { writeFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PERSIST_DIR || __dirname
const DISK_DIR = join(BASE, 'uploads')

export function getMinioClient() {
  if (process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY) {
    return new Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    })
  }
  return null
}

const minioClient = getMinioClient()

export function getMinioBucket() {
  return process.env.MINIO_BUCKET || 'photo-album'
}

export async function savePhoto(filename, buffer) {
  if (minioClient) {
    await minioClient.putObject(getMinioBucket(), filename, buffer)
    return `/uploads/${filename}`
  }
  await writeFile(join(DISK_DIR, filename), buffer)
  return `/uploads/${filename}`
}

export async function deletePhoto(filename) {
  if (minioClient) {
    try { await minioClient.removeObject(getMinioBucket(), filename) } catch {}
  } else {
    try { await unlink(join(DISK_DIR, filename)) } catch {}
  }
}

export async function getPhotoStream(filename) {
  if (minioClient) {
    try {
      return await minioClient.getObject(getMinioBucket(), filename)
    } catch {
      return null
    }
  }
  return null
}
