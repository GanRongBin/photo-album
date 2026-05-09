<template>
  <div
    class="photo-card"
    @click="$emit('click')"
    @contextmenu.prevent="showMenu"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @touchmove="onTouchMove"
  >
    <div class="photo-img-wrap">
      <video
        v-if="isVideo"
        ref="videoEl"
        :src="photo.url"
        class="photo-thumb-video"
        preload="auto"
        muted
        playsinline
        loop
        @loadeddata="onVideoLoaded"
        @error="onVideoError"
      ></video>
      <img v-else :src="photo.url" alt="" loading="lazy" class="photo-thumb-img" />
      <div v-if="isVideo && !videoReady" class="video-placeholder">🎬</div>
      <div v-if="isVideo && videoReady" class="video-play-badge">▶</div>
      <!-- Three-dot menu button -->
      <button class="btn-menu" @click.stop="showMenu" title="更多">⋮</button>
      <!-- Dropdown menu -->
      <div v-if="menuVisible" class="action-menu" @click.stop>
        <button @click="doRename">✎ 重命名</button>
        <button @click.stop="$emit('move')">↗ 移动到</button>
        <button class="danger" @click.stop="$emit('delete')">✕ 删除</button>
      </div>
    </div>
    <div class="photo-info">
      <div class="photo-name">{{ photo.name }}</div>
      <div class="photo-date">{{ formatTime(photo.createdAt) }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
const props = defineProps({ photo: Object })
const emit = defineEmits(['click', 'delete', 'move', 'rename'])

const isVideo = computed(() => /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(props.photo?.name || ''))
const menuVisible = ref(false)
const videoEl = ref(null)
const videoReady = ref(false)

let touchTimer = null
let touchMoved = false

function onVideoLoaded() {
  const el = videoEl.value
  if (!el) return
  el.play().then(() => {
    el.pause()
    el.currentTime = 0
    videoReady.value = true
  }).catch(() => {
    // autoplay blocked or other error, keep placeholder
  })
}

function onVideoError() {
  // video failed to load, keep showing placeholder
}

onMounted(() => {
  if (isVideo.value && videoEl.value) {
    // trigger load
    videoEl.value.load()
  }
})

function onTouchStart() {
  touchMoved = false
  touchTimer = setTimeout(() => {
    if (!touchMoved) showMenu()
  }, 500)
}

function onTouchEnd() {
  clearTimeout(touchTimer)
}

function onTouchMove() {
  touchMoved = true
  clearTimeout(touchTimer)
}

function showMenu() {
  menuVisible.value = !menuVisible.value
}

function doRename() {
  menuVisible.value = false
  emit('rename')
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', () => { menuVisible.value = false })
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return `今天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (diff < 172800000 && d.getDate() === now.getDate() - 1) {
    return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.photo-card {
  border-radius: 12px; overflow: hidden; background: #fff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06); cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  -webkit-touch-callout: none;
  user-select: none; -webkit-user-select: none;
}
.photo-card:active { transform: scale(0.97); }
.photo-img-wrap {
  aspect-ratio: 4 / 3; overflow: hidden; position: relative; background: #f0f2f5;
}
.photo-thumb-img, .photo-thumb-video {
  width: 100%; height: 100%; object-fit: cover; pointer-events: none;
}
.photo-thumb-video::-webkit-media-controls { display: none !important; }
.video-placeholder {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-size: 40px; pointer-events: none; opacity: 0.5;
}
.video-play-badge {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: #fff; font-size: 14px;
  display: flex; align-items: center; justify-content: center; pointer-events: none;
}
.btn-menu {
  position: absolute; top: 4px; right: 4px; z-index: 3;
  width: 28px; height: 28px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.85); color: #555;
  font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12); line-height: 1; opacity: 0.4; transition: opacity 0.2s;
}
.photo-card:hover .btn-menu, .photo-card:active .btn-menu { opacity: 1; }
@media (hover: none) { .btn-menu { opacity: 1; } }

/* Dropdown */
.action-menu {
  position: absolute; top: 36px; right: 4px; z-index: 5;
  background: #fff; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.14);
  overflow: hidden; min-width: 120px; animation: menuIn 0.15s ease;
}
@keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.action-menu button {
  display: block; width: 100%; padding: 10px 16px; border: none; background: #fff;
  font-size: 13px; color: #333; cursor: pointer; text-align: left; font-family: inherit;
  transition: background 0.1s;
}
.action-menu button:hover { background: #f5f6fa; }
.action-menu button.danger { color: #e53e3e; }
.action-menu button.danger:hover { background: #fef2f2; }

.photo-info { padding: 8px 10px 10px; }
.photo-name {
  font-size: 13px; color: #333; font-weight: 500; line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.photo-date { font-size: 11px; color: #999; margin-top: 2px; }
</style>
