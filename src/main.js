import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

createApp(App).use(router).mount('#app')
