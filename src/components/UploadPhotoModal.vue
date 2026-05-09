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
          <p class="sub-hint">支持图片和视频 · 可多选 · 单文件上限20MB</p>
          <p class="sub-hint">手机选图时长按可多张选择</p>
        </div>
        <div v-else class="file-list">
          <div v-for="(f, i) in selectedFiles" :key="f._id" class="file-card" :class="cardClass(f._id)">
            <div class="file-preview">
              <video v-if="f.type.startsWith('video/')" :src="f._preview" class="preview-thumb" muted></video>
              <img v-else :src="f._preview" class="preview-thumb" />
              <span v-if="f.type.startsWith('video/')" class="video-badge">▶</span>
              <div v-if="st(f._id).status === 'done'" class="file-done">✓</div>
              <div v-if="st(f._id).status === 'failed'" class="file-failed">!</div>
              <button v-if="!uploading && !confirming" class="remove-btn" @click.stop="removeFile(i)">×</button>
            </div>
            <div class="file-meta">
              <span class="file-name" :title="f.name">{{ f.name }}</span>
              <span class="file-size">{{ formatSize(f.size) }}</span>
            </div>
            <div v-if="st(f._id).status === 'uploading'" class="file-progress-outer">
              <div class="file-progress-inner" :style="{ width: st(f._id).pct + '%' }"></div>
            </div>
            <div v-if="st(f._id).status === 'uploading'" class="file-pct-text">{{ st(f._id).pct }}%</div>
            <div v-if="st(f._id).status === 'done' && !confirming" class="file-status done">已上传</div>
            <div v-if="st(f._id).status === 'failed'" class="file-status failed" :title="st(f._id).error">{{ st(f._id).error || '上传失败' }}</div>
          </div>
          <div v-if="!uploading && !confirming" class="add-more" @click.stop="openFilePicker">
            <span class="add-more-icon">+</span><span>继续添加</span>
          </div>
        </div>
      </div>

      <input ref="fileInput" type="file" accept="image/*,video/*" multiple hidden @change="handleFiles" />

      <div v-if="selectedFiles.length > 0 && !uploading && !confirming" class="info-bar">
        已选择 <strong>{{ selectedFiles.length }}</strong> 个 · 共 {{ totalSize }}
      </div>

      <div v-if="uploading || confirming" class="summary-bar">
        <template v-if="uploading">📤 上传中: {{ doneCount }}/{{ selectedFiles.length }}</template>
        <template v-else>✅ 保存中...</template>
      </div>

      <div class="modal-actions">
        <button v-if="!uploading && !confirming" type="button" class="btn-cancel" @click="$emit('close')">取消</button>
        <button
          class="btn-primary"
          :disabled="selectedFiles.length === 0 || uploading || confirming"
          @click="handleUpload"
        >
          <template v-if="uploading">上传中 {{ doneCount }}/{{ selectedFiles.length }}</template>
          <template v-else-if="confirming">保存中...</template>
          <template v-else>上传 {{ selectedFiles.length }} {{ uploadCountLabel }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useToast } from '../composables/useToast.js'

const { toast } = useToast()

const BASE = import.meta.env.VITE_API_BASE || ''
const CONCURRENCY = 3

const props = defineProps({
  albumId: { type: String, default: '' },
  shareCode: { type: String, default: '' },
})
const emit = defineEmits(['close', 'uploaded'])

let _counter = 0
const fileInput = ref(null)
const selectedFiles = ref([])
const dragging = ref(false)
const uploading = ref(false)
const confirming = ref(false)
const doneCount = ref(0)
const failCount = ref(0)

// Per-file reactive state keyed by file._id
const fileStates = reactive({})

function st(id) { return fileStates[id] || {} }

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

function cardClass(id) {
  const s = fileStates[id]
  if (!s) return ''
  if (s.status === 'uploading') return 'card-uploading'
  if (s.status === 'done') return 'card-done'
  if (s.status === 'failed') return 'card-failed'
  return ''
}

function openFilePicker() { fileInput.value?.click() }

function handleFiles(e) {
  addFiles(Array.from(e.target.files))
  e.target.value = ''
}

function handleDrop(e) {
  dragging.value = false
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')))
}

function addFiles(files) {
  const enriched = files.map(f => {
    const id = ++_counter
    f._id = id
    f._preview = URL.createObjectURL(f)
    fileStates[id] = { pct: 0, status: 'pending', error: '', result: null }
    return f
  })
  selectedFiles.value = [...selectedFiles.value, ...enriched]
}

function removeFile(index) {
  const f = selectedFiles.value[index]
  URL.revokeObjectURL(f._preview)
  delete fileStates[f._id]
  selectedFiles.value.splice(index, 1)
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const state = fileStates[file._id]
    state.status = 'uploading'
    state.pct = 0

    const fd = new FormData()
    fd.append('file', file, file.name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/photos/upload`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        state.pct = Math.round((e.loaded / e.total) * 100)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          state.status = 'done'
          state.pct = 100
          state.result = data.photo
          resolve(data.photo)
        } catch {
          state.status = 'failed'
          state.error = '解析响应失败'
          reject(new Error('解析响应失败'))
        }
      } else {
        let msg = `上传失败 (${xhr.status})`
        try { msg = JSON.parse(xhr.responseText).error || msg } catch {}
        state.status = 'failed'
        state.error = msg
        reject(new Error(msg))
      }
    }

    xhr.onerror = () => {
      state.status = 'failed'
      state.error = '网络错误'
      reject(new Error('网络错误'))
    }

    xhr.send(fd)
  })
}

async function handleUpload() {
  if (selectedFiles.value.length === 0 || uploading.value) return

  const isShared = !!props.shareCode
  const confirmPath = isShared
    ? `/api/shared/${props.shareCode}/photos/confirm`
    : `/api/albums/${props.albumId}/photos/confirm`

  uploading.value = true
  confirming.value = false
  doneCount.value = 0
  failCount.value = 0

  // Reset all states
  for (const f of selectedFiles.value) {
    fileStates[f._id] = { pct: 0, status: 'pending', error: '', result: null }
  }

  // Upload with concurrency limit
  const files = [...selectedFiles.value]
  const results = []

  async function runNext() {
    while (files.length > 0) {
      const file = files.shift()
      try {
        const photo = await uploadFile(file)
        results.push({ ok: true, photo })
      } catch (e) {
        results.push({ ok: false, error: e.message })
        failCount.value++
      }
      doneCount.value++
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => runNext())
  await Promise.all(workers)

  uploading.value = false

  // Collect successful photos
  const okPhotos = results.filter(r => r.ok).map(r => r.photo)

  if (okPhotos.length === 0) {
    toast('全部上传失败', 'error')
    return
  }

  // Confirm to album
  confirming.value = true
  try {
    const confirmRes = await fetch(`${BASE}${confirmPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos: okPhotos }),
    })
    if (!confirmRes.ok) {
      const body = await confirmRes.json().catch(() => ({}))
      throw new Error(body.error || `保存失败 (${confirmRes.status})`)
    }
    const data = await confirmRes.json()

    confirming.value = false
    emit('uploaded')

    const parts = [`成功 ${okPhotos.length} 个`]
    if (failCount.value > 0) parts.push(`失败 ${failCount.value} 个`)
    if (data.skipped) parts.push(`跳过 ${data.skipped} 个重复`)
    toast(parts.join(' · '), failCount.value === 0 ? 'success' : 'error')
  } catch (e) {
    confirming.value = false
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
.file-card.card-uploading { border-color: #4f8ef7; }
.file-card.card-done { border-color: #4cd964; }
.file-card.card-failed { border-color: #e53e3e; background: #fff5f5; }

.file-preview {
  width: 48px; height: 48px; border-radius: 8px; overflow: hidden;
  background: #e0e2e5; flex-shrink: 0; position: relative;
}
.preview-thumb { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

.file-done, .file-failed {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; pointer-events: none;
}
.file-done { background: #4cd964; color: #fff; }
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
  transition: width 0.15s ease;
}
.file-pct-text { font-size: 13px; font-weight: 600; color: #4f8ef7; min-width: 36px; text-align: right; }
.file-status { font-size: 12px; font-weight: 500; min-width: 48px; text-align: right; }
.file-status.done { color: #4cd964; }
.file-status.failed { color: #e53e3e; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.add-more {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 12px; border: 2px dashed #d9d9d9; border-radius: 10px;
  color: #4f8ef7; font-size: 13px; gap: 4px; cursor: pointer; transition: all 0.2s;
}
.add-more:hover { border-color: #4f8ef7; background: #f8faff; }
.add-more:active { transform: scale(0.98); }
.add-more-icon { font-size: 24px; }

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
