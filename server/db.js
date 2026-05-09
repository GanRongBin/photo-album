import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.PERSIST_DIR || __dirname
const DATA_PATH = join(BASE, 'data', 'albums.json')

export async function loadAlbums() {
  try {
    const raw = await readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function saveAlbums(albums) {
  await writeFile(DATA_PATH, JSON.stringify(albums, null, 2), 'utf-8')
}

export async function findAlbum(id) {
  const albums = await loadAlbums()
  return albums.find(a => a.id === id) || null
}

export async function findAlbumByShareCode(code) {
  const albums = await loadAlbums()
  return albums.find(a => a.shareCode === code) || null
}

export async function addAlbum(album) {
  const albums = await loadAlbums()
  albums.unshift(album)
  await saveAlbums(albums)
  return album
}

export async function updateAlbum(id, updater) {
  const albums = await loadAlbums()
  const album = albums.find(a => a.id === id)
  if (!album) return null
  updater(album)
  await saveAlbums(albums)
  return album
}

export async function deleteAlbum(id) {
  const albums = await loadAlbums()
  const filtered = albums.filter(a => a.id !== id)
  await saveAlbums(filtered)
}
