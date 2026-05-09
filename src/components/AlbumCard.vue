<template>
  <div class="album-card">
    <div class="card-cover">
      <img v-if="album.coverUrl" :src="album.coverUrl" alt="" />
      <div v-else class="no-cover">
        <span class="no-cover-icon">📷</span>
      </div>
      <div class="cover-gradient"></div>
      <button class="btn-delete" title="删除相册" @click.stop="$emit('delete')">×</button>
    </div>
    <div class="card-body">
      <h3 class="card-title">{{ album.name }}</h3>
      <div class="card-meta">
        <span>{{ album.photoCount }} 张</span>
        <span v-if="album.createdAt" class="card-date">{{ formatDate(album.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ album: Object })
defineEmits(['delete'])

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.album-card {
  border-radius: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 2px 16px rgba(0,0,0,0.07); cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.album-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
.card-cover {
  aspect-ratio: 1; background: #e8ecf1; position: relative; overflow: hidden;
}
.card-cover img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
.album-card:hover .card-cover img { transform: scale(1.05); }
.no-cover {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #e8ecf1 0%, #dce2e8 100%);
}
.no-cover-icon { font-size: 48px; opacity: 0.5; }
.cover-gradient {
  position: absolute; bottom: 0; left: 0; right: 0; height: 60px;
  background: linear-gradient(to top, rgba(0,0,0,0.3), transparent);
  pointer-events: none;
}
.btn-delete {
  position: absolute; top: 10px; right: 10px;
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.85); color: #555;
  font-size: 18px; cursor: pointer; opacity: 0; transition: opacity 0.2s;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.album-card:hover .btn-delete { opacity: 1; }
.btn-delete:hover { background: #e53e3e; color: #fff; }
.card-body { padding: 14px 16px 16px; }
.card-title { margin: 0; font-size: 15px; font-weight: 600; color: #1a1a1a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta { margin-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #999; }
.card-date { font-size: 11px; }
</style>
