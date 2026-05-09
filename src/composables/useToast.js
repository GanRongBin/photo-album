import { ref } from 'vue'

const toasts = ref([])
let _id = 0

export function useToast() {
  function toast(msg, type = 'info') {
    const id = ++_id
    toasts.value.push({ id, msg, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 3000)
  }

  return { toasts, toast }
}
