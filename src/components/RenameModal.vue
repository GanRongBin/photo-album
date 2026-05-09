<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>重命名</h2>
      <form @submit.prevent="handleSubmit">
        <input v-model="name" type="text" :placeholder="oldName" maxlength="100" autofocus class="name-input" />
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">取消</button>
          <button type="submit" class="btn-primary" :disabled="!name.trim() || submitting">确定</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from '../composables/useToast.js'
import { renamePhoto } from '../api/index.js'

const props = defineProps({ albumId: String, photoId: String, oldName: String })
const emit = defineEmits(['close', 'done'])
const { toast } = useToast()
const name = ref(props.oldName || '')
const submitting = ref(false)

async function handleSubmit() {
  if (!name.value.trim()) return
  submitting.value = true
  try {
    await renamePhoto(props.albumId, props.photoId, name.value.trim())
    toast('已重命名', 'success')
    emit('done')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 120;
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal { background: #fff; border-radius: 16px; padding: 24px; width: 360px; max-width: 100%; }
.modal h2 { margin: 0 0 16px; font-size: 18px; font-weight: 600; }
.name-input { width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 8px; font-size: 15px; outline: none; font-family: inherit; }
.name-input:focus { border-color: #4f8ef7; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: 20px 20px 0 0; padding: 24px 20px 32px; width: 100%; }
}
</style>
