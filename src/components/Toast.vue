<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" :class="['toast', 'toast-' + t.type]">
        <span class="toast-icon">{{ icon(t.type) }}</span>
        <span>{{ t.msg }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToast } from '../composables/useToast.js'

const { toasts } = useToast()

function icon(type) {
  if (type === 'success') return '✓'
  if (type === 'error') return '✗'
  return 'ℹ'
}
</script>

<style scoped>
.toast-container {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 9999; display: flex; flex-direction: column; gap: 8px;
  pointer-events: none; max-width: 90vw; width: 360px;
}
.toast {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  border-radius: 10px; font-size: 14px; font-weight: 500; line-height: 1.4;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12); pointer-events: auto;
  backdrop-filter: blur(8px);
}
.toast-icon { font-size: 16px; flex-shrink: 0; }
.toast-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.toast-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.toast-info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }

.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateY(-12px); }
.toast-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
