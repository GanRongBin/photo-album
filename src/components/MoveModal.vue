<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>移动到...</h2>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="targets.length === 0" class="loading">没有其他相册</div>
      <div v-else class="album-list">
        <button
          v-for="a in targets"
          :key="a.id"
          class="album-option"
          :disabled="moving"
          @click="doMove(a.id)"
        >
          <span class="album-name">{{ a.name }}</span>
          <span class="album-count">{{ a.photoCount }} 张</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from '../composables/useToast.js'
import { getAlbums, movePhoto } from '../api/index.js'

const props = defineProps({
  albumId: String,
  photoIds: Array,
})
const emit = defineEmits(['close', 'moved'])

const { toast } = useToast()
const targets = ref([])
const loading = ref(true)
const moving = ref(false)

onMounted(async () => {
  try {
    const all = await getAlbums()
    targets.value = all.filter(a => a.id !== props.albumId)
  } catch { /* ignore */ }
  finally { loading.value = false }
})

async function doMove(toAlbumId) {
  if (moving.value) return
  moving.value = true
  try {
    for (const id of props.photoIds) {
      await movePhoto(props.albumId, id, toAlbumId)
    }
    toast(`已移动 ${props.photoIds.length} 项`, 'success')
    emit('moved')
  } catch (e) {
    toast('移动失败: ' + e.message, 'error')
  } finally {
    moving.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 110;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal {
  background: #fff; border-radius: 16px; padding: 24px; width: 380px; max-width: 100%;
}
.modal h2 { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
.loading { text-align: center; padding: 24px; color: #999; font-size: 14px; }
.album-list { display: flex; flex-direction: column; gap: 8px; max-height: 50vh; overflow-y: auto; }
.album-option {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; border: 1px solid #eee; border-radius: 10px;
  background: #fff; cursor: pointer; transition: all 0.15s; width: 100%; text-align: left;
  font-family: inherit;
}
.album-option:hover { border-color: #4f8ef7; background: #f8faff; }
.album-option:disabled { opacity: 0.5; cursor: not-allowed; }
.album-name { font-size: 15px; font-weight: 500; color: #333; }
.album-count { font-size: 12px; color: #999; }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 14px; }

@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: 20px 20px 0 0; padding: 24px 20px 32px; width: 100%; }
}
</style>
