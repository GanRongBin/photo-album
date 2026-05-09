<template>
  <div class="home">
    <header class="home-header">
      <div class="title-row">
        <h1>📷 我的相册</h1>
        <span v-if="albums.length" class="count-badge">{{ albums.length }}</span>
      </div>
      <div class="header-actions">
        <button v-if="albums.length > 1" class="btn-sort" @click="toggleSort">
          {{ sortNewest ? '↓ 最新' : '↑ 最早' }}
        </button>
        <button class="btn-primary" @click="showCreateModal = true">+ 新建</button>
      </div>
    </header>

    <div v-if="loading" class="album-grid">
      <div v-for="n in 4" :key="n" class="skeleton-card">
        <div class="skeleton" style="aspect-ratio:1;border-radius:14px 14px 0 0"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text-short"></div>
      </div>
    </div>

    <div v-else-if="sortedAlbums.length === 0" class="empty-state">
      <div class="empty-icon">📁</div>
      <p>还没有相册</p>
      <p class="empty-sub">点击上方按钮创建第一个相册吧</p>
      <button class="btn-primary" @click="showCreateModal = true">+ 新建相册</button>
    </div>

    <div v-else class="album-grid">
      <AlbumCard
        v-for="album in sortedAlbums"
        :key="album.id"
        :album="album"
        @click="$router.push(`/album/${album.id}`)"
        @delete="handleDelete(album)"
      />
    </div>

    <CreateAlbumModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @created="onAlbumCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useToast } from '../composables/useToast.js'
import { useConfirm } from '../composables/useConfirm.js'
import { getAlbums, deleteAlbum } from '../api/index.js'
import AlbumCard from '../components/AlbumCard.vue'
import CreateAlbumModal from '../components/CreateAlbumModal.vue'

const albums = ref([])
const { toast } = useToast()
const { confirm } = useConfirm()
const loading = ref(true)
const sortNewest = ref(true)
const showCreateModal = ref(false)

function toggleSort() { sortNewest.value = !sortNewest.value }

const sortedAlbums = computed(() => {
  return [...albums.value].sort((a, b) => {
    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    return sortNewest.value ? db - da : da - db
  })
})

async function loadAlbums() {
  loading.value = true
  try { albums.value = await getAlbums() }
  catch (e) { toast('加载相册失败: ' + e.message, 'error') }
  finally { loading.value = false }
}

function onAlbumCreated() { showCreateModal.value = false; loadAlbums() }

async function handleDelete(album) {
  if (!await confirm(`确定要删除相册「${album.name}」及其所有照片吗？`, '删除相册')) return
  try { await deleteAlbum(album.id); loadAlbums() }
  catch (e) { toast('删除失败: ' + e.message, 'error') }
}

onMounted(loadAlbums)
</script>

<style scoped>
.home { max-width: 1200px; margin: 0 auto; padding: 24px 24px 48px; }

.home-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
.title-row { display: flex; align-items: center; gap: 10px; }
.home-header h1 { font-size: 28px; font-weight: 700; margin: 0; color: #1a1a1a; }
.count-badge {
  background: #f0f2f5; color: #888; font-size: 13px; padding: 3px 10px; border-radius: 12px;
}
.header-actions { display: flex; gap: 8px; align-items: center; }

.btn-sort {
  padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff;
  font-size: 13px; color: #555; cursor: pointer; transition: all 0.2s;
}
.btn-sort:hover { border-color: #4f8ef7; color: #4f8ef7; }

.empty-state { text-align: center; padding: 80px 20px; }
.empty-icon { font-size: 56px; margin-bottom: 12px; }
.empty-state p { color: #999; font-size: 15px; margin: 0; }
.empty-sub { font-size: 13px !important; color: #bbb !important; margin-top: 6px !important; }
.empty-state .btn-primary { margin-top: 20px; }

.album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }

/* Skeleton */
.skeleton-card { border-radius: 14px; overflow: hidden; background: #fff; padding-bottom: 12px; }
.skeleton-text { height: 14px; width: 80%; margin: 10px 14px 0; }
.skeleton-text-short { height: 11px; width: 50%; margin: 6px 14px 0; }

@media (max-width: 640px) {
  .home { padding: 16px 12px 32px; }
  .home-header h1 { font-size: 22px; }
  .album-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
}
</style>
