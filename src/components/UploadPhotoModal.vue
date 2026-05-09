<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>上传{{ fileTypeLabel }}</h2>

      <div
        class="drop-zone"
        :class="{ dragging, 'has-files': selectedFiles.length > 0 }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="handleDrop"
        @click="openFilePicker"
      >
        <div v-if="selectedFiles.length === 0" class="drop-hint">
          <span class="drop-icon">📤</span>
          <p>点击此处选择{{ fileTypeLabel }}</p>
          <p class="sub-hint">支持图片和视频 · 可多选 · 并发上传 · 秒传去重</p>
          <p class="sub-hint">手机选图时长按可多张选择 · 上传中请勿关闭屏幕</p>
        </div>
        <div v-else class="file-list">
          <div v-for="(f, i) in selectedFiles" :key="f._id" class="file-card">
            <div class="file-preview" :class="{ 'uploading': f._uploading, 'uploaded': f._done, 'failed': f._failed, 'dedup': f._dedup }">
              <video v-if="f.type.startsWith('video/')" :src="f._preview" class="preview-thumb" muted></video>
              <img v-else :src="f._preview" class="preview-thumb" />
              <span v-if="f.type.startsWith('video/')" class="video-badge">▶</span>
              <div v-if="f._done || f._dedup" class="file-done">✓</div>
              <div v-if="f._failed" class="file-failed">!</div>
              <button v-if="!uploading && !confirming" class="remove-btn" @click.stop="removeFile(i)">×</button>
            </div>
            <div class="file-meta">
              <span class="file-name" :title="f.name">{{ f.name }}</span>
              <span class="file-size">{{ formatSize(f.size) }}</span>
            </div>
            <div v-if="f._uploading" class="file-progress-outer">
              <div class="file-progress-inner" :style="{ width: f._pct + '%' }"></div>
            </div>
            <div v-if="f._uploading" class="file-pct-text">{{ f._pct }}%</div>
            <div v-if="f._dedup && !confirming" class="file-status dedup">⚡秒传</div>
            <div v-if="f._done && !f._dedup && !confirming" class="file-status done">已上传</div>
            <div v-if="f._failed" class="file-status failed" :title="f._error">{{ f._error || '上传失败' }}</div>
          </div>
          <div v-if="!uploading && !confirming" class="add-more" @click.stop="openFilePicker">
            <span class="add-more-icon">+</span><span>继续添加</span>
          </div>
        </div>
      </div>

      <input ref="fileInput" type="file" accept="image/*,video/*" multiple hidden @change="handleFiles" />

      <button v-if="selectedFiles.length > 0 && !uploading && !confirming" type="button" class="btn-add-more" @click="openFilePicker">
        + 继续添加{{ fileTypeLabel }}
      </button>

      <div v-if="selectedFiles.length > 0 && !uploading && !confirming" class="info-bar">
        已选择 <strong>{{ selectedFiles.length }}</strong> 个 · 共 {{ totalSize }}
      </div>

      <div v-if="uploading || confirming" class="summary-bar">
        <template v-if="uploading">📤 上传中: {{ doneCount }}/{{ totalCount }}</template>
        <template v-else>✅ 保存中...</template>
      </div>

      <div class="modal-actions">
        <button v-if="!uploading && !confirming" type="button" class="btn-cancel" @click="$emit('close')">取消</button>
        <button
          class="btn-primary"
          :disabled="selectedFiles.length === 0 || uploading || confirming"
          @click="handleUpload"
        >
          <template v-if="uploading">上传中 {{ doneCount }}/{{ totalCount }}</template>
          <template v-else-if="confirming">保存中...</template>
          <template v-else>上传 {{ selectedFiles.length }} {{ uploadCountLabel }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useToast } from '../composables/useToast.js'

const { toast } = useToast()

const BASE = import.meta.env.VITE_API_BASE || ''
const CHUNK_SIZE = 1 * 1024 * 1024 // 1MB per chunk
const MAX_RETRIES = 3

const props = defineProps({
  albumId: { type: String, default: '' },
  shareCode: { type: String, default: '' },
})
const emit = defineEmits(['close', 'uploaded'])

let _counter = 0
let wakeLock = null
const fileInput = ref(null)
const selectedFiles = ref([])
const dragging = ref(false)
const uploading = ref(false)
const confirming = ref(false)
const doneCount = ref(0)
const totalCount = ref(0)
const successCount = ref(0)
const failCount = ref(0)

const totalSize = computed(() => formatSize(selectedFiles.value.reduce((s, f) => s + f.size, 0)))
const hasVideo = computed(() => selectedFiles.value.some(f => f.type.startsWith('video/')))
const hasImage = computed(() => selectedFiles.value.some(f => f.type.startsWith('image/')))

const fileTypeLabel = computed(() => {
  if (hasImage.value && hasVideo.value) return '照片和视频'
  if (hasVideo.value && !hasImage.value) return '视频'
  return '照片'
})
const uploadCountLabel = computed(() => {
  if (hasImage.value && hasVideo.value) return '个文件'
  if (hasVideo.value && !hasImage.value) return '个视频'
  return '张照片'
})

function openFilePicker() { fileInput.value?.click() }
function handleFiles(e) { addFiles(Array.from(e.target.files)) }
function handleDrop(e) {
  dragging.value = false
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')))
}

function addFiles(files) {
  const enriched = files.map(f => {
    f._id = ++_counter
    f._preview = URL.createObjectURL(f)
    f._uploading = false
    f._done = false
    f._failed = false
    f._dedup = false
    f._pct = 0
    f._result = null
    f._error = null
    return f
  })
  selectedFiles.value = [...selectedFiles.value, ...enriched]
}

function removeFile(index) {
  URL.revokeObjectURL(selectedFiles.value[index]._preview)
  selectedFiles.value.splice(index, 1)
}

// Upload a single chunk with progress & retry
function uploadChunk(fileId, chunk, index, total, onProgress, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('chunk', chunk, `chunk-${index}`)
    fd.append('fileId', fileId)
    fd.append('index', String(index))
    fd.append('total', String(total))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/photos/chunk`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(index, e.loaded, e.total)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else if (retries > 0) {
        uploadChunk(fileId, chunk, index, total, onProgress, retries - 1).then(resolve, reject)
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error)) }
        catch { reject(new Error(`分块 ${index} 上传失败`)) }
      }
    }
    xhr.onerror = () => {
      if (retries > 0) {
        uploadChunk(fileId, chunk, index, total, onProgress, retries - 1).then(resolve, reject)
      } else {
        reject(new Error(`分块 ${index} 网络错误`))
      }
    }
    xhr.send(fd)
  })
}

// Upload one file: dedup → check for partial upload → chunked upload → complete
// 秒传：文件内容完全存在于云端，直接复用
// 断点续传：如果之前上传了一部分（localStorage + 服务器分块），跳过已完成的块
async function uploadFileChunked(file) {
  // 1. Read file & compute SHA-256 hash
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  // 2. Check dedup — full file already stored (秒传)
  try {
    const checkRes = await fetch(`${BASE}/api/photos/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash }),
    })
    if (checkRes.ok) {
      const { exists, photo } = await checkRes.json()
      if (exists && photo) {
        file._dedup = true
        file._pct = 100
        return photo
      }
    }
  } catch {}

  // 3. Check for partial upload — resume from last fileId (断点续传)
  const total = Math.ceil(file.size / CHUNK_SIZE)
  const chunkProgress = new Array(total).fill(0)
  let fileId = null
  let completedSet = new Set()

  try {
    const saved = localStorage.getItem(`upload:${hash}`)
    if (saved) fileId = saved
  } catch {}

  if (fileId) {
    try {
      const statusRes = await fetch(`${BASE}/api/photos/chunks/${fileId}`)
      if (statusRes.ok) {
        const { completed } = await statusRes.json()
        completedSet = new Set(completed)
        for (const i of completed) {
          chunkProgress[i] = 100
          file._pct = Math.round(chunkProgress.reduce((a, b) => a + b, 0) / total)
        }
      }
    } catch {}
  }

  // 4. Generate new fileId if no prior upload
  if (!fileId) {
    fileId = crypto.randomUUID()
    try { localStorage.setItem(`upload:${hash}`, fileId) } catch {}
  }

  // 5. Upload only missing chunks (already-completed chunks are skipped)
  const pending = []
  for (let i = 0; i < total; i++) {
    if (!completedSet.has(i)) pending.push(i)
  }

  // Track per-chunk byte progress for smooth overall progress
  const chunkBytes = new Array(total).fill(0)
  const chunkSizes = new Array(total).fill(0)
  for (let i = 0; i < total; i++) {
    chunkSizes[i] = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE)
  }

  if (pending.length > 0) {
    await Promise.allSettled(pending.map(async (index) => {
      const start = index * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const chunk = file.slice(start, end, file.type)
      await uploadChunk(fileId, chunk, index, total, (idx, loaded, totalBytes) => {
        chunkBytes[idx] = loaded
        // Real-time aggregate: sum of all chunk bytes / total file size
        const uploaded = chunkBytes.reduce((a, b) => a + b, 0)
        file._pct = Math.min(99, Math.round((uploaded / file.size) * 100))
      })
      chunkProgress[index] = 100
      chunkBytes[index] = chunkSizes[index]
      file._pct = Math.round(chunkBytes.reduce((a, b) => a + b, 0) / file.size * 100)
    }))
  }

  // Verify all chunks complete
  for (let i = 0; i < total; i++) {
    if (chunkProgress[i] < 100) throw new Error('部分分块上传失败，请重试')
  }

  // 6. Complete — server merges chunks
  const completeRes = await fetch(`${BASE}/api/photos/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId, fileName: file.name, total, contentType: file.type, hash,
    }),
  })
  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({}))
    throw new Error(err.error || '合并文件失败')
  }
  const { photo } = await completeRes.json()

  // Cleanup localStorage
  try { localStorage.removeItem(`upload:${hash}`) } catch {}

  file._pct = 100
  return photo
}

// ====== Main Upload Flow ======

async function handleUpload() {
  if (selectedFiles.value.length === 0 || uploading.value) return

  // WakeLock
  try {
    if (navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => { wakeLock = null })
    }
  } catch {}

  const isShared = !!props.shareCode
  const confirmPath = isShared
    ? `/api/shared/${props.shareCode}/photos/confirm`
    : `/api/albums/${props.albumId}/photos/confirm`

  uploading.value = true
  confirming.value = false
  doneCount.value = 0
  totalCount.value = selectedFiles.value.length
  successCount.value = 0
  failCount.value = 0

  // Reset
  for (const f of selectedFiles.value) {
    f._uploading = false; f._done = false; f._failed = false; f._dedup = false; f._pct = 0; f._result = null; f._error = null
  }

  // Phase 1: Upload all files concurrently (chunked + dedup for each)
  const uploadPromises = selectedFiles.value.map(async (file) => {
    file._uploading = true
    try {
      const photo = await uploadFileChunked(file)
      file._uploading = false
      if (file._dedup) {
        // 秒传 — already done
      } else {
        file._done = true
      }
      file._result = photo
      successCount.value++
      return { ok: true, photo }
    } catch (e) {
      file._uploading = false
      file._failed = true
      file._error = e.message
      failCount.value++
      return { ok: false, error: e.message }
    } finally {
      doneCount.value++
    }
  })

  await Promise.allSettled(uploadPromises)
  uploading.value = false

  // Phase 2: Atomic confirm
  const okPhotos = selectedFiles.value.filter(f => f._result).map(f => f._result)

  if (okPhotos.length === 0) {
    wakeLock?.release?.()
    toast('全部上传失败', 'error')
    return
  }

  confirming.value = true
  try {
    const confirmRes = await fetch(`${BASE}${confirmPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos: okPhotos }),
    })
    if (!confirmRes.ok) {
      const body = await confirmRes.json().catch(() => ({}))
      throw new Error(body.error || `确认失败 (${confirmRes.status})`)
    }
    const data = await confirmRes.json()

    confirming.value = false
      wakeLock?.release?.()
    emit('uploaded')

    const parts = [`成功 ${okPhotos.length} 个`]
    if (failCount.value > 0) parts.push(`失败 ${failCount.value} 个`)
    if (data.skipped) parts.push(`跳过 ${data.skipped} 个重复`)
    toast(parts.join(' · '), failCount.value === 0 ? 'success' : 'error')
  } catch (e) {
    confirming.value = false
      wakeLock?.release?.()
    toast('保存到相册失败: ' + e.message, 'error')
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.modal {
  background: #fff; border-radius: 16px; padding: 24px; width: 520px; max-width: 100%;
  max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
}
.modal h2 { margin: 0 0 16px; font-size: 20px; font-weight: 600; flex-shrink: 0; }
.drop-zone {
  border: 2px dashed #d9d9d9; border-radius: 14px; min-height: 140px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: border-color 0.2s, background 0.2s;
  overflow: hidden; flex-shrink: 1; position: relative;
}
.drop-zone.has-files { overflow-y: auto; max-height: 50vh; align-items: flex-start; }
.drop-zone.has-files::-webkit-scrollbar { width: 4px; }
.drop-zone.has-files::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 2px; }
.drop-zone:hover, .drop-zone.dragging { border-color: #4f8ef7; background: #f0f5ff; }
.drop-hint { text-align: center; color: #999; padding: 32px; }
.drop-icon { font-size: 44px; display: block; margin-bottom: 8px; }
.drop-hint p { margin: 0; font-size: 14px; }
.sub-hint { font-size: 12px !important; color: #bbb; margin-top: 4px !important; }

.file-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; width: 100%; }
.file-card {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  background: #f8f9fc; border-radius: 10px; padding: 8px 10px;
  border: 1px solid #eee; transition: border-color 0.2s;
}
.file-card:has(.uploading) { border-color: #4f8ef7; }
.file-card:has(.uploaded) { border-color: #4cd964; }
.file-card:has(.dedup) { border-color: #ff9500; background: #fffdf5; }
.file-card:has(.failed) { border-color: #e53e3e; background: #fff5f5; }

.file-preview {
  width: 48px; height: 48px; border-radius: 8px; overflow: hidden;
  background: #e0e2e5; flex-shrink: 0; position: relative;
}
.file-preview.uploading { opacity: 0.7; }
.file-preview.failed { opacity: 0.5; }
.preview-thumb { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

.file-done, .file-failed {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; pointer-events: none;
}
.file-done { background: #4cd964; color: #fff; }

.file-preview.dedup .file-done { background: #ff9500; }
.file-failed { background: #e53e3e; color: #fff; }

.video-badge {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.5);
  color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.remove-btn {
  position: absolute; top: 1px; right: 1px; width: 20px; height: 20px;
  border-radius: 50%; border: none; background: rgba(0,0,0,0.55); color: #fff;
  font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; z-index: 2;
}
.remove-btn:active { background: #e53e3e; transform: scale(0.9); }

.file-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.file-name {
  font-size: 13px; font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.file-size { font-size: 11px; color: #999; }

.file-progress-outer {
  width: 100%; height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden;
}
.file-progress-inner {
  height: 100%; background: linear-gradient(90deg, #4f8ef7, #6db3ff); border-radius: 3px;
  transition: width 0.3s ease;
}
.file-pct-text { font-size: 13px; font-weight: 600; color: #4f8ef7; min-width: 36px; text-align: right; }
.file-status { font-size: 12px; font-weight: 500; min-width: 48px; text-align: right; }
.file-status.done { color: #4cd964; }
.file-status.dedup { color: #ff9500; }
.file-status.failed { color: #e53e3e; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.add-more {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 12px; border: 2px dashed #d9d9d9; border-radius: 10px;
  color: #4f8ef7; font-size: 13px; gap: 4px; cursor: pointer; transition: all 0.2s;
}
.add-more:hover { border-color: #4f8ef7; background: #f8faff; }
.add-more:active { transform: scale(0.98); }
.add-more-icon { font-size: 24px; }

.btn-add-more {
  width: 100%; margin-top: 8px; padding: 10px; border: 1px dashed #4f8ef7; border-radius: 10px;
  background: #f0f5ff; color: #4f8ef7; font-size: 14px; font-weight: 500; cursor: pointer;
  transition: all 0.2s; flex-shrink: 0;
}
.btn-add-more:active { background: #dce8ff; transform: scale(0.98); }

.info-bar { margin-top: 10px; font-size: 13px; color: #888; flex-shrink: 0; text-align: center; }
.summary-bar { margin-top: 10px; font-size: 13px; color: #4f8ef7; flex-shrink: 0; text-align: center; font-weight: 500; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; flex-shrink: 0; }
.modal-actions .btn-cancel,
.modal-actions .btn-primary { min-height: 44px; }

@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: stretch; }
  .modal { border-radius: 0; max-height: 100vh; max-height: 100dvh; height: 100%; width: 100%; }
  .drop-zone { min-height: 100px; }
  .drop-zone.has-files { max-height: 55vh; }
}
</style>
