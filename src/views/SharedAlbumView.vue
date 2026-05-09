<template>
  <div class="album-view">
    <header class="album-header">
      <button class="btn-back" @click="$router.push('/')">←</button>
      <div class="album-info">
        <h1>{{ album?.name }} <span class="shared-badge">已分享</span></h1>
        <p v-if="album?.description" class="desc">{{ album.description }}</p>
      </div>
      <div class="header-actions">
        <button v-if="sortedPhotos.length > 1" class="btn-sort" @click="toggleSort">
          {{ sortNewest ? '↓ 最新' : '↑ 最早' }}
        </button>
        <button class="btn-primary btn-upload" @click="showUploadModal = true">
          +<span class="btn-label"> 上传</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="photo-grid">
      <div v-for="n in 6" :key="n" class="skeleton-card">
        <div class="skeleton" style="aspect-ratio:4/3"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text-short"></div>
      </div>
    </div>

    <div v-else-if="error" class="empty-state">
      <p>{{ error }}</p>
      <button class="btn-back" style="margin-top:16px" @click="$router.push('/')">回到首页</button>
    </div>

    <div v-else-if="!groupedPhotos.length" class="empty-state">
      <div class="empty-icon">📷</div>
      <p>相册还是空的</p>
      <p class="empty-sub">上传第一张照片吧</p>
      <button class="btn-primary" @click="showUploadModal = true">+ 上传照片</button>
    </div>

    <div v-else>
      <div class="stats-bar">{{ album?.photos.length }} 张照片</div>
      <div v-for="group in groupedPhotos" :key="group.label" class="photo-group">
        <h2 class="group-title">{{ group.label }}</h2>
        <div class="photo-grid">
          <PhotoCard
            v-for="photo in group.photos"
            :key="photo.id"
            :photo="photo"
            @click="openLightbox(photo)"
            @delete="handleDeletePhoto(photo)"
            @move="photoToMove = photo.id; showMoveModal = true"
            @rename="photoToRename = photo; showRenameModal = true"
          />
        </div>
      </div>
    </div>

    <UploadPhotoModal
      v-if="showUploadModal"
      :share-code="code"
      @close="showUploadModal = false"
      @uploaded="onPhotoUploaded"
    />
    <PhotoLightbox
      v-if="lightboxIndex !== null"
      :photo="album.photos[lightboxIndex]"
      :photos="album.photos"
      :total="album.photos.length"
      :index="lightboxIndex"
      @close="lightboxIndex = null"
      @prev="lightboxIndex--"
      @next="lightboxIndex++"
    />
    <MoveModal
      v-if="showMoveModal"
      :album-id="album?.id"
      :photo-ids="photoToMove ? [photoToMove] : []"
      @close="showMoveModal = false; photoToMove = null"
      @moved="showMoveModal = false; photoToMove = null; loadAlbum()"
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
import { getSharedAlbum, deletePhotoFromShared } from '../api/index.js'
import PhotoCard from '../components/PhotoCard.vue'
import UploadPhotoModal from '../components/UploadPhotoModal.vue'
import PhotoLightbox from '../components/PhotoLightbox.vue'
import MoveModal from '../components/MoveModal.vue'
import RenameModal from '../components/RenameModal.vue'

const route = useRoute()
const { toast } = useToast()
const { confirm } = useConfirm()
const code = route.params.code
const album = ref(null)
const loading = ref(true)
const error = ref('')
const sortNewest = ref(true)
const showUploadModal = ref(false)
const showMoveModal = ref(false)
const showRenameModal = ref(false)
const photoToRename = ref(null)
const photoToMove = ref(null)
const lightboxIndex = ref(null)

function toggleSort() { sortNewest.value = !sortNewest.value }

const sortedPhotos = computed(() => {
  if (!album.value?.photos) return []
  return [...album.value.photos].sort((a, b) => {
    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    return sortNewest.value ? db - da : da - db
  })
})

const groupedPhotos = computed(() => {
  if (!sortedPhotos.value.length) return []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups = []
  const todayPhotos = []
  const yesterdayPhotos = []
  const weekPhotos = []
  const earlierPhotos = []

  for (const p of sortedPhotos.value) {
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
  loading.value = true; error.value = ''
  try { album.value = await getSharedAlbum(code) }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}

function onPhotoUploaded() { showUploadModal.value = false; loadAlbum() }
function openLightbox(photo) { lightboxIndex.value = album.value.photos.indexOf(photo) }

async function handleDeletePhoto(photo) {
  if (!await confirm('确定要删除这张照片吗？', '删除照片')) return
  try { await deletePhotoFromShared(code, photo.id); loadAlbum() }
  catch (e) { toast('删除失败: ' + e.message, 'error') }
}

onMounted(loadAlbum)
</script>

<style scoped>
.album-view { max-width: 1200px; margin: 0 auto; padding: 24px 24px 48px; }

.album-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.album-info { flex: 1; min-width: 0; }
.album-info h1 { font-size: 24px; font-weight: 700; margin: 0; color: #1a1a1a; }
.album-info .desc { color: #888; margin: 4px 0 0; font-size: 14px; }
.shared-badge {
  display: inline-block; font-size: 12px; font-weight: 500;
  background: #f0f5ff; color: #4f8ef7; padding: 2px 10px;
  border-radius: 12px; vertical-align: middle; margin-left: 8px;
}
.header-actions { display: flex; gap: 8px; align-items: center; }

.btn-sort {
  padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff;
  font-size: 13px; color: #555; cursor: pointer; transition: all 0.2s;
}
.btn-sort:hover { border-color: #4f8ef7; color: #4f8ef7; }
.btn-upload { padding: 10px 18px; font-size: 14px; }

.stats-bar { font-size: 13px; color: #999; margin-bottom: 20px; }

.empty-state { text-align: center; padding: 80px 20px; }
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-state p { color: #999; font-size: 15px; margin: 0; }
.empty-sub { font-size: 13px !important; color: #bbb !important; margin-top: 6px !important; }
.empty-state .btn-primary { margin-top: 20px; }

.photo-group { margin-bottom: 28px; }
.group-title { font-size: 15px; font-weight: 600; color: #555; margin: 0 0 12px; padding-left: 4px; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }

/* Skeleton */
.skeleton-card { border-radius: 12px; overflow: hidden; background: #fff; padding-bottom: 12px; }
.skeleton-text { height: 14px; width: 80%; margin: 10px 12px 0; }
.skeleton-text-short { height: 11px; width: 50%; margin: 6px 12px 0; }

@media (max-width: 640px) {
  .album-view { padding: 0 0 32px; }
  .album-header {
    position: sticky; top: 0; z-index: 30; background: #f5f6fa;
    padding: 12px; margin-bottom: 8px; gap: 6px;
  }
  .album-info h1 { font-size: 20px; }
  .btn-label { display: none; }
  .btn-upload { padding: 10px 12px; font-size: 16px; }
  .btn-sort { padding: 8px 10px; font-size: 12px; }
  .stats-bar { padding: 0 12px; }
  .photo-group { padding: 0 12px; }
  .empty-state { padding: 80px 12px; }
  .photo-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
}
</style>
