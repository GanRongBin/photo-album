<template>
  <Transition name="btt">
    <button v-if="visible" class="back-to-top" @click="scrollTop" title="回到顶部">↑</button>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)

function onScroll() { visible.value = window.scrollY > 400 }

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<style scoped>
.back-to-top {
  position: fixed; bottom: 24px; right: 20px; z-index: 90;
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: #fff; color: #555; font-size: 20px; cursor: pointer;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12); transition: all 0.2s;
}
.back-to-top:active { transform: scale(0.9); background: #f0f2f5; }
.btt-enter-active { transition: all 0.25s ease; }
.btt-leave-active { transition: all 0.15s ease; }
.btt-enter-from, .btt-leave-to { opacity: 0; transform: translateY(12px); }
</style>
