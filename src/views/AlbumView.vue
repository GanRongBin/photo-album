<template>
  <div class="album-view">
    <!-- Header -->
    <header class="album-header">
      <button class="btn-back" @click="$router.push('/')">←</button>
      <div class="album-info">
        <h1>{{ album?.name }}</h1>
        <p v-if="album?.description" class="desc">{{ album.description }}</p>
      </div>
      <div class="header-actions">
        <button v-if="!selectMode" class="btn-icon" title="编辑相册" @click="showEditModal = true">✎</button>
        <button v-if="!selectMode" class="btn-sort" @click="toggleSort">
          {{ sortNewest ? '↓ 最新' : '↑ 最早' }}
        </button>
        <button v-if="!selectMode" class="btn-primary btn-upload" @click="showUploadModal = true">
          +<span class="btn-label"> 上传</span>
        </button>
        <button v-if="!selectMode" class="btn-share" @click="showShareModal = true">
          {{ album?.shareCode ? '🔗' : '🔗' }}<span class="btn-label" v-if="album?.shareCode"> 已分享</span><span class="btn-label" v-else> 分享</span>
        </button>
      </div>
    </header>

    <!-- Select bar -->
    <div v-if="album?.photos.length && !selectMode" class="select-bar">
      <button class="btn-select-mode" @click="enterSelectMode">☐ 批量选择</button>
    </div>
    <div v-if="selectMode" class="select-bar select-bar-active">
      <span class="select-bar-info">已选 {{ selectedIds.size }} 张</span>
      <button class="btn-cancel" @click="exitSelectMode">取消</button>
    </div>

    <!-- Stats bar -->
    <div v-if="album" class="stats-bar">
      {{ album.photos.length }} 个项目{{ selectMode ? '' : '' }}
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="photo-grid">
      <div v-for="n in 6" :key="n" class="skeleton-card">
        <div class="skeleton" style="aspect-ratio:4/3"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text-short"></div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!groupedPhotos.length" class="empty-state">
      <div class="empty-icon">📷</div>
      <p>相册还是空的</p>
      <p class="empty-sub">上传照片或视频吧</p>
      <button class="btn-primary" @click="showUploadModal = true">+ 上传照片</button>
    </div>

    <!-- Photo groups -->
    <div v-else>
      <div v-for="group in groupedPhotos" :key="group.label" class="photo-group">
        <h2 class="group-title">{{ group.label }}</h2>
        <div class="photo-grid">
          <div
            v-for="photo in group.photos"
            :key="photo.id"
            class="photo-card-wrapper"
            :class="{ selected: selectedIds.has(photo.id) }"
          >
            <div v-if="selectMode" class="select-check" @click="toggleSelect(photo.id)">
              <span v-if="selectedIds.has(photo.id)">✓</span>
            </div>
            <PhotoCard
              :photo="photo"
              @click="selectMode ? toggleSelect(photo.id) : openLightbox(photo)"
              @delete="handleDeletePhoto(photo)"
              @move="photoToMove = photo.id; showMoveModal = true"
              @rename="photoToRename = photo; showRenameModal = true"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Batch action bar -->
    <div v-if="selectMode && selectedIds.size > 0" class="batch-bar">
      <button class="btn-select-all" @click="selectAll">{{ selectedIds.size === album?.photos.length ? '取消全选' : '全选' }}</button>
      <button class="btn-move" @click="showMoveModal = true">移动到</button>
      <button class="btn-danger" @click="batchDelete">删除 ({{ selectedIds.size }})</button>
    </div>

    <!-- Modals -->
    <UploadPhotoModal
      v-if="showUploadModal"
      :album-id="album?.id"
      @close="showUploadModal = false"
      @uploaded="onPhotoUploaded"
    />
    <PhotoLightbox
      v-if="lightboxIndex !== null && !selectMode"
      :photo="album.photos[lightboxIndex]"
      :photos="album.photos"
      :total="album.photos.length"
      :index="lightboxIndex"
      @close="lightboxIndex = null"
      @prev="lightboxIndex--"
      @next="lightboxIndex++"
    />
    <ShareModal
      v-if="showShareModal"
      :album-id="album?.id"
      :share-code="album?.shareCode"
      @close="showShareModal = false"
      @updated="onShareUpdated"
    />
    <EditAlbumModal
      v-if="showEditModal"
      :album-id="album?.id"
      @close="showEditModal = false"
      @updated="onAlbumUpdated"
    />
    <MoveModal
      v-if="showMoveModal"
      :album-id="album?.id"
      :photo-ids="photoToMove ? [photoToMove] : [...selectedIds]"
      @close="showMoveModal = false; photoToMove = null"
      @moved="onPhotosMoved"
    />
    <RenameModal
      v-if="showRenameModal && photoToRename"
      :album-id="album?.id"
      :photo-id="photoToRename.id"
      :old-name="photoToRename.name"
      @close="showRenameModal = false; photoToRename = null"
      @done="showRenameModal = false; photoToRename = null; loadAlbum()"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '../composables/useToast.js'
import { useConfirm } from '../composables/useConfirm.js'
import { getAlbum, deletePhoto } from '../api/index.js'
import PhotoCard from '../components/PhotoCard.vue'
import UploadPhotoModal from '../components/UploadPhotoModal.vue'
import PhotoLightbox from '../components/PhotoLightbox.vue'
import ShareModal from '../components/ShareModal.vue'
import EditAlbumModal from '../components/EditAlbumModal.vue'
import MoveModal from '../components/MoveModal.vue'
import RenameModal from '../components/RenameModal.vue'

const route = useRoute()
const { toast } = useToast()
const { confirm } = useConfirm()
const album = ref(null)
const loading = ref(true)
const sortNewest = ref(true)
const selectMode = ref(false)
const selectedIds = ref(new Set())
const showUploadModal = ref(false)
const showShareModal = ref(false)
const showEditModal = ref(false)
const showMoveModal = ref(false)
const showRenameModal = ref(false)
const photoToRename = ref(null)
const photoToMove = ref(null)
const lightboxIndex = ref(null)

function toggleSort() { sortNewest.value = !sortNewest.value }

function enterSelectMode() { selectMode.value = true; selectedIds.value = new Set() }
function exitSelectMode() { selectMode.value = false; selectedIds.value = new Set() }

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function selectAll() {
  if (selectedIds.value.size === album.value.photos.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(album.value.photos.map(p => p.id))
  }
}

async function batchDelete() {
  const count = selectedIds.value.size
  if (!await confirm(`确定要删除选中的 ${count} 个项目吗？`, '批量删除')) return
  try {
    for (const id of selectedIds.value) {
      await deletePhoto(album.value.id, id)
    }
    toast(`已删除 ${count} 个项目`, 'success')
    exitSelectMode()
    loadAlbum()
  } catch (e) {
    toast('批量删除失败: ' + e.message, 'error')
  }
}

const groupedPhotos = computed(() => {
  if (!album.value?.photos?.length) return []
  const sorted = [...album.value.photos].sort((a, b) => {
    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    return sortNewest.value ? db - da : da - db
  })

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups = []
  const todayPhotos = []
  const yesterdayPhotos = []
  const weekPhotos = []
  const earlierPhotos = []

  for (const p of sorted) {
    const d = new Date(p.createdAt)
    if (d >= today) todayPhotos.push(p)
    else if (d >= yesterday) yesterdayPhotos.push(p)
    else if (d >= weekAgo) weekPhotos.push(p)
    else earlierPhotos.push(p)
  }

  if (todayPhotos.length) groups.push({ label: '今天', photos: todayPhotos })
  if (yesterdayPhotos.length) groups.push({ label: '昨天', photos: yesterdayPhotos })
  if (weekPhotos.length) groups.push({ label: '本周', photos: weekPhotos })
  if (earlierPhotos.length) groups.push({ label: '更早', photos: earlierPhotos })

  return groups
})

async function loadAlbum() {
  loading.value = true
  try {
    album.value = await getAlbum(route.params.id)
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function onPhotoUploaded() { showUploadModal.value = false; loadAlbum() }
function onShareUpdated() { loadAlbum() }
function onAlbumUpdated() { showEditModal.value = false; loadAlbum() }
function onPhotosMoved() { showMoveModal.value = false; photoToMove.value = null; exitSelectMode(); loadAlbum() }
function openLightbox(photo) { lightboxIndex.value = album.value.photos.indexOf(photo) }

async function handleDeletePhoto(photo) {
  if (!await confirm('确定要删除这个项目吗？', '删除照片')) return
  try {
    await deletePhoto(album.value.id, photo.id)
    loadAlbum()
    toast('已删除', 'success')
  } catch (e) {
    toast('删除失败: ' + e.message, 'error')
  }
}

onMounted(loadAlbum)
</script>

<style scoped>
.album-view { max-width: 1200px; margin: 0 auto; padding: 24px 24px 48px; }

/* Header */
.album-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.album-info { flex: 1; min-width: 0; }
.album-info h1 { font-size: 24px; font-weight: 700; margin: 0; color: #1a1a1a; }
.album-info .desc { color: #888; margin: 4px 0 0; font-size: 14px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.btn-icon {
  padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; background: #fff;
  font-size: 16px; color: #555; cursor: pointer; transition: all 0.2s;
}
.btn-icon:hover { border-color: #4f8ef7; color: #4f8ef7; }
.btn-sort {
  padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff;
  font-size: 13px; color: #555; cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-sort:hover { border-color: #4f8ef7; color: #4f8ef7; }
.btn-upload { padding: 10px 18px; font-size: 14px; }
.btn-share {
  padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px;
  background: #fff; color: #555; font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.btn-share:hover { border-color: #4f8ef7; color: #4f8ef7; background: #f0f5ff; }
.btn-select-mode {
  padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff;
  font-size: 13px; color: #888; cursor: pointer; transition: all 0.2s;
}
.btn-select-mode:hover { border-color: #4f8ef7; color: #4f8ef7; }

/* Select bar */
.select-bar {
  margin-bottom: 12px; padding: 10px 16px;
  background: #f8f9fc; border: 1px solid #e8e8e8; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.select-bar .btn-select-mode {
  width: 100%; padding: 14px; font-size: 16px; font-weight: 600;
  border: 2px dashed #4f8ef7; border-radius: 10px;
  background: #f0f5ff; color: #4f8ef7; cursor: pointer;
  transition: all 0.2s;
}
.select-bar .btn-select-mode:active { background: #dce8ff; transform: scale(0.98); }
.select-bar-active {
  display: flex; align-items: center; justify-content: space-between;
}
.select-bar-info { font-size: 15px; font-weight: 600; color: #4f8ef7; }

/* Stats */
.stats-bar { font-size: 13px; color: #999; margin-bottom: 20px; }
.selected-hint { color: #4f8ef7; font-weight: 500; }

/* Skeleton */
.skeleton-card { border-radius: 12px; overflow: hidden; background: #fff; padding-bottom: 12px; }
.skeleton-text { height: 14px; width: 80%; margin: 10px 12px 0; }
.skeleton-text-short { height: 11px; width: 50%; margin: 6px 12px 0; }

/* Empty */
.empty-state { text-align: center; padding: 80px 20px; }
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-state p { color: #999; font-size: 15px; margin: 0; }
.empty-sub { font-size: 13px !important; color: #bbb !important; margin-top: 6px !important; }
.empty-state .btn-primary { margin-top: 20px; }

/* Groups */
.photo-group { margin-bottom: 28px; }
.group-title { font-size: 15px; font-weight: 600; color: #555; margin: 0 0 12px; padding-left: 4px; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }

/* Select mode */
.photo-card-wrapper { position: relative; }
.photo-card-wrapper.selected { outline: 3px solid #4f8ef7; border-radius: 12px; }
.select-check {
  position: absolute; top: 6px; left: 6px; z-index: 5;
  width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff;
  background: rgba(0,0,0,0.4); box-shadow: 0 1px 4px rgba(0,0,0,0.2); color: #fff; font-size: 13px;
  display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
}
.photo-card-wrapper.selected .select-check { background: #4f8ef7; border-color: #4f8ef7; }

/* Batch bar */
.batch-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 14px 20px; background: #fff; box-shadow: 0 -2px 16px rgba(0,0,0,0.08);
}
.btn-select-all {
  padding: 10px 20px; border: 1px solid #d9d9d9; border-radius: 8px;
  background: #fff; color: #555; font-size: 14px; cursor: pointer;
}
.btn-move {
  padding: 10px 20px; border: 1px solid #4f8ef7; border-radius: 8px;
  background: #fff; color: #4f8ef7; font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.btn-move:hover { background: #f0f5ff; }
.btn-danger {
  padding: 10px 24px; border: none; border-radius: 8px;
  background: #e53e3e; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-danger:hover { background: #dc2626; }

@media (max-width: 640px) {
  .album-view { padding: 0 0 32px; }
  .album-header {
    position: sticky; top: 0; z-index: 30; background: #f5f6fa;
    padding: 12px; margin-bottom: 8px; gap: 6px;
  }
  .album-info h1 { font-size: 20px; }
  .btn-label { display: none; }
  .btn-upload, .btn-share, .btn-icon { padding: 10px 12px; font-size: 16px; }
  .btn-sort { padding: 8px 10px; font-size: 12px; }
  .select-bar { margin: 0 12px 12px; }
  .select-bar .btn-select-mode { padding: 16px; font-size: 17px; }
  .stats-bar { padding: 0 12px; }
  .photo-group { padding: 0 12px; }
  .empty-state { padding: 80px 12px; }
  .photo-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .select-check { width: 32px; height: 32px; font-size: 18px; top: 8px; left: 8px; }
  .batch-bar { padding: 12px 16px; gap: 8px; flex-wrap: wrap; }
  .batch-bar button { padding: 12px 16px; font-size: 15px; min-height: 44px; }
}
</style>
