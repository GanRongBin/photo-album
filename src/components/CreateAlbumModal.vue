<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>新建相册</h2>
      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label>相册名称 <span class="required">*</span></label>
          <input v-model="name" type="text" placeholder="请输入相册名称" maxlength="50" required autofocus />
        </div>
        <div class="field">
          <label>描述（可选）</label>
          <textarea v-model="description" placeholder="添加一段描述..." rows="3" maxlength="200"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" @click="$emit('close')">取消</button>
          <button type="submit" class="btn-primary" :disabled="!name.trim() || submitting">
            {{ submitting ? '创建中...' : '创建' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useToast } from '../composables/useToast.js'
import { createAlbum } from '../api/index.js'

const emit = defineEmits(['close', 'created'])
const { toast } = useToast()
const name = ref('')
const description = ref('')
const submitting = ref(false)

async function handleSubmit() {
  if (!name.value.trim() || submitting.value) return
  submitting.value = true
  try {
    await createAlbum(name.value.trim(), description.value.trim())
    emit('created')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    submitting.value = false
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
  background: #fff; border-radius: 16px; padding: 28px 32px; width: 420px; max-width: 100%;
}
.modal h2 { margin: 0 0 20px; font-size: 20px; font-weight: 600; }
.field { margin-bottom: 16px; }
.field label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: #333; }
.required { color: #e53e3e; }
input, textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 8px;
  font-size: 14px; font-family: inherit; box-sizing: border-box; outline: none;
  transition: border-color 0.2s;
}
input:focus, textarea:focus { border-color: #4f8ef7; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }

@media (max-width: 640px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: 20px 20px 0 0; padding: 24px 20px 32px; width: 100%; }
}
</style>
