<template>
  <Transition name="confirm">
    <div v-if="confirmState.show" class="confirm-overlay" @click.self="cancel">
      <div class="confirm-box">
        <h3>{{ confirmState.title }}</h3>
        <p>{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="btn-cancel" @click="cancel">取消</button>
          <button class="btn-primary" @click="ok">确定</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useConfirm } from '../composables/useConfirm.js'

const { confirmState } = useConfirm()

function ok() {
  confirmState.value.resolve?.(true)
  confirmState.value = { show: false, title: '', message: '', resolve: null }
}

function cancel() {
  confirmState.value.resolve?.(false)
  confirmState.value = { show: false, title: '', message: '', resolve: null }
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.confirm-box {
  background: #fff; border-radius: 16px; padding: 28px; width: 340px; max-width: 100%;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15); text-align: center;
}
.confirm-box h3 { margin: 0 0 10px; font-size: 18px; font-weight: 600; }
.confirm-box p { margin: 0 0 22px; font-size: 14px; color: #666; line-height: 1.5; }
.confirm-actions { display: flex; justify-content: center; gap: 12px; }
.confirm-actions button { min-width: 90px; }

.confirm-enter-active { transition: all 0.2s ease; }
.confirm-leave-active { transition: all 0.15s ease; }
.confirm-enter-from { opacity: 0; }
.confirm-enter-from .confirm-box { transform: scale(0.9); }
.confirm-leave-to { opacity: 0; }
</style>
