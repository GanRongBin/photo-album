import { ref } from 'vue'

const state = ref({ show: false, title: '', message: '', resolve: null })

export function useConfirm() {
  function confirm(message, title = '确认') {
    return new Promise((resolve) => {
      state.value = { show: true, title, message, resolve }
    })
  }

  return { confirmState: state, confirm }
}
