<template>
  <div
    class="lightbox-overlay"
    @click.self="$emit('close')"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <button class="btn-close" @click="$emit('close')">✕</button>

    <!-- Prev button -->
    <button v-if="hasPrev" class="nav-btn nav-prev" @click.stop="goPrev">
      ‹
    </button>

    <div class="lightbox-body">
      <video v-if="isVideo" :src="photo.url" class="lightbox-video" controls autoplay playsinline />
      <img v-else :src="photo.url" alt="" class="lightbox-img" />
    </div>

    <!-- Next button -->
    <button v-if="hasNext" class="nav-btn nav-next" @click.stop="goNext">
      ›
    </button>

    <!-- Bottom bar -->
    <div class="lightbox-bar">
      <span class="lightbox-name">{{ photo.name }}</span>
      <span v-if="total > 1" class="lightbox-counter">{{ index + 1 }} / {{ total }}</span>
      <button class="btn-download" @click="download" title="下载">⬇</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  photo: Object,
  photos: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'prev', 'next'])

const isVideo = computed(() => /\.(mp4|mov|avi|mkv|webm|3gp)$/i.test(props.photo?.name || ''))

const hasPrev = computed(() => props.total > 1 && props.index > 0)
const hasNext = computed(() => props.total > 1 && props.index < props.total - 1)

function goPrev() { emit('prev') }
function goNext() { emit('next') }

function onKey(e) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') goPrev()
  if (e.key === 'ArrowRight') goNext()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

let touchStartX = 0
function onTouchStart(e) { touchStartX = e.changedTouches[0].clientX }
function onTouchEnd(e) {
  const diff = touchStartX - e.changedTouches[0].clientX
  if (Math.abs(diff) > 60) {
    if (diff > 0 && hasNext.value) goNext()
    else if (diff < 0 && hasPrev.value) goPrev()
  }
}

async function download() {
  try {
    const res = await fetch(props.photo.url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = props.photo.name || 'photo'
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(props.photo.url, '_blank')
  }
}
</script>

<style scoped>
.lightbox-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}

.btn-close {
  position: absolute; top: 16px; right: 16px; z-index: 10;
  width: 40px; height: 40px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.12); color: #fff;
  font-size: 20px; cursor: pointer; transition: background 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.btn-close:hover { background: rgba(255,255,255,0.25); }

.lightbox-body {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; padding: 60px 64px 80px;
}

.lightbox-img {
  max-width: 100%; max-height: 100%; object-fit: contain;
  border-radius: 4px; user-select: none; -webkit-user-select: none;
}
.lightbox-video {
  max-width: 100%; max-height: 100%; border-radius: 4px; outline: none;
}

/* Nav buttons */
.nav-btn {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 10;
  width: 48px; height: 48px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.10); color: #fff;
  font-size: 32px; cursor: pointer; transition: background 0.2s;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.nav-btn:hover { background: rgba(255,255,255,0.22); }
.nav-prev { left: 8px; }
.nav-next { right: 8px; }

/* Bottom bar */
.lightbox-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 20px; background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
}
.lightbox-name {
  color: #fff; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
}
.lightbox-counter { color: rgba(255,255,255,0.65); font-size: 13px; white-space: nowrap; }
.btn-download {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.12); color: #fff;
  font-size: 16px; cursor: pointer; transition: background 0.2s;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.btn-download:hover { background: rgba(255,255,255,0.25); }

@media (max-width: 640px) {
  .lightbox-body { padding: 48px 12px 70px; }
  .nav-btn { width: 36px; height: 36px; font-size: 24px; }
  .nav-prev { left: 2px; }
  .nav-next { right: 2px; }
}
</style>
