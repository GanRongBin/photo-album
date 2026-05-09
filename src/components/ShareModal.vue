<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>分享相册</h2>

      <div v-if="shareCode" class="share-active">
        <p class="share-hint">任何人通过以下链接都可以查看和编辑此相册：</p>
        <div class="share-url-row">
          <input :value="shareUrl" readonly class="url-input" ref="urlInput" />
          <button class="btn-primary btn-copy" @click="copyLink">
            {{ copied ? '已复制' : '复制链接' }}
          </button>
        </div>
        <button class="btn-danger" @click="handleDisable">关闭分享</button>
      </div>

      <div v-else class="share-inactive">
        <p class="share-hint">开启分享后，会生成一个链接，任何人通过链接都能查看和编辑此相册。</p>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">取消</button>
          <button class="btn-primary" :disabled="loading" @click="handleEnable">
            {{ loading ? '生成中...' : '开启分享' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import { useToast } from '../composables/useToast.js'
import { useConfirm } from '../composables/useConfirm.js'
import { enableShare, disableShare } from '../api/index.js'

const props = defineProps({
  albumId: String,
  shareCode: { type: String, default: null },
})
const emit = defineEmits(['close', 'updated'])
const { toast } = useToast()
const { confirm } = useConfirm()

const urlInput = ref(null)
const copied = ref(false)
const loading = ref(false)

const shareUrl = computed(() =>
  window.location.origin + '/shared/' + props.shareCode
)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    urlInput.value?.select()
  }
}

async function handleEnable() {
  loading.value = true
  try {
    await enableShare(props.albumId)
    emit('updated')
  } catch (e) {
    toast('开启分享失败: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function handleDisable() {
  if (!await confirm('关闭分享后，之前的分享链接将立即失效，确定关闭吗？', '关闭分享')) return
  try {
    await disableShare(props.albumId)
    emit('updated')
  } catch (e) {
    toast('关闭分享失败: ' + e.message, 'error')
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.modal {
  background: #fff; border-radius: 16px; padding: 28px 32px; width: 480px; max-width: 100%;
}
.modal h2 { margin: 0 0 20px; font-size: 20px; font-weight: 600; }
.share-hint { font-size: 14px; color: #666; margin: 0 0 16px; line-height: 1.6; }
.share-url-row { display: flex; gap: 8px; margin-bottom: 16px; }
.url-input {
  flex: 1; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 8px;
  font-size: 13px; font-family: monospace; background: #f9f9f9; outline: none;
}
.btn-copy { flex-shrink: 0; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn-danger {
  padding: 10px 22px; border: 1px solid #e53e3e; border-radius: 8px;
  background: #fff; color: #e53e3e; font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.btn-danger:hover { background: #fef2f2; }

@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: 20px 20px 0 0; padding: 24px 20px 32px; width: 100%; }
  .share-url-row { flex-direction: column; }
  .btn-copy { width: 100%; }
}
</style>
