<template>
  <router-view v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>
  <Toast />
  <ConfirmDialog />
  <BackToTop />
</template>

<script setup>
import Toast from './components/Toast.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import BackToTop from './components/BackToTop.vue'
</script>

<style>
.page-enter-active,
.page-leave-active { transition: opacity 0.15s ease; }
.page-enter-from,
.page-leave-to { opacity: 0; }
</style>
